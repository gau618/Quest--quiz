// src/lib/game/game.service.ts
import { GameMode, Difficulty } from "@prisma/client";
import { socketService } from "@/lib/websocket/socket.service";
import { queueService } from "@/lib/queue/config";
import { sessionManager } from "./game/session/session.manager";
import { questionManager } from "./game/question/question.manager";
import { stateManager } from "./game/state/state.manager";
import { botAI } from "./game/bot/bot.ai";
import { GameState, Question, AnswerData, GameStatus } from "./game/types";

import prisma from "@/lib/prisma/client";

const FFF_MAX_QUESTION_TIME = 30000;

class GameService {
  /**
   * Initializes competitive games (Quick Duel, Fastest Finger First).
   * Note: This method does NOT send the first question for Quick Duel.
   * The frontend will request it via 'quickduel:request_first_question'.
   */
  private async initializeGame(
    playerIds: string[],
    botCount: number,
    duration: number,
    gameMode: GameMode,
    timePerQuestion?: number,
    avgElo: number = 1200
  ) {
    console.log(
      `[GameService] Initializing competitive game: Mode=${gameMode}, Users=${playerIds.join(
        ","
      )}, Bots=${botCount}, Duration=${duration}`
    );

    const session = await sessionManager.create(playerIds, botCount, gameMode);

    const difficulty = questionManager.getDifficultyFromElo(avgElo);
    const questions = await questionManager.fetchQuestions(difficulty);

    if (questions.length === 0) {
      console.error(
        `[GameService] No questions found for a competitive match. Cancelling session ${session.id}.`
      );
      await sessionManager.cancel(session.id);
      socketService.emitToUsers(playerIds, "game:error", {
        message: "Failed to start game: no questions available.",
      });
      return;
    }

    await sessionManager.activate(session.id);

    const gameState: GameState = {
      questions,
      userProgress: session.participants.reduce(
        (acc, p) => ({ ...acc, [p.id]: 0 }),
        {}
      ),
      results: session.participants.reduce(
        (acc, p) => ({ ...acc, [p.id]: [] }),
        {}
      ),
      scores: session.participants.reduce(
        (acc, p) => ({ ...acc, [p.id]: 0 }),
        {}
      ),
      difficulty,
      gameMode,
      endTime: Date.now() + duration * 60 * 1000,
      questionSentAt: {},
      ...(gameMode === GameMode.FASTEST_FINGER_FIRST && {
        timePerQuestion: Math.min(
          timePerQuestion || 30000,
          FFF_MAX_QUESTION_TIME
        ),
        currentQuestionIndex: 0,
        questionAnswers: [],
        questionStartTime: 0,
      }),
    };
    await stateManager.set(session.id, gameState);

    const playersInfo = session.participants.map((p) => ({
      participantId: p.id,
      userId: p.userId,
      username: p.userProfile?.username || `Bot`,
      avatarUrl: p.userProfile?.avatarUrl,
      elo: p.userProfile?.eloRating,
      isBot: p.isBot,
    }));
    const baseEventPayload = {
      sessionId: session.id,
      players: playersInfo,
      duration,
    };
    const realUserIds = session.participants
      .filter((p) => !p.isBot)
      .map((p) => p.userId as string);

    if (gameMode === GameMode.FASTEST_FINGER_FIRST) {
      socketService.emitToUsers(realUserIds, "ff:match_found", {
        ...baseEventPayload,
        timePerQuestion: gameState.timePerQuestion,
        totalQuestions: questions.length,
      });
      setTimeout(() => this.startFastestFingerQuestion(session.id), 3000);
    } else {
      // This is for QUICK_DUEL
      socketService.emitToUsers(realUserIds, "match:found", baseEventPayload);
    }

    const gameEndJobId = `game-end:${session.id}`;
    await queueService.dispatch(
      "game-timers",
      { sessionId: session.id, questionId: "game-end" },
      { delay: duration * 60 * 1000, jobId: gameEndJobId }
    );
  }

