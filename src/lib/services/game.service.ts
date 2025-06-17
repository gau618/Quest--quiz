import prisma from '../prisma/client';
import { Difficulty, GameMode, GameStatus } from '@prisma/client';
import { socketService } from '../websocket/socket.service';
import { redis } from '../redis/client';
import { calculateElo } from '../game/elo';

const QUESTIONS_PER_BATCH = 20;

interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
}

interface GameState {
  questions: Record<string, Question[]>;
  scores: Record<string, number>;
  difficulty: Difficulty;
  endTime: number;
}

// No shuffle function needed

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
  const maxDelay = 4000; // ms
  const minDelay = 1000; // ms
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

  private fetchQuestions = async (difficulty: Difficulty, count: number): Promise<Question[]> => {
    const total = await prisma.question.count({ where: { difficulty } });
    const skip = total > count ? Math.floor(Math.random() * (total - count)) : 0;
    const rawQuestions = await prisma.question.findMany({
      where: { difficulty },
      take: count,
      skip,
      orderBy: { id: 'asc' }, // Ensure consistent order
      select: { id: true, text: true, options: { select: { id: true, text: true, isCorrect: true } } },
    });
    return rawQuestions.map(q => ({
      ...q,
      correctOptionId: q.options.find(opt => opt.isCorrect)!.id,
      options: q.options.map(({ isCorrect, ...rest }) => rest)
    }));
  };

  private async createSession(playerIds: string[], botCount: number, duration: number, difficulty: Difficulty) {
    const botUserIds: string[] = [];
    if (botCount > 0) {
      for (let i = 0; i < botCount; i++) {
        const botId = `BOT_${Date.now()}_${i}`;
        botUserIds.push(botId);
        await prisma.userProfile.create({
          data: {
            userId: botId,
            eloRating: 1200,
            onboardingState: {},
          },
        });
      }
    }

    const allParticipantIds = [...playerIds, ...botUserIds];
    const session = await prisma.gameSession.create({
      data: {
        mode: GameMode.QUICK_DUEL,
        status: GameStatus.ACTIVE,
        participants: {
          create: allParticipantIds.map(id => ({
            userId: id,
            isBot: id.startsWith('BOT_'),
          })),
        },
      },
      include: { participants: { include: { userProfile: true } } },
    });

    // Fetch questions ONCE, assign the same sequence to all participants
    const baseQuestions = await this.fetchQuestions(difficulty, QUESTIONS_PER_BATCH);
    const questions: Record<string, Question[]> = {};
    for (const participant of session.participants) {
      questions[participant.id] = [...baseQuestions];
    }

    const gameState: GameState = {
      questions,
      scores: session.participants.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
      difficulty,
      endTime: Date.now() + duration * 60 * 1000,
    };
    await redis.set(`game_state:${session.id}`, JSON.stringify(gameState), 'EX', duration * 60 + 30);

    socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), 'match:found', {
      sessionId: session.id, duration, difficulty,
      players: session.participants.map(p => ({
        participantId: p.id,
        userId: p.userId,
        username: p.isBot ? `Bot ${Math.floor(Math.random() * 1000)}` : p.userProfile?.username,
        avatarUrl: p.userProfile?.avatarUrl,
        elo: p.userProfile?.eloRating
      }))
    });

    // Start bot(s) gameplay loop
    for (const participant of session.participants) {
      if (participant.isBot) {
        this.sendNextQuestion(session.id, participant.id);
      }
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

  public async sendNextQuestion(sessionId: string, participantId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService] No game state for session ${sessionId}`);
      return;
    }
    const gameState: GameState = JSON.parse(gameStateStr);

    if (Date.now() >= gameState.endTime) {
      console.warn(`[GameService] Game session ${sessionId} ended`);
      return;
    }

    let questionsArr = gameState.questions[participantId] || [];
    let question = questionsArr.shift();

    if (!question) {
      // Fetch more questions in the same order if needed
      questionsArr = await this.fetchQuestions(gameState.difficulty, QUESTIONS_PER_BATCH);
      question = questionsArr.shift();
    }
    gameState.questions[participantId] = questionsArr;

    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');

    if (question) {
      const participant = await prisma.gameParticipant.findUnique({ where: { id: participantId } });
      if (participant?.isBot) {
        this._simulateBotAnswer(sessionId, participantId, question);
      } else {
        console.log(`[GameService] Emitting question:new to participant ${participantId}:`, question);
        socketService.emitToParticipant(participantId, 'question:new', question);
      }
    } else {
      console.warn(`[GameService] No more questions for participant ${participantId} in session ${sessionId}`);
      socketService.emitToParticipant(participantId, 'game:end', { reason: 'No more questions' });
    }
  }

  public async handleAnswer(sessionId: string, participantId: string, questionId: string, chosenOptionId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService] No game state for session ${sessionId} in handleAnswer`);
      return;
    }
    const gameState: GameState = JSON.parse(gameStateStr);
    const question = await prisma.question.findUnique({ where: { id: questionId }, include: { options: true } });
    if (!question) {
      console.warn(`[GameService] No question found for ID ${questionId}`);
      return;
    }

    if (question.options.find(o => o.isCorrect)?.id === chosenOptionId) {
      gameState.scores[participantId] = (gameState.scores[participantId] || 0) + 10;
      await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');
      socketService.emitToRoom(sessionId, 'score:update', gameState.scores);
    }

    // Advance the participant's questions array
    let questionsArr = gameState.questions[participantId] || [];
    questionsArr.shift(); // Remove the answered question
    gameState.questions[participantId] = questionsArr;
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');

    // Send the next question
    await this.sendNextQuestion(sessionId, participantId);
  }

  public async handleSkip(sessionId: string, participantId: string) {
    await this.sendNextQuestion(sessionId, participantId);
  }

  private async _simulateBotAnswer(sessionId: string, botParticipantId: string, question: Question) {
    try {
      const participant = await prisma.gameParticipant.findUnique({
        where: { id: botParticipantId },
        include: { userProfile: true }
      });
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

      console.log(`[BotAI] Bot ${botParticipantId} (ELO ${elo}, accuracy ${(accuracy * 100).toFixed(1)}%) will answer ${answersCorrectly ? 'correctly' : 'incorrectly'} after ${delay.toFixed(0)}ms`);

      setTimeout(() => {
        this.handleAnswer(sessionId, botParticipantId, question.id, chosenOptionId);
      }, delay);
    } catch (err) {
      console.error(`[BotAI] Error simulating bot answer:`, err);
    }
  }

  public async endGame(sessionId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    await redis.del(`game_state:${sessionId}`);
    const gameState: GameState = JSON.parse(gameStateStr);

    await prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.update({
        where: { id: sessionId },
        data: { status: GameStatus.FINISHED },
        include: { participants: { include: { userProfile: true } } },
      });

      for (const participant of session.participants) {
        await tx.gameParticipant.update({
          where: { id: participant.id },
          data: { score: gameState.scores[participant.id] || 0 },
        });
      }
      const humanPlayers = session.participants.filter(p => !p.isBot);
      if (humanPlayers.length === 2) {
        const p1 = humanPlayers[0];
        const p2 = humanPlayers[1];
        const [newP1Elo, newP2Elo] = calculateElo(
          p1.userProfile!.eloRating,
          p2.userProfile!.eloRating,
          (gameState.scores[p1.id] > gameState.scores[p2.id] ? 1 : 0.5)
        );
        await tx.userProfile.update({ where: { userId: p1.userId }, data: { eloRating: newP1Elo } });
        await tx.userProfile.update({ where: { userId: p2.userId }, data: { eloRating: newP2Elo } });
      }
    });

    socketService.emitToRoom(sessionId, 'game:end', { scores: gameState.scores });
  }
}

export const gameService = new GameService();
