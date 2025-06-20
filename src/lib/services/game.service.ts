// src/lib/services/game.service.ts
import prisma from '../prisma/client';
import { Difficulty, GameMode, GameStatus } from '@prisma/client';
import { socketService } from '../websocket/socket.service'; // Corrected import path
import { redis } from '../redis/client';
import { calculateElo } from '../game/elo';

const QUESTIONS_PER_BATCH = 50; // Number of questions fetched for a game session
const FFF_DEFAULT_DURATION_MINS = 2; // Default duration for Fastest Finger games in minutes
const FFF_MAX_QUESTION_TIME = 30000; // Max allowed time per question for FF mode (30 seconds) if player chooses higher

interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  createdAt?: Date;
}

interface AnswerData {
  questionId: string;
  timeTaken: number;
  action: 'answered' | 'skipped' | 'timeout';
  correct?: boolean;
}

interface FastestFingerAnswer {
  participantId: string;
  optionId: string;
  timestamp: number;
  correct: boolean;
}

interface GameState {
  questions: Question[];
  scores: Record<string, number>;
  difficulty: Difficulty;
  endTime: number; // Game end time for the whole session
  results: Record<string, AnswerData[]>; // Per-participant detailed results

  gameMode: GameMode;

  // Quick Duel specific fields
  userProgress: Record<string, number>; // Tracks each user's current question index
  questionSentAt: Record<string, number>; // participantId -> timestamp when last question was sent

  // Fastest Finger specific fields
  timePerQuestion?: number; // Time limit for each question in FF mode (ms)
  currentQuestionIndex?: number; // Index of the current question being played in FF mode
  questionAnswers?: FastestFingerAnswer[]; // Answers submitted for the current FF question
  questionStartTime?: number; // Timestamp when the current FF question started
  questionTimeoutId?: NodeJS.Timeout; // To clear the timeout if a correct answer is received early (THIS IS THE PROBLEMATIC FIELD FOR JSON.stringify)
}

// Bot logic for accuracy
function getBotAccuracy(elo: number): number {
  const minElo = 600;
  const maxElo = 2800;
  const minAcc = 0.70;
  const maxAcc = 0.99;
  if (elo <= minElo) return minAcc;
  if (elo >= maxElo) return maxAcc;
 return minAcc + ((elo - minElo) / (maxElo - minElo)) * (maxAcc - minAcc);
}

// Bot logic for delay (human-like)
function getBotDelay(elo: number, gameMode: GameMode): number {
  const minElo = 600;
  const maxElo = 2800;

  let baseMaxDelay: number;
  let baseMinDelay: number;
  let minHumanDelay: number;
  let maxHumanDelay: number;

  // Corrected GameMode enum usage
  if (gameMode === GameMode.FASTEST_FINGER_FIRST) { // Corrected enum name
    baseMaxDelay = 2500; // 2.5 seconds for low ELO FF bots
    baseMinDelay = 500;  // 0.5 seconds for high ELO FF bots
    minHumanDelay = 500;
    maxHumanDelay = 5000; // Max allowed FF question time by default
  } else { // QUICK_DUEL
    baseMaxDelay = 4000; // 4 seconds for low ELO Quick Duel bots
    baseMinDelay = 1000; // 1 second for high ELO Quick Duel bots
    minHumanDelay = 800;
    maxHumanDelay = 12000;
  }

  let baseDelay: number;
  if (elo <= minElo) {
    baseDelay = baseMaxDelay;
  } else if (elo >= maxElo) {
    baseDelay = baseMinDelay;
  } else {
    baseDelay = baseMaxDelay - ((elo - minElo) / (maxElo - minElo)) * (baseMaxDelay - baseMinDelay);
  }

  // Add human-like variability
  const variationRange = baseDelay * 0.3;
  const randomVariation = (Math.random() - 0.5) * 2 * variationRange;

  const hasThinkingPause = Math.random() < 0.1;
  const thinkingPauseMultiplier = hasThinkingPause ? (1.5 + Math.random() * 1.5) : 1;

  const hasQuickResponse = Math.random() < 0.15 && !hasThinkingPause;
  const quickResponseMultiplier = hasQuickResponse ? (0.4 + Math.random() * 0.4) : 1;

  const consistencyFactor = Math.max(0.5, (elo - minElo) / (maxElo - minElo));
  const consistencyMultiplier = 0.7 + (consistencyFactor * 0.6);

  let finalDelay = baseDelay + randomVariation;
  finalDelay *= thinkingPauseMultiplier;
  finalDelay *= quickResponseMultiplier;
  finalDelay *= consistencyMultiplier;

  finalDelay = Math.max(minHumanDelay, Math.min(maxHumanDelay, finalDelay));

  console.log(`[GameService][BotAI] Bot delay for ELO ${elo} (${gameMode}) calculated as ${finalDelay.toFixed(0)}ms`);
  return Math.round(finalDelay);
}