  // --- Competitive Game Start Methods ---
  public async startDuel(p1Id: string, p2Id: string, duration: number) {
    console.log(`[GameService] Starting Duel for ${p1Id} vs ${p2Id}.`);
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: [p1Id, p2Id] } },
    });
    const avgElo =
      profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.initializeGame(
      [p1Id, p2Id],
      0,
      duration,
      GameMode.QUICK_DUEL,
      undefined,
      avgElo
    );
  }
  public async startBotDuel(pId: string, duration: number) {
    console.log(`[GameService] Starting Bot Duel for ${pId}.`);
    const profile = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: pId },
    });
    await this.initializeGame(
      [pId],
      1,
      duration,
      GameMode.QUICK_DUEL,
      undefined,
      profile.eloRating
    );
  }
  public async startFastestFinger(
    p1Id: string,
    p2Id: string,
    duration: number,
    time: number
  ) {
    console.log(
      `[GameService] Starting Fastest Finger for ${p1Id} vs ${p2Id}.`
    );
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: [p1Id, p2Id] } },
    });
    const avgElo =
      profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.initializeGame(
      [p1Id, p2Id],
      0,
      duration,
      GameMode.FASTEST_FINGER_FIRST,
      time,
      avgElo
    );
  }
  public async startFastestFingerBot(
    pId: string,
    duration: number,
    time: number
  ) {
    console.log(`[GameService] Starting Fastest Finger Bot for ${pId}.`);
    const profile = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: pId },
    });
    await this.initializeGame(
      [pId],
      1,
      duration,
      GameMode.FASTEST_FINGER_FIRST,
      time,
      profile.eloRating
    );
  }

  // --- Start Practice Mode Method ---
  public async startPractice(
    userId: string,
    difficulty: Difficulty,
    categories: string[],
    numQuestions: number
  ): Promise<
    | { sessionId: string; participantId: string; totalQuestions: number }
    | { error: string }
  > {
    console.log(`[GameService] Starting Practice Mode for user: ${userId}`);
    const session = await sessionManager.create([userId], 0, GameMode.PRACTICE);
    const questions = await questionManager.fetchQuestions(
      difficulty,
      categories,
      numQuestions
    );
    if (questions.length === 0) {
      await sessionManager.cancel(session.id);
      socketService.emitToUsers([userId], "practice:error", {
        message: "No questions found.",
      });
      return { error: "No questions found" };
    }
    await sessionManager.activate(session.id);
    const participantId = session.participants[0].id;
    const gameState: GameState = {
      questions,
      scores: {},
      results: { [participantId]: [] },
      difficulty,
      gameMode: GameMode.PRACTICE,
      userProgress: { [participantId]: 0 },
      questionSentAt: {},
      endTime: Date.now() + 3600000,
    };
    await stateManager.set(session.id, gameState);
    socketService.emitToUsers([userId], "practice:started", {
      sessionId: session.id,
      participantId,
      totalQuestions: questions.length,
    });
    return {
      sessionId: session.id,
      participantId,
      totalQuestions: questions.length,
    };
  }

  // --- NEW: startTimeAttack Method ---
  public async startTimeAttack(
    userId: string,
    difficulty: Difficulty,
    categories: string[],
    durationMinutes: number
  ): Promise<
    | {
        sessionId: string;
        participantId: string;
        totalQuestions: number;
        durationMinutes: number;
      }
    | { error: string }
  > {
    console.log(
      `[GameService] Starting Time Attack: User=${userId}, Duration=${durationMinutes}`
    );
    const session = await sessionManager.create(
      [userId],
      0,
      GameMode.TIME_ATTACK
    );
    const questions = await questionManager.fetchQuestions(
      difficulty,
      categories,
      999
    );
    if (questions.length === 0) {
      await sessionManager.cancel(session.id);
      socketService.emitToUsers([userId], "time_attack:error", {
        message: "No questions found.",
      });
      return { error: "No questions found" };
    }
    await sessionManager.activate(session.id);
    const participantId = session.participants[0].id;
    const gameState: GameState = {
      questions,
      scores: { [participantId]: 0 },
      results: { [participantId]: [] },
      difficulty,
      gameMode: GameMode.TIME_ATTACK,
      userProgress: { [participantId]: 0 },
      questionSentAt: {},
      endTime: Date.now() + durationMinutes * 60 * 1000,
    };
    await stateManager.set(session.id, gameState);
    await queueService.dispatch(
      "game-timers",
      { sessionId: session.id ,questionId: "game-end"},
      { delay: durationMinutes * 60 * 1000, jobId: `game-end:${session.id}` }
    );
    socketService.emitToUsers([userId], "time_attack:started", {
      sessionId: session.id,
      participantId,
      totalQuestions: questions.length,
      durationMinutes,
    });
    return {
      sessionId: session.id,
      participantId,
      totalQuestions: questions.length,
      durationMinutes,
    };
  }

  public async startGroupGame(sessionId: string): Promise<void> {
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    if (!session || session.status !== GameStatus.ACTIVE) return;

    const difficulty = session.difficulty || Difficulty.MEDIUM;
    const durationMinutes = session.durationMinutes || 5;
    const questions = await questionManager.fetchQuestions(difficulty);
    if (questions.length === 0) {
      await sessionManager.cancel(sessionId);
      socketService.emitToRoom(sessionId, "game:error", {
        message: "No questions available.",
      });
      return;
    }

    const gameState: GameState = {
      questions,
      userProgress: session.participants.reduce(
        (acc, p) => ({ ...acc, [p.id]: 0 }),
        {}
      ),
      results: session.participants.reduce(
        (acc, p) => ({ ...acc, [p.id]: [] }),
        {}
      ),
      scores: session.participants.reduce(
        (acc, p) => ({ ...acc, [p.id]: 0 }),
        {}
      ),
      difficulty,
      gameMode: GameMode.GROUP_PLAY,
      endTime: Date.now() + durationMinutes * 60 * 1000,
      questionSentAt: {},
    };
    await stateManager.set(sessionId, gameState);

    const playersInfo = session.participants.map((p) => ({
      participantId: p.id,
      userId: p.userId,
      username: p.userProfile?.username || `Player`,
      avatarUrl: p.userProfile?.avatarUrl,
      isBot: p.isBot,
    }));
    socketService.emitToRoom(sessionId, "group_game:started", {
      sessionId,
      players: playersInfo,
      duration: durationMinutes,
    });

    session.participants.forEach((p) => {
      this.sendNextGroupPlayQuestion(sessionId, p.id);
    });

    await queueService.dispatch(
      "game-timers",
      { sessionId ,questionId: "game-end"},
      { delay: durationMinutes * 60 * 1000, jobId: `game-end:${sessionId}` }
    );
  }

  public async sendNextGroupPlayQuestion(
    sessionId: string,
    participantId: string
  ): Promise<void> {
    const state = await stateManager.get(sessionId);
    if (
      !state ||
      Date.now() >= state.endTime ||
      (state.userProgress[participantId] ?? 0) >= state.questions.length
    )
      return;
    const questionIndex = state.userProgress[participantId] ?? 0;
    const question = state.questions[questionIndex];
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    const participant = session?.participants.find(
      (p) => p.id === participantId
    );

    const { explanation, learningTip, correctOptionId, ...clientQuestion } =
      question;
    if (participant?.isBot) {
      const { chosenOptionId, delay } = botAI.getBotAnswer(
        question,
        GameMode.GROUP_PLAY
      );
      setTimeout(() => {
        this.handleAnswer(
          sessionId,
          participant.id,
          question.id,
          chosenOptionId
        );
      }, delay);
    } else {
      console.log(clientQuestion)
      socketService.emitToParticipant(
        participantId,
        "question:new",
        clientQuestion
      );
    }
  }

  // --- NEW: sendNextTimeAttackQuestion Method ---
  public async sendNextTimeAttackQuestion(
    sessionId: string,
    participantId: string
  ) {
    const state = await stateManager.get(sessionId);
    if (!state) return;
    if (
      Date.now() >= state.endTime ||
      (state.userProgress[participantId] ?? 0) >= state.questions.length
    ) {
      return this.endGame(sessionId);
    }
    const questionIndex = state.userProgress[participantId] ?? 0;
    const question = state.questions[questionIndex];
    const { explanation, learningTip, correctOptionId, ...clientQuestion } =
      question;
    socketService.emitToParticipant(participantId, "question:new", {
      question: clientQuestion,
      questionNumber: questionIndex + 1,
    });
  }

  // --- NEW: handleTimeAttackAnswer Method ---
  private async handleTimeAttackAnswer(
    sessionId: string,
    participantId: string,
    questionId: string,
    optionId: string,
    state: GameState
  ) {
    const question = state.questions.find((q) => q.id === questionId);
    if (!question) return;
    const isCorrect = question.correctOptionId === optionId;
    state.results[participantId].push({
      questionId,
      timeTaken: 0,
      action: "answered",
      correct: isCorrect,
    });
    if (isCorrect) {
      state.scores[participantId] = (state.scores[participantId] || 0) + 10;
      socketService.emitToParticipant(
        participantId,
        "time_attack:score_update",
        { score: state.scores[participantId] }
      );
    }
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    this.sendNextTimeAttackQuestion(sessionId, participantId);
  }

  // --- MODIFIED: handleAnswer to route Time Attack answers ---
  public async handleAnswer(
    sessionId: string,
    participantId: string,
    questionId: string,
    optionId: string
  ) {
    console.log(
      `[GameService] Handling answer for session ${sessionId}, participant ${participantId}, question ${questionId}, option ${optionId}`
    );
    let state = await stateManager.get(sessionId);
    if (!state) return;

    if (state.gameMode === GameMode.TIME_ATTACK) {
      return this.handleTimeAttackAnswer(
        sessionId,
        participantId,
        questionId,
        optionId,
        state
      );
    }

    if (state.gameMode === GameMode.PRACTICE) {
      const question = state.questions.find((q) => q.id === questionId);
      if (!question) return;
      const isCorrect = question.correctOptionId === optionId;
      state.results[participantId].push({
        questionId,
        timeTaken: 0,
        action: "answered",
        correct: isCorrect,
      });
      if (isCorrect) {
        state.scores[participantId] = (state.scores[participantId] || 0) + 10;
      }
      state.userProgress[participantId]++;
      await stateManager.set(sessionId, state);
      socketService.emitToParticipant(participantId, "answer:feedback", {
        correct: isCorrect,
        correctOptionId: question.correctOptionId,
        explanation: question.explanation,
        learningTip: question.learningTip,
      });
      return;
    }

    if (state.gameMode === GameMode.GROUP_PLAY) {
      return this.handleGroupPlayAnswer(
        sessionId,
        participantId,
        questionId,
        optionId,
        state
      );
    }

    if (state.gameMode === GameMode.FASTEST_FINGER_FIRST) {
      return this.handleFastestFingerAnswer(sessionId, participantId, optionId);
    }

    if (state.gameMode === GameMode.QUICK_DUEL) {
      const isCorrect =
        state.questions.find((q) => q.id === questionId)?.correctOptionId ===
        optionId;
      if (state.questionSentAt[participantId]) {
        state.results[participantId].push({
          questionId,
          timeTaken: Date.now() - state.questionSentAt[participantId],
          action: "answered",
          correct: isCorrect,
        });
        delete state.questionSentAt[participantId];
      }
      if (isCorrect) {
        state.scores[participantId] = (state.scores[participantId] || 0) + 10;
        socketService.emitToRoom(sessionId, "score:update", state.scores);
      }
      state.userProgress[participantId]++;
      await stateManager.set(sessionId, state);
      this.sendNextQuestion(sessionId, participantId);
    }
  }
  private async handleGroupPlayAnswer(
    sessionId: string,
    participantId: string,
    questionId: string,
    optionId: string,
    state: GameState
  ): Promise<void> {
    const question = state.questions.find((q) => q.id === questionId);
    if (!question) return;
    const isCorrect = question.correctOptionId === optionId;
    state.results[participantId].push({
      questionId,
      timeTaken: 0,
      action: "answered",
      correct: isCorrect,
    });
    if (isCorrect)
      state.scores[participantId] = (state.scores[participantId] || 0) + 10;
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    socketService.emitToRoom(sessionId, "group_game:score_update", {
      scores: state.scores,
    });
    this.sendNextGroupPlayQuestion(sessionId, participantId);
  }

  // --- MODIFIED: endGame to handle Time Attack ---
  public async endGame(sessionId: string) {
    console.log(`[GameService] Ending game session ${sessionId}.`);
    await queueService.removeJob("game-timers", `game-end:${sessionId}`);
    const state = await stateManager.get(sessionId);
    if (!state) return;

    await stateManager.del(sessionId);
    await sessionManager.end(sessionId, state.scores);
    if (state.gameMode === GameMode.PRACTICE) {
      const participantId = Object.keys(state.results)[0];
      const finalResultsArray = state.results[participantId] || [];
      socketService.emitToRoom(sessionId, "practice:finished", {
        scores: state.scores,
        results: finalResultsArray,
      });
      console.log(
        `[GameService] Emitted 'practice:finished' to room ${sessionId} with corrected results payload.`
      );
      return; // Exit after handling practice mode specifically
    }

    let eventName: string;
    switch (state.gameMode) {
      case GameMode.FASTEST_FINGER_FIRST:
        eventName = "ff:game_end";
        break;
      case GameMode.TIME_ATTACK:
        eventName = "time_attack:finished";
        break;
      case GameMode.GROUP_PLAY:
        eventName = "group_game:finished";
        break;
      default:
        eventName = "game:end"; // For QUICK_DUEL
    }

    socketService.emitToRoom(sessionId, eventName, {
      scores: state.scores,
      results: state.results,
    });
  }

  // --- All other existing functions (unchanged) ---
  public async sendNextQuestion(sessionId: string, participantId: string) {
    let state = await stateManager.get(sessionId);
    if (!state || Date.now() >= state.endTime) return;
    const questionIndex = state.userProgress[participantId] ?? 0;
    const question = state.questions[questionIndex];
    if (!question) {
      socketService.emitToParticipant(participantId, "participant:finished", {
        reason: "No more questions",
      });
      return;
    }
    state.questionSentAt[participantId] = Date.now();
    await stateManager.set(sessionId, state);
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    const participant = session?.participants.find(
      (p) => p.id === participantId
    );
    if (participant?.isBot) {
      const { chosenOptionId, delay } = botAI.getBotAnswer(
        question,
        GameMode.QUICK_DUEL
      );
      setTimeout(
        () =>
          this.handleAnswer(
            sessionId,
            participant.id,
            question.id,
            chosenOptionId
          ),
        delay
      );
    } else {
      const { explanation, learningTip, correctOptionId, ...clientQuestion } =
        question;
      socketService.emitToParticipant(
        participantId,
        "question:new",
        clientQuestion
      );
    }
  }

  public async handleNextPracticeQuestion(
    sessionId: string,
    participantId: string
  ) {
    const state = await stateManager.get(sessionId);
    if (!state) return;
    const questionIndex = state.userProgress[participantId] ?? 0;
    if (questionIndex >= state.questions.length) {
      this.endGame(sessionId);
      return;
    }
    const question = state.questions[questionIndex];
    const { explanation, learningTip, correctOptionId, ...clientQuestion } =
      question;
    socketService.emitToParticipant(participantId, "question:new", {
      question: clientQuestion,
      questionNumber: questionIndex + 1,
    });
  }

  private async startFastestFingerQuestion(sessionId: string) {
    let state = await stateManager.get(sessionId);
    if (
      !state ||
      state.currentQuestionIndex! >= state.questions.length ||
      Date.now() >= state.endTime
    ) {
      return this.endGame(sessionId);
    }
    const question = state.questions[state.currentQuestionIndex!];
    state.questionStartTime = Date.now();
    state.questionAnswers = [];
    await stateManager.set(sessionId, state);
    const { explanation, learningTip, correctOptionId, ...clientQuestion } =
      question;
    socketService.emitToRoom(sessionId, "ff:new_question", {
      question: clientQuestion,
      questionNumber: state.currentQuestionIndex! + 1,
      timeLimit: state.timePerQuestion!,
    });
    const jobId = `question-timeout:${sessionId}:${question.id}`;
    await queueService.dispatch(
      "game-timers",
      { sessionId, questionId: question.id },
      { delay: state.timePerQuestion!, jobId }
    );
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    session?.participants.forEach((p) => {
      if (p.isBot) {
        const { chosenOptionId, delay } = botAI.getBotAnswer(
          question,
          GameMode.FASTEST_FINGER_FIRST,
          state.timePerQuestion
        );
        setTimeout(
          () => this.handleFastestFingerAnswer(sessionId, p.id, chosenOptionId),
          delay
        );
      }
    });
  }

  public async handleFastestFingerAnswer(
    sessionId: string,
    participantId: string,
    optionId: string
  ) {
    let state = await stateManager.get(sessionId);
    if (!state) return;
    const currentQuestion = state.questions[state.currentQuestionIndex!];
    if (
      !currentQuestion ||
      state.questionAnswers!.some((a) => a.participantId === participantId) ||
      Date.now() > state.questionStartTime! + state.timePerQuestion!
    )
      return;
    const isCorrect = currentQuestion.correctOptionId === optionId;
    state.questionAnswers!.push({
      participantId,
      optionId,
      timestamp: Date.now(),
      correct: isCorrect,
    });
    state.results[participantId].push({
      questionId: currentQuestion.id,
      timeTaken: Date.now() - state.questionStartTime!,
      action: "answered",
      correct: isCorrect,
    });
    await stateManager.set(sessionId, state);
    socketService.emitToRoom(sessionId, "ff:player_answered", {
      participantId,
      correct: isCorrect,
    });
    if (isCorrect) {
      const correctAnswers = state.questionAnswers!.filter((a) => a.correct);
      if (
        correctAnswers.length === 1 &&
        correctAnswers[0].participantId === participantId
      ) {
        state.scores[participantId] = (state.scores[participantId] || 0) + 1;
        await stateManager.set(sessionId, state);
        socketService.emitToRoom(sessionId, "ff:point_awarded", {
          participantId,
          allScores: state.scores,
          correctOptionId: currentQuestion.correctOptionId,
        });
        const jobIdToCancel = await stateManager.getTimerJobId(sessionId);
        if (jobIdToCancel)
          await queueService.removeJob("game-timers", jobIdToCancel);
        setTimeout(() => this.moveToNextFastestFingerQuestion(sessionId), 2000);
      }
    }
  }

  public async processFastestFingerTimeout(
    sessionId: string,
    questionId: string
  ) {
    let state = await stateManager.get(sessionId);
    if (
      !state ||
      state.questions[state.currentQuestionIndex!].id !== questionId ||
      state.questionAnswers!.some((a) => a.correct)
    )
      return;
    const currentQuestion = state.questions[state.currentQuestionIndex!];
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    session?.participants.forEach((p) => {
      if (!state.questionAnswers!.some((a) => a.participantId === p.id)) {
        state.results[p.id].push({
          questionId: currentQuestion.id,
          timeTaken: state.timePerQuestion!,
          action: "timeout",
          correct: false,
        });
      }
    });
    await stateManager.set(sessionId, state);
    socketService.emitToRoom(sessionId, "ff:question_timeout", {
      questionNumber: state.currentQuestionIndex! + 1,
      correctOptionId: currentQuestion.correctOptionId,
    });
    this.moveToNextFastestFingerQuestion(sessionId);
  }

  private async moveToNextFastestFingerQuestion(sessionId: string) {
    let state = await stateManager.get(sessionId);
    if (!state) return;
    state.currentQuestionIndex!++;
    await stateManager.set(sessionId, state);
    setTimeout(() => this.startFastestFingerQuestion(sessionId), 1000);
  }

  public async handleSkip(sessionId: string, participantId: string) {
    let state = await stateManager.get(sessionId);
    if (
      !state ||
      state.gameMode === GameMode.FASTEST_FINGER_FIRST ||
      state.gameMode === GameMode.TIME_ATTACK
    )
      return;
    const startTime = state.questionSentAt[participantId];
    const question = state.questions[state.userProgress[participantId] ?? 0];
    if (startTime && question) {
      state.results[participantId].push({
        questionId: question.id,
        timeTaken: Date.now() - startTime,
        action: "skipped",
        correct: false,
      });
      delete state.questionSentAt[participantId];
    }
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    this.sendNextQuestion(sessionId, participantId);
  }
}

export const gameService = new GameService();
