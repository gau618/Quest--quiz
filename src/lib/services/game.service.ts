import prisma from '../prisma/client';
import { Difficulty, GameMode, GameStatus } from '@prisma/client';
import { socketService } from '../websocket/socket.service';
import { redis } from '../redis/client';
import { calculateElo } from '../game/elo';

const QUESTIONS_PER_BATCH = 20; // Set to 20 as per your initial context

// Defines the structure of a question object
interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  createdAt?: Date;
}

// FIX: GameState now holds a single shared questions array and per-user progress
interface GameState {
  questions: Question[]; // A single, shared array of questions for the session
  userProgress: Record<string, number>; // Tracks each user's current index in the questions array
  scores: Record<string, number>;
  difficulty: Difficulty;
  endTime: number;
}

// Bot logic remains unchanged
function getBotAccuracy(elo: number): number {
  const minElo = 600;
  const maxElo = 2800;
  const minAcc = 0.70;
  const maxAcc = 0.99;
  if (elo <= minElo) return minAcc;
  if (elo >= maxElo) return maxAcc;
  return minAcc + ((elo - minElo) / (maxElo - minElo)) * (maxAcc - minAcc);
}

function getBotDelay(elo: number): number {
  const minElo = 600;
  const maxElo = 2800;
  const maxDelay = 4000;
  const minDelay = 1000;
  if (elo <= minElo) return maxDelay;
  if (elo >= maxElo) return minDelay;
  return maxDelay - ((elo - minElo) / (maxElo - minElo)) * (maxDelay - minDelay);
}

class GameService {
  private getDifficultyFromElo = (elo: number): Difficulty => {
    if (elo < 1300) return Difficulty.EASY;
    if (elo < 1600) return Difficulty.MEDIUM;
    return Difficulty.HARD;
  };

  // Fetches and sorts questions deterministically
  // Fetches a random but deterministically ordered batch of questions
  private fetchQuestions = async (difficulty: Difficulty, count: number): Promise<Question[]> => {
    // 1. Get the total number of questions for the given difficulty
    const total = await prisma.question.count({
      where: { difficulty },
    });

    // 2. Calculate a random starting point (skip)
    // This ensures that if we have more questions than we need, we start from a random place.
    const skip = total > count ? Math.floor(Math.random() * (total - count)) : 0;
    
    console.log(`[fetchQuestions] Fetching ${count} questions for difficulty: ${difficulty}, skipping ${skip} out of ${total}`);

    // 3. Fetch the questions using the random skip but with deterministic ordering
    const rawQuestions = await prisma.question.findMany({
      where: { difficulty },
      take: count,
      skip: skip, // Use the calculated random skip
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], // This is still crucial for deterministic order
      select: {
        id: true,
        text: true,
        createdAt: true,
        options: { select: { id: true, text: true, isCorrect: true } },
      },
    });