class GameService {
  private getDifficultyFromElo = (elo: number): Difficulty => {
    if (elo < 1300) return Difficulty.EASY;
    if (elo < 1600) return Difficulty.MEDIUM;
    return Difficulty.HARD;
  };

  private fetchQuestions = async (difficulty: Difficulty, count: number): Promise<Question[]> => {
    console.log(`[GameService] Fetching ${count} questions for difficulty: ${difficulty}`);
    const total = await prisma.question.count({ where: { difficulty } });
    const skip = total > count ? Math.floor(Math.random() * (total - count)) : 0;
    const rawQuestions = await prisma.question.findMany({
      where: { difficulty },
      take: count,
      skip: skip,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        text: true,
        createdAt: true,
        options: { select: { id: true, text: true, isCorrect: true } },
      },
    });
    const questions = rawQuestions.map(q => ({
      ...q,
      correctOptionId: q.options.find(opt => opt.isCorrect)!.id,
      options: q.options.map(({ isCorrect, ...rest }) => rest),
    }));
    console.log(`[GameService] Fetched ${questions.length} questions.`);
    return questions;
  };

  // Central session creation function
  private async createSession(playerIds: string[], botCount: number, duration: number, difficulty: Difficulty, gameMode: GameMode, timePerQuestion?: number) {
    console.log(`[GameService] Creating new session for mode: ${gameMode}, players: ${playerIds.join(', ')}, bots: ${botCount}, duration: ${duration}min`);

    // 1. Create bots if necessary
    const botUserIds: string[] = [];
    if (botCount > 0) {
      for (let i = 0; i < botCount; i++) {
        const botId = `BOT_${Date.now()}_${i}`;
        botUserIds.push(botId);
        await prisma.userProfile.create({ data: { userId: botId, eloRating: 1200, onboardingState: {} } });
        console.log(`[GameService] Created bot user: ${botId}`);
      }
    }

    const allParticipantIds = [...playerIds, ...botUserIds];

    // 2. Create game session in DB
    const session = await prisma.gameSession.create({
      data: {
        mode: gameMode, // Pass the correct GameMode enum value
        status: GameStatus.ACTIVE,
        participants: { create: allParticipantIds.map(id => ({ userId: id, isBot: id.startsWith('BOT_') })) },
      },
      include: { participants: { include: { userProfile: true } } },
    });
    console.log(`[GameService] Game session created in DB: ${session.id}`);

    // 3. Fetch questions
    const questions = await this.fetchQuestions(difficulty, QUESTIONS_PER_BATCH);

    // 4. Initialize game state for Redis
    const userProgress: Record<string, number> = {};
    const results: Record<string, AnswerData[]> = {};
    for (const participant of session.participants) {
      userProgress[participant.id] = 0;
      results[participant.id] = [];
    }

    const gameState: GameState = {
      questions,
      userProgress,
      scores: session.participants.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
      difficulty,
      endTime: Date.now() + duration * 60 * 1000, // Total game duration
      questionSentAt: {}, // For Quick Duel
      results,
      gameMode,
      // Corrected GameMode enum usage
      ...(gameMode === GameMode.FASTEST_FINGER_FIRST && { // Corrected enum name
        timePerQuestion: Math.min(timePerQuestion || 2000, FFF_MAX_QUESTION_TIME), // Max 5s per question
        currentQuestionIndex: 0,
        questionAnswers: [],
        questionStartTime: 0,
        questionTimeoutId: undefined, // Will be set later
      }),
    };

    // Store the initial game state in Redis
    // We are not storing questionTimeoutId here, as it's undefined at this point.
    // Subsequent saves will explicitly omit it.
    await redis.set(`game_state:${session.id}`, JSON.stringify(gameState), 'EX', duration * 60 + 30); // TTL slightly longer than game duration
    console.log(`[GameService] Game state for session ${session.id} stored in Redis.`);

    // 5. Notify clients about match found
    const playersInfo = session.participants.map(p => ({
      participantId: p.id,
      userId: p.userId,
      username: p.isBot ? `Bot ${Math.floor(Math.random() * 1000)}` : p.userProfile?.username,
      avatarUrl: p.userProfile?.avatarUrl,
      elo: p.userProfile?.eloRating,
    }));

    // Corrected GameMode enum usage
    if (gameMode === GameMode.FASTEST_FINGER_FIRST) { // Corrected enum name
      console.log(`[GameService] Emitting 'ff:match_found' for session ${session.id}`);
      socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), 'ff:match_found', {
        sessionId: session.id,
        duration, // Total game duration in minutes
        players: playersInfo,
        timePerQuestion: gameState.timePerQuestion, // Time limit for each question
      });
      // Start the first question for Fastest Finger
      console.log(`[GameService] Starting first FF question for session ${session.id} in 3 seconds.`);
      setTimeout(() => this.startFastestFingerQuestion(session.id), 3000); // 3-second countdown
    } else { // Quick Duel
      console.log(`[GameService] Emitting 'match:found' for session ${session.id}`);
      socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), 'match:found', {
        sessionId: session.id,
        duration,
        players: playersInfo,
      });
      // Send first question to each participant for Quick Duel
      console.log(`[GameService] Sending first Quick Duel question to participants for session ${session.id}`);
      for (const participant of session.participants) {
        this.sendNextQuestion(session.id, participant.id);
      }
    }

    // 6. Set game end timer for the entire session
    console.log(`[GameService] Setting overall game end timer for session ${session.id} in ${duration} minutes.`);
    setTimeout(() => this.endGame(session.id), duration * 60 * 1000);
  }

  // --- Public methods for starting games ---

  public async startDuel(player1Id: string, player2Id: string, duration: number) {
    console.log(`[GameService] Initiating Quick Duel between ${player1Id} and ${player2Id} for ${duration} minutes.`);
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [player1Id, player2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.createSession([player1Id, player2Id], 0, duration, this.getDifficultyFromElo(avgElo), GameMode.QUICK_DUEL);
  }

  public async startBotDuel(playerId: string, duration: number) {
    console.log(`[GameService] Initiating Quick Duel for ${playerId} against a bot for ${duration} minutes.`);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: playerId } });
    await this.createSession([playerId], 1, duration, this.getDifficultyFromElo(profile.eloRating), GameMode.QUICK_DUEL);
  }

  public async startFastestFinger(player1Id: string, player2Id: string, timePerQuestion: number) {
    console.log(`[GameService] Initiating Fastest Finger between ${player1Id} and ${player2Id} with ${timePerQuestion}ms per question.`);
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [player1Id, player2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    // Corrected GameMode enum usage
    await this.createSession([player1Id, player2Id], 0, FFF_DEFAULT_DURATION_MINS, this.getDifficultyFromElo(avgElo), GameMode.FASTEST_FINGER_FIRST, timePerQuestion); // Corrected enum name
  }

  public async startFastestFingerBot(playerId: string, timePerQuestion: number) {
    console.log(`[GameService] Initiating Fastest Finger for ${playerId} against a bot with ${timePerQuestion}ms per question.`);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: playerId } });
    // Corrected GameMode enum usage
    await this.createSession([playerId], 1, FFF_DEFAULT_DURATION_MINS, this.getDifficultyFromElo(profile.eloRating), GameMode.FASTEST_FINGER_FIRST, timePerQuestion); // Corrected enum name
  }

  // --- Quick Duel specific logic ---

  public async sendNextQuestion(sessionId: string, participantId: string) {
    console.log(`[GameService][QuickDuel] Sending next question to participant ${participantId} in session ${sessionId}`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService][QuickDuel] Game state not found for session ${sessionId}. Cannot send next question.`);
      return;
    }
    const gameState: GameState = JSON.parse(gameStateStr);

    // If game has ended by overall timer, do nothing
    if (Date.now() >= gameState.endTime) {
      console.log(`[GameService][QuickDuel] Game session ${sessionId} already ended. Not sending question.`);
      return;
    }

    const idx = gameState.userProgress[participantId] ?? 0;
    const question = gameState.questions[idx];

    if (question) {
      gameState.questionSentAt[participantId] = Date.now();
      // When saving to Redis, make sure questionTimeoutId is not present.
      // Create a temporary object for serialization, excluding the circular reference.
      const gameStateToSave = { ...gameState };
      delete gameStateToSave.questionTimeoutId; // Ensure it's not serialized

      await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL');
      console.log(`[GameService][QuickDuel] Question ${question.id} sent to ${participantId}. Time recorded.`);

      const participant = await prisma.gameParticipant.findUnique({ where: { id: participantId } });
      if (participant?.isBot) {
        console.log(`[GameService][QuickDuel] Simulating bot answer for ${participantId} for question ${question.id}`);
        this._simulateQuickDuelBotAnswer(sessionId, participantId, question);
      } else {
        console.log(`[GameService][QuickDuel] Emitting 'question:new' to participant ${participantId}`);
        socketService.emitToParticipant(participantId, 'question:new', question);
      }
    } else {
      console.log(`[GameService][QuickDuel] No more questions for participant ${participantId} in session ${sessionId}.`);
      socketService.emitToParticipant(participantId, 'participant:finished', { reason: 'No more questions' });
    }
  }

  // --- Fastest Finger specific logic ---

  private async startFastestFingerQuestion(sessionId: string) {
    console.log(`[GameService][FastestFinger] Starting new question for session ${sessionId}`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService][FastestFinger] Game state not found for session ${sessionId}. Cannot start question.`);
      return;
    }

    let gameState: GameState = JSON.parse(gameStateStr);

    // Check if max questions reached or total game time expired
    if (gameState.currentQuestionIndex! >= gameState.questions.length || Date.now() >= gameState.endTime) {
      console.log(`[GameService][FastestFinger] All questions answered or total game time expired for session ${sessionId}. Ending game.`);
      this.endGame(sessionId);
      return;
    }

    const question = gameState.questions[gameState.currentQuestionIndex!];
    gameState.questionStartTime = Date.now();
    gameState.questionAnswers = []; // Reset answers for new question

    // Clear any previous question timeout to avoid race conditions
    if (gameState.questionTimeoutId) {
      clearTimeout(gameState.questionTimeoutId);
      gameState.questionTimeoutId = undefined; // IMPORTANT: Clear the reference in memory
      console.log(`[GameService][FastestFinger] Cleared previous question timeout for session ${sessionId}`);
    }

    // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
    const gameStateToSave = { ...gameState };
    delete gameStateToSave.questionTimeoutId;

    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL'); // Use the safe copy
    console.log(`[GameService][FastestFinger] Game state updated for question ${gameState.currentQuestionIndex! + 1}.`);

    // Send question to all players in the room
    console.log(`[GameService][FastestFinger] Emitting 'ff:new_question' for question ${question.id} in session ${sessionId}`);
    console.log(question)
    socketService.emitToRoom(sessionId, 'ff:new_question', {
      question: {
        id: question.id,
        text: question.text,
        options: question.options,
      },
      questionNumber: gameState.currentQuestionIndex! + 1,
      totalQuestions: gameState.questions.length,
      timeLimit: gameState.timePerQuestion, // Send configured time limit
    });

    // Simulate bot answers for this question
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true }
    });
    for (const participant of session?.participants || []) {
      if (participant.isBot) {
        console.log(`[GameService][FastestFinger] Simulating bot answer for ${participant.id} for question ${question.id}`);
        this._simulateFastestFingerBotAnswer(sessionId, participant.id, question, gameState.timePerQuestion!);
      }
    }

    // Set the question timeout
    console.log(`[GameService][FastestFinger] Setting question timeout for ${gameState.timePerQuestion!}ms for session ${sessionId}.`);
    // Store the actual NodeJS.Timeout object in the in-memory gameState
    const timeoutHandle = setTimeout(() => {
      this.processFastestFingerTimeout(sessionId);
    }, gameState.timePerQuestion!);
    gameState.questionTimeoutId = timeoutHandle; // Assign the handle to in-memory state

    // IMPORTANT: Do NOT save gameState to Redis again here, as it now contains the circular reference.
    // The state has already been saved *before* the timeout was assigned to the in-memory object.
  }

  public async handleFastestFingerAnswer(sessionId: string, participantId: string, questionId: string, chosenOptionId: string) {
    console.log(`[GameService][FastestFinger] Handling answer from ${participantId} for question ${questionId}, option ${chosenOptionId}`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService][FastestFinger] Game state not found for session ${sessionId}. Cannot process answer.`);
      return;
    }

    let gameState: GameState = JSON.parse(gameStateStr);
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex!];

    // Validate current question
    if (!currentQuestion || currentQuestion.id !== questionId) {
      console.warn(`[GameService][FastestFinger] Mismatch: Answer for wrong question ${questionId} in session ${sessionId}. Current Q: ${currentQuestion?.id}`);
      return;
    }

    // Check if player has already answered this question
    const existingAnswer = gameState.questionAnswers!.find(a => a.participantId === participantId);
    if (existingAnswer) {
      console.log(`[GameService][FastestFinger] Participant ${participantId} already answered question ${questionId}. Ignoring duplicate.`);
      return;
    }

    // Check if question time has expired
    if (Date.now() > (gameState.questionStartTime! + gameState.timePerQuestion!)) {
      console.log(`[GameService][FastestFinger] Answer from ${participantId} for ${questionId} received after timeout. Ignoring.`);
      return;
    }

    const timestamp = Date.now();
    const timeTaken = timestamp - gameState.questionStartTime!;
    const isCorrect = currentQuestion.correctOptionId === chosenOptionId;

    const answer: FastestFingerAnswer = {
      participantId,
      optionId: chosenOptionId,
      timestamp,
      correct: isCorrect,
    };

    gameState.questionAnswers!.push(answer);

    // Record in participant's overall results
    gameState.results[participantId].push({
      questionId,
      timeTaken,
      action: 'answered',
      correct: isCorrect,
    });

    // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
    const gameStateToSave = { ...gameState };
    delete gameStateToSave.questionTimeoutId;

    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL'); // Use the safe copy
    console.log(`[GameService][FastestFinger] Answer from ${participantId} (${isCorrect ? 'Correct' : 'Incorrect'}) for Q${currentQuestion.id} recorded. Time: ${timeTaken}ms.`);

    // Notify all players about this answer
    socketService.emitToRoom(sessionId, 'ff:player_answered', {
      participantId,
      correct: isCorrect,
      timeTaken,
    });
    console.log(`[GameService][FastestFinger] Emitted 'ff:player_answered' for ${participantId}.`);

    // --- Scoring logic for Fastest Finger ---
    // If this is a correct answer AND no one else has answered correctly yet
    if (isCorrect) {
      const allCorrectAnswersForQuestion = gameState.questionAnswers!.filter(a => a.correct).sort((a, b) => a.timestamp - b.timestamp);
      if (allCorrectAnswersForQuestion.length === 1 && allCorrectAnswersForQuestion[0].participantId === participantId) {
        // This player is the first to answer correctly
        gameState.scores[participantId] = (gameState.scores[participantId] || 0) + 1; // Award 1 point
        console.log(`[GameService][FastestFinger] Point awarded to ${participantId} for Q${currentQuestion.id}. New score: ${gameState.scores[participantId]}.`);

        // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
        const gameStateToSaveAfterScore = { ...gameState };
        delete gameStateToSaveAfterScore.questionTimeoutId;

        await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSaveAfterScore), 'KEEPTTL'); // Use the safe copy
        console.log(`[GameService][FastestFinger] Game state updated after score for ${participantId}.`);

        socketService.emitToRoom(sessionId, 'ff:point_awarded', {
          participantId,
          newScore: gameState.scores[participantId],
          allScores: gameState.scores,
        });
        console.log(`[GameService][FastestFinger] Emitted 'ff:point_awarded' for ${participantId}.`);
        // Clear the question timeout if a correct answer is received
        if (gameState.questionTimeoutId) {
          clearTimeout(gameState.questionTimeoutId);
          gameState.questionTimeoutId = undefined; // IMPORTANT: Clear the reference in memory
          console.log(`[GameService][FastestFinger] Cleared question timeout due to first correct answer.`);
        }

        // Move to next question after a short delay
        console.log(`[GameService][FastestFinger] Moving to next question in 2 seconds due to correct answer.`);
        setTimeout(() => this.moveToNextFastestFingerQuestion(sessionId), 2000);
      }
    }
  }

  private async processFastestFingerTimeout(sessionId: string) {
    console.log(`[GameService][FastestFinger] Question timeout triggered for session ${sessionId}.`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService][FastestFinger] Game state not found for session ${sessionId}. Cannot process timeout.`);
      return;
    }

    let gameState: GameState = JSON.parse(gameStateStr);

    // If a correct answer was already received and processed, this timeout is redundant, just return
    const hasCorrectAnswer = gameState.questionAnswers!.some(a => a.correct);
    if (hasCorrectAnswer) {
      console.log(`[GameService][FastestFinger] Timeout triggered but correct answer already received. Skipping processing.`);
      return;
    }

    // Record timeout for players who did not answer or answered incorrectly
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex!];
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true }
    });

    for (const participant of session?.participants || []) {
      const hasAnswered = gameState.questionAnswers!.some(a => a.participantId === participant.id);
      if (!hasAnswered) {
        // Only record if they haven't answered at all
        gameState.results[participant.id].push({
          questionId: currentQuestion.id,
          timeTaken: gameState.timePerQuestion!, // Full time limit
          action: 'timeout',
          correct: false,
        });
        console.log(`[GameService][FastestFinger] Participant ${participant.id} timed out for Q${currentQuestion.id}.`);
      }
    }

    // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
    const gameStateToSave = { ...gameState };
    delete gameStateToSave.questionTimeoutId;

    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL'); // Use the safe copy
    console.log(`[GameService][FastestFinger] Game state updated after timeout processing.`);

    socketService.emitToRoom(sessionId, 'ff:question_timeout', {
      questionNumber: gameState.currentQuestionIndex! + 1,
    });
    console.log(`[GameService][FastestFinger] Emitted 'ff:question_timeout' for session ${sessionId}.`);

    // Move to next question
    console.log(`[GameService][FastestFinger] Moving to next question after timeout.`);
    this.moveToNextFastestFingerQuestion(sessionId);
  }

  private async moveToNextFastestFingerQuestion(sessionId: string) {
    console.log(`[GameService][FastestFinger] Preparing to move to next question for session ${sessionId}.`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService][FastestFinger] Game state not found for session ${sessionId}. Cannot move to next question.`);
      return;
    }

    let gameState: GameState = JSON.parse(gameStateStr);
    gameState.currentQuestionIndex!++;

    // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
    const gameStateToSave = { ...gameState };
    delete gameStateToSave.questionTimeoutId;

    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL'); // Use the safe copy
    console.log(`[GameService][FastestFinger] Game state updated. Next question index: ${gameState.currentQuestionIndex}.`);

    // Start next question after 1 second visual delay
    console.log(`[GameService][FastestFinger] Starting next FF question in 1 second.`);
    setTimeout(() => this.startFastestFingerQuestion(sessionId), 1000);
  }

  // --- Common Answer Handler (routes to specific mode logic) ---
  public async handleAnswer(sessionId: string, participantId: string, questionId: string, chosenOptionId: string) {
    console.log(`[GameService] Received answer from ${participantId} for session ${sessionId}.`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService] Game state not found for session ${sessionId}. Cannot handle answer.`);
      return;
    }
    let gameState: GameState = JSON.parse(gameStateStr);

    // Corrected GameMode enum usage
    if (gameState.gameMode === GameMode.FASTEST_FINGER_FIRST) { // Corrected enum name
      console.log(`[GameService] Routing answer to Fastest Finger handler.`);
      return this.handleFastestFingerAnswer(sessionId, participantId, questionId, chosenOptionId);
    } else { // Quick Duel logic
      console.log(`[GameService] Handling answer with Quick Duel logic.`);
      const question = await prisma.question.findUnique({ where: { id: questionId }, include: { options: true } });
      if (!question) {
        console.warn(`[GameService][QuickDuel] Question ${questionId} not found. Cannot process answer.`);
        return;
      }

      const startTime = gameState.questionSentAt[participantId];
      const isCorrect = question.options.find(o => o.isCorrect)?.id === chosenOptionId;
      console.log(`[GameService][QuickDuel] Answer from ${participantId} for Q${question.id} is ${isCorrect ? 'Correct' : 'Incorrect'}.`);

      if (startTime) {
        const timeTaken = Date.now() - startTime;
        gameState.results[participantId].push({ questionId, timeTaken, action: 'answered', correct: isCorrect });
        delete gameState.questionSentAt[participantId];
        console.log(`[GameService][QuickDuel] Answer recorded. Time taken: ${timeTaken}ms.`);
      }

      if (isCorrect) {
        gameState.scores[participantId] = (gameState.scores[participantId] || 0) + 10;
        socketService.emitToRoom(sessionId, 'score:update', gameState.scores);
        console.log(`[GameService][QuickDuel] Score updated for ${participantId}. New score: ${gameState.scores[participantId]}.`);
      }

      gameState.userProgress[participantId] = (gameState.userProgress[participantId] ?? 0) + 1;
      // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
      const gameStateToSave = { ...gameState };
      delete gameStateToSave.questionTimeoutId;
      await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL'); // Use the safe copy
      console.log(`[GameService][QuickDuel] Participant ${participantId} progress updated. Moving to next question.`);
      await this.sendNextQuestion(sessionId, participantId);
    }
  }

  // --- Quick Duel specific Skip Handler ---

  public async handleSkip(sessionId: string, participantId: string) {
    console.log(`[GameService] Received skip request from ${participantId} for session ${sessionId}.`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService] Game state not found for session ${sessionId}. Cannot handle skip.`);
      return;
    }
    let gameState: GameState = JSON.parse(gameStateStr);

    // Corrected GameMode enum usage
    if (gameState.gameMode === GameMode.FASTEST_FINGER_FIRST) { // Corrected enum name
      console.log(`[GameService] Skip not applicable for Fastest Finger mode.`);
      return;
    }

    const startTime = gameState.questionSentAt[participantId];
    const currentQuestionIndex = gameState.userProgress[participantId] ?? 0;
    const question = gameState.questions[currentQuestionIndex];

    if (startTime && question) {
      const timeTaken = Date.now() - startTime;
      gameState.results[participantId].push({ questionId, timeTaken, action: 'skipped' });
      delete gameState.questionSentAt[participantId];
      console.log(`[GameService][QuickDuel] Skip recorded for ${participantId}. Time taken: ${timeTaken}ms.`);
    }

    gameState.userProgress[participantId] = (gameState.userProgress[participantId] ?? 0) + 1;
    // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
    const gameStateToSave = { ...gameState };
    delete gameStateToSave.questionTimeoutId;
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameStateToSave), 'KEEPTTL'); // Use the safe copy
    console.log(`[GameService][QuickDuel] Participant ${participantId} progress updated. Moving to next question.`);
    await this.sendNextQuestion(sessionId, participantId);
  }

  // --- Bot Simulation Helpers ---

  private async _simulateQuickDuelBotAnswer(sessionId: string, botParticipantId: string, question: Question) {
    try {
      const participant = await prisma.gameParticipant.findUnique({ where: { id: botParticipantId }, include: { userProfile: true } });
      const elo = participant?.userProfile?.eloRating ?? 1200;
      const accuracy = getBotAccuracy(elo);
      const delay = getBotDelay(elo, GameMode.QUICK_DUEL);
      const answersCorrectly = Math.random() < accuracy;
      let chosenOptionId: string;
      if (answersCorrectly) {
        chosenOptionId = question.correctOptionId;
      } else {
        const incorrectOptions = question.options.filter(o => o.id !== question.correctOptionId);
        chosenOptionId = incorrectOptions[Math.floor(Math.random() * incorrectOptions.length)].id;
      }
      console.log(`[GameService][BotAI][QuickDuel] Bot ${botParticipantId} will answer Q${question.id} in ${delay}ms. Correct: ${answersCorrectly}`);
      setTimeout(() => {
        this.handleAnswer(sessionId, botParticipantId, question.id, chosenOptionId);
      }, delay);
    } catch (err) {
      console.error(`[GameService][BotAI] Error simulating Quick Duel bot answer:`, err);
    }
  }
  private async _simulateFastestFingerBotAnswer(sessionId: string, botParticipantId: string, question: Question, questionTimeLimit: number) {
    try {
      const participant = await prisma.gameParticipant.findUnique({ where: { id: botParticipantId }, include: { userProfile: true } });
      const elo = participant?.userProfile?.eloRating ?? 1200;
      const accuracy = getBotAccuracy(elo);
      // Corrected GameMode enum usage
      const delay = getBotDelay(elo, GameMode.FASTEST_FINGER_FIRST); // Corrected enum name

      const answersCorrectly = Math.random() < accuracy;
      let chosenOptionId: string;
      if (answersCorrectly) {
        chosenOptionId = question.correctOptionId;
      } else {
        const incorrectOptions = question.options.filter(o => o.id !== question.correctOptionId);
        chosenOptionId = incorrectOptions[Math.floor(Math.random() * incorrectOptions.length)].id;
      }

      // Ensure bot doesn't answer after question timeout
      const answerDelay = Math.min(delay, questionTimeLimit - 100); // Answer before timer exactly runs out
      console.log(`[GameService][BotAI][FastestFinger] Bot ${botParticipantId} will answer Q${question.id} in ${answerDelay}ms. Correct: ${answersCorrectly}`);

      setTimeout(() => {
        this.handleFastestFingerAnswer(sessionId, botParticipantId, question.id, chosenOptionId);
      }, answerDelay);
    } catch (err) {
      console.error(`[GameService][BotAI] Error simulating FF bot answer:`, err);
    }
  }

  // --- Game End Logic ---

  public async endGame(sessionId: string) {
    console.log(`[GameService] Initiating end game sequence for session ${sessionId}.`);
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[GameService] Game state not found for session ${sessionId}. Game already ended or never existed.`);
      return;
    }

    await redis.del(`game_state:${sessionId}`); // Remove game state from Redis
    console.log(`[GameService] Game state for session ${sessionId} removed from Redis.`);

    let gameState: GameState = JSON.parse(gameStateStr);

    // Clear any pending question timeout for FF mode
    if (gameState.questionTimeoutId) {
      clearTimeout(gameState.questionTimeoutId);
      gameState.questionTimeoutId = undefined; // IMPORTANT: Clear the reference in memory
      console.log(`[GameService] Cleared pending question timeout for session ${sessionId}.`);
    }

    // Mark remaining unanswered questions as timeout for Quick Duel
    if (gameState.gameMode === GameMode.QUICK_DUEL) {
      for (const participantId in gameState.questionSentAt) {
        const startTime = gameState.questionSentAt[participantId];
        if (startTime) {
          const timeTaken = gameState.endTime - startTime; // Time from question sent to game end
          const currentQuestionIndex = gameState.userProgress[participantId] ?? 0;
          const question = gameState.questions[currentQuestionIndex];
          if (question) {
            gameState.results[participantId].push({ questionId, timeTaken, action: 'timeout' });
            console.log(`[GameService][QuickDuel] Participant ${participantId} timed out on final question Q${question.id}.`);
          }
        }
      }
    }

    // Prepare game state for Redis save (omit the non-serializable questionTimeoutId)
    const gameStateToSave = { ...gameState };
    delete gameStateToSave.questionTimeoutId;

    // Update DB status and participant scores
    await prisma.$transaction(async tx => {
      const session = await tx.gameSession.update({
        where: { id: sessionId },
        data: { status: GameStatus.FINISHED },
        include: {
          participants: { include: { userProfile: true } }
        }
      });
      console.log(`[GameService] Game session ${sessionId} status updated to FINISHED in DB.`);

      for (const participant of session.participants) {
        await tx.gameParticipant.update({
          where: { id: participant.id },
          data: { score: gameState.scores[participant.id] || 0 }
        });
        console.log(`[GameService] Participant ${participant.id} final score updated in DB: ${gameState.scores[participant.id] || 0}.`);
      }

      // ELO calculation for human players
      const humanPlayers = session.participants.filter(p => !p.isBot);
      if (humanPlayers.length === 2) {
        console.log(`[GameService] Calculating ELO changes for human players in session ${sessionId}.`);
        const p1 = humanPlayers[0];
        const p2 = humanPlayers[1];

        // Determine winner based on scores
        const scoreA = gameState.scores[p1.id] > gameState.scores[p2.id] ? 1 :
          (gameState.scores[p1.id] === gameState.scores[p2.id] ? 0.5 : 0);

        const [newP1Elo, newP2Elo] = calculateElo(
          p1.userProfile!.eloRating,
          p2.userProfile!.eloRating,
          scoreA
        );
        console.log(`[GameService] Player ${p1.userId}: Old ELO ${p1.userProfile!.eloRating}, New ELO ${newP1Elo}`);
        console.log(`[GameService] Player ${p2.userId}: Old ELO ${p2.userProfile!.eloRating}, New ELO ${newP2Elo}`);

        await tx.userProfile.update({ where: { userId: p1.userId }, data: { eloRating: newP1Elo } });
        await tx.userProfile.update({ where: { userId: p2.userId }, data: { eloRating: newP2Elo } });
      } else {
        console.log(`[GameService] No ELO calculation needed for session ${sessionId} (not 2 human players).`);
      }
    });

    // Emit game end event to all players in the room
    // Corrected GameMode enum usage
    const eventName = gameState.gameMode === GameMode.FASTEST_FINGER_FIRST ? 'ff:game_end' : 'game:end'; // Corrected enum name
    socketService.emitToRoom(sessionId, eventName, {
      scores: gameState.scores,
      results: gameState.results,
    });
    console.log(`[GameService] Emitted '${eventName}' for session ${sessionId} with final scores and results.`);
  }
}

export const gameService = new GameService();