    return rawQuestions.map(q => ({
      ...q,
      correctOptionId: q.options.find(opt => opt.isCorrect)!.id,
      options: q.options.map(({ isCorrect, ...rest }) => rest),
    }));
  };


  private async createSession(playerIds: string[], botCount: number, duration: number, difficulty: Difficulty) {
    // Bot creation logic
    const botUserIds: string[] = [];
    if (botCount > 0) {
      for (let i = 0; i < botCount; i++) {
        const botId = `BOT_${Date.now()}_${i}`;
        botUserIds.push(botId);
        await prisma.userProfile.create({
          data: { userId: botId, eloRating: 1200, onboardingState: {} },
        });
      }
    }

    // Session creation logic
    const allParticipantIds = [...playerIds, ...botUserIds];
    const session = await prisma.gameSession.create({
      data: {
        mode: GameMode.QUICK_DUEL,
        status: GameStatus.ACTIVE,
        participants: {
          create: allParticipantIds.map(id => ({ userId: id, isBot: id.startsWith('BOT_') })),
        },
      },
      include: { participants: { include: { userProfile: true } } },
    });

    // --- FIX: Fetch questions ONCE and store as a single array ---
    const questions = await this.fetchQuestions(difficulty, QUESTIONS_PER_BATCH);

    // --- FIX: Initialize progress for each participant to the start (index 0) ---
    const userProgress: Record<string, number> = {};
    for (const participant of session.participants) {
      userProgress[participant.id] = 0;
    }

    // Create the game state with the shared questions array and per-user progress
    const gameState: GameState = {
      questions,
      userProgress,
      scores: session.participants.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
      difficulty,
      endTime: Date.now() + duration * 60 * 1000,
    };

    await redis.set(`game_state:${session.id}`, JSON.stringify(gameState), 'EX', duration * 60 + 30);

    // Notify users that the match is found
    socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), 'match:found', {
      sessionId: session.id, duration, difficulty,
      players: session.participants.map(p => ({
        participantId: p.id,
        userId: p.userId,
        username: p.isBot ? `Bot ${Math.floor(Math.random() * 1000)}` : p.userProfile?.username,
        avatarUrl: p.userProfile?.avatarUrl,
        elo: p.userProfile?.eloRating,
      })),
    });

    // --- FIX: Start the game for ALL participants by sending them the first question ---
    for (const participant of session.participants) {
      this.sendNextQuestion(session.id, participant.id);
    }

    setTimeout(() => this.endGame(session.id), duration * 60 * 1000);
  }

  public async startDuel(player1Id: string, player2Id: string, duration: number) {
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [player1Id, player2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.createSession([player1Id, player2Id], 0, duration, this.getDifficultyFromElo(avgElo));
  }

  public async startBotDuel(playerId: string, duration: number) {
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: playerId } });
    await this.createSession([playerId], 1, duration, this.getDifficultyFromElo(profile.eloRating));
  }

  // --- FIX: Serves the next question based on the user's progress index ---
  public async sendNextQuestion(sessionId: string, participantId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    const gameState: GameState = JSON.parse(gameStateStr);

    if (Date.now() >= gameState.endTime) return;

    // Get the user's current question index
    const idx = gameState.userProgress[participantId] ?? 0;
    // Get the question from the shared array
    const question = gameState.questions[idx];

    if (question) {
      const participant = await prisma.gameParticipant.findUnique({ where: { id: participantId } });
      if (participant?.isBot) {
        this._simulateBotAnswer(sessionId, participantId, question);
      } else {
        socketService.emitToParticipant(participantId, 'question:new', question);
      }
    } else {
      // If no question exists at that index, the user has finished
      socketService.emitToParticipant(participantId, 'game:end', { reason: 'No more questions' });
    }
  }

  // --- FIX: Handles an answer and increments the user's progress ---
  public async handleAnswer(sessionId: string, participantId: string, questionId: string, chosenOptionId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    let gameState: GameState = JSON.parse(gameStateStr);
    const question = await prisma.question.findUnique({ where: { id: questionId }, include: { options: true } });
    if (!question) return;

    const correctOption = question.options.find(o => o.isCorrect)?.id;
    if (correctOption === chosenOptionId) {
      gameState.scores[participantId] = (gameState.scores[participantId] || 0) + 10;
      socketService.emitToRoom(sessionId, 'score:update', gameState.scores);
    }

    // Increment only this user's progress index. Do not mutate the array.
    gameState.userProgress[participantId] = (gameState.userProgress[participantId] ?? 0) + 1;
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');

    await this.sendNextQuestion(sessionId, participantId);
  }

  // --- FIX: Handles a skip and increments the user's progress ---
  public async handleSkip(sessionId: string, participantId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    let gameState: GameState = JSON.parse(gameStateStr);

    // Increment only this user's progress index. Do not mutate the array.
    gameState.userProgress[participantId] = (gameState.userProgress[participantId] ?? 0) + 1;
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');

    await this.sendNextQuestion(sessionId, participantId);
  }

  // Bot logic unchanged
  private async _simulateBotAnswer(sessionId: string, botParticipantId: string, question: Question) {
    try {
      const participant = await prisma.gameParticipant.findUnique({ where: { id: botParticipantId }, include: { userProfile: true } });
      const elo = participant?.userProfile?.eloRating ?? 1200;
      const accuracy = getBotAccuracy(elo);
      const delay = getBotDelay(elo);
      const answersCorrectly = Math.random() < accuracy;
      let chosenOptionId: string;
      if (answersCorrectly) {
        chosenOptionId = question.correctOptionId;
      } else {
        const incorrectOptions = question.options.filter(o => o.id !== question.correctOptionId);
        chosenOptionId = incorrectOptions[Math.floor(Math.random() * incorrectOptions.length)].id;
      }
      setTimeout(() => {
        this.handleAnswer(sessionId, botParticipantId, question.id, chosenOptionId);
      }, delay);
    } catch (err) {
      console.error(`[BotAI] Error simulating bot answer:`, err);
    }
  }

  // Game end logic unchanged
  public async endGame(sessionId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    await redis.del(`game_state:${sessionId}`);
    const gameState: GameState = JSON.parse(gameStateStr);
    await prisma.$transaction(async tx => {
      const session = await tx.gameSession.update({ where: { id: sessionId }, data: { status: GameStatus.FINISHED }, include: { participants: { include: { userProfile: true } } } });
      for (const participant of session.participants) {
        await tx.gameParticipant.update({ where: { id: participant.id }, data: { score: gameState.scores[participant.id] || 0 } });
      }
      const humanPlayers = session.participants.filter(p => !p.isBot);
      if (humanPlayers.length === 2) {
        const p1 = humanPlayers[0];
        const p2 = humanPlayers[1];
        const [newP1Elo, newP2Elo] = calculateElo(
          p1.userProfile!.eloRating,
          p2.userProfile!.eloRating,
          gameState.scores[p1.id] > gameState.scores[p2.id] ? 1 : 0.5
        );
        await tx.userProfile.update({ where: { userId: p1.userId }, data: { eloRating: newP1Elo } });
        await tx.userProfile.update({ where: { userId: p2.userId }, data: { eloRating: newP2Elo } });
      }
    });
    socketService.emitToRoom(sessionId, 'game:end', { scores: gameState.scores });
  }
}

export const gameService = new GameService();
