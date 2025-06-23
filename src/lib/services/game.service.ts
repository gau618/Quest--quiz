// src/lib/game/game.service.ts
import { GameMode, Difficulty } from "@prisma/client";
import { socketService } from "@/lib/websocket/socket.service";
import { queueService } from "@/lib/queue/config";
import { sessionManager } from "./game/session/session.manager"; // FIX: Corrected Path
import { questionManager } from "./game/question/question.manager"; // FIX: Corrected Path
import { stateManager } from "./game/state/state.manager"; // FIX: Corrected Path
import { botAI } from "./game/bot/bot.ai"; // FIX: Corrected Path
import { GameState, Question, AnswerData } from "./game/types"; // FIX: Corrected Path
import prisma from "@/lib/prisma/client";

const FFF_MAX_QUESTION_TIME = 30000;

class GameService {
  private async initializeGame(
    playerIds: string[],
    botCount: number,
    duration: number,
    gameMode: GameMode,
    timePerQuestion?: number,
    avgElo: number = 1200
  ) {
    console.log(`[GameService] Initializing game: Mode=${gameMode}, Users=${playerIds.join(',')}, Bots=${botCount}`);
    
    const session = await sessionManager.create(playerIds, botCount, gameMode);
    
    const difficulty = questionManager.getDifficultyFromElo(avgElo);
    const questions = await questionManager.fetchQuestions(difficulty);

    if (questions.length === 0) {
      console.error(`[GameService] No questions found for a competitive match. Cancelling session ${session.id}.`);
      await sessionManager.cancel(session.id);
      socketService.emitToUsers(playerIds, "game:error", { message: "Failed to start the game due to an internal error (no questions available)." });
      return;
    }
    
    await sessionManager.activate(session.id);

    const userProgress: Record<string, number> = {};
    const results: Record<string, AnswerData[]> = {};
    session.participants.forEach((p) => {
      userProgress[p.id] = 0;
      results[p.id] = [];
    });

    const gameState: GameState = {
      questions, userProgress, results, difficulty, gameMode,
      scores: session.participants.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
      endTime: Date.now() + duration * 60 * 1000,
      questionSentAt: {},
      ...(gameMode === GameMode.FASTEST_FINGER_FIRST && {
        timePerQuestion: Math.min(timePerQuestion || 30000, FFF_MAX_QUESTION_TIME),
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

    const baseEventPayload = { sessionId: session.id, players: playersInfo, duration };
    const realUserIds = session.participants.filter((p) => !p.isBot).map((p) => p.userId as string);

    if (gameMode === GameMode.FASTEST_FINGER_FIRST) {
      socketService.emitToUsers(realUserIds, "ff:match_found", {
          ...baseEventPayload,
          timePerQuestion: gameState.timePerQuestion,
          totalQuestions: questions.length,
      });
      setTimeout(() => this.startFastestFingerQuestion(session.id), 1000);
    } else {
      socketService.emitToUsers(realUserIds, "match:found", baseEventPayload);
      
      // ** THE CRITICAL FIX IS HERE **
      // For Quick Duel, we must send the first question to ALL participants, including bots,
      // to trigger their answering logic.
      console.log(`[GameService] Triggering first question for all Quick Duel participants in session ${session.id}.`);
      session.participants.forEach(p => {
        setTimeout(() => {
            console.log(`[GameService] Sending initial question to ${p.id} after handshake delay`);
            this.sendNextQuestion(session.id, p.id);
          }, 1000);
      });
    }

    const gameEndJobId = `game-end:${session.id}`;
    await queueService.dispatch(
      "game-timers",
      { sessionId: session.id, questionId: "game-end" },
      { delay: duration * 60 * 1000, jobId: gameEndJobId }
    );
  }

  public async startDuel(p1Id: string, p2Id: string, duration: number) {
    console.log(`[GameService] Starting Duel for ${p1Id} vs ${p2Id}.`);
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [p1Id, p2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.initializeGame([p1Id, p2Id], 0, duration, GameMode.QUICK_DUEL, undefined, avgElo);
  }

  public async startBotDuel(pId: string, duration: number) {
    console.log(`[GameService] Starting Bot Duel for ${pId}.`);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: pId } });
    await this.initializeGame([pId], 1, duration, GameMode.QUICK_DUEL, undefined, profile.eloRating);
  }

  public async startFastestFinger(p1Id: string, p2Id: string, duration: number, time: number) {
    console.log(`[GameService] Starting Fastest Finger for ${p1Id} vs ${p2Id}.`);
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [p1Id, p2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.initializeGame([p1Id, p2Id], 0, duration, GameMode.FASTEST_FINGER_FIRST, time, avgElo);
  }
  
  public async startFastestFingerBot(pId: string, duration: number, time: number) {
    console.log(`[GameService] Starting Fastest Finger Bot for ${pId}.`);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: pId } });
    await this.initializeGame([pId], 1, duration, GameMode.FASTEST_FINGER_FIRST, time, profile.eloRating);
  }
    public async startTimeAttack(
    userId: string,
    difficulty: Difficulty,
    categories: string[],
    durationMinutes: number
  ): Promise<{ sessionId: string; participantId: string; totalQuestions: number; durationMinutes: number } | { error: string }> {
    console.log(`[GameService] Starting Time Attack: User=${userId}, Duration=${durationMinutes}`);

    const session = await sessionManager.create([userId], 0, GameMode.TIME_ATTACK);
    const questions = await questionManager.fetchQuestions(difficulty, categories, 999); // Fetch a large number of questions

    if (questions.length === 0) {
      await sessionManager.cancel(session.id);
      socketService.emitToUsers([userId], "time_attack:error", { message: "No questions found for the selected criteria." });
      return { error: "No questions found" };
    }
    
    await sessionManager.activate(session.id);

    const gameState: GameState = {
      questions,
      scores: { [session.participants[0].id]: 0 },
      results: { [session.participants[0].id]: [] },
      difficulty,
      gameMode: GameMode.TIME_ATTACK,
      userProgress: { [session.participants[0].id]: 0 },
      questionSentAt: {},
      endTime: Date.now() + durationMinutes * 60 * 1000,
    };
    await stateManager.set(session.id, gameState);
    const participantId = session.participants[0].id;

    const gameEndJobId = `game-end:${session.id}`;
    await queueService.dispatch("game-timers", { sessionId: session.id }, { delay: durationMinutes * 60 * 1000, jobId: gameEndJobId });

    socketService.emitToUsers([userId], "time_attack:started", {
      sessionId: session.id, participantId, totalQuestions: questions.length, durationMinutes,
    });

    return { sessionId: session.id, participantId, totalQuestions: questions.length, durationMinutes };
  }
  public async startPractice(
    userId: string,
    difficulty: Difficulty,
    categories: string[],
    numQuestions: number
  ): Promise<{ sessionId: string; participantId: string; totalQuestions: number } | { error: string }> {
    const session = await sessionManager.create([userId], 0, GameMode.PRACTICE);
    const questions = await questionManager.fetchQuestions(difficulty, categories, numQuestions);

    if (questions.length === 0) {
      await sessionManager.cancel(session.id);
      socketService.emitToUsers([userId], "practice:error", { message: "No questions found for the selected criteria." });
      return { error: "No questions found" };
    }
    
    await sessionManager.activate(session.id);

    const gameState: GameState = {
        questions,
        scores: {},
        results: { [session.participants[0].id]: [] },
        difficulty,
        gameMode: GameMode.PRACTICE,
        userProgress: { [session.participants[0].id]: 0 },
        questionSentAt: {},
        endTime: Date.now() + 60 * 60 * 1000,
    };
    await stateManager.set(session.id, gameState);
    const participantId = session.participants[0].id;

    socketService.emitToUsers([userId], "practice:started", {
      sessionId: session.id, participantId: participantId, totalQuestions: questions.length,
    });

    return { sessionId: session.id, participantId: participantId, totalQuestions: questions.length };
  }
  private async sendNextPracticeQuestion(
    sessionId: string,
    participantId: string
  ) {
    console.log(
      `[GameService] Sending next practice question for session ${sessionId}, participant ${participantId}`
    );
    const state = await stateManager.get(sessionId);
    if (!state) {
      console.warn(
        `[GameService] State not found for session ${sessionId} when sending practice question.`
      );
      socketService.emitToParticipant(participantId, "practice:error", {
        message: "Practice session not found or ended unexpectedly.",
      });
      return;
    }
    const questionIndex = state.userProgress[participantId] ?? 0;
    if (questionIndex >= state.questions.length) {
      console.log(
        `[GameService] Participant ${participantId} finished all practice questions in session ${sessionId}.`
      );
      socketService.emitToParticipant(participantId, "practice:finished", {
        results: state.results[participantId],
      });
      await stateManager.del(sessionId);
      return;
    }
    const question = state.questions[questionIndex];
    const { explanation, learningTip, correctOptionId, ...clientQuestion } =
      question;
    console.log(
      `[GameService] Emitting 'question:new' for session ${sessionId}, Q${
        questionIndex + 1
      }.`
    );
    socketService.emitToParticipant(participantId, "question:new", {
      question: clientQuestion,
      questionNumber: questionIndex + 1,
    });
  }

  public async handleNextPracticeQuestion(
    sessionId: string,
    participantId: string
  ) {
    console.log(
      `[GameService] Handling request for next practice question for session ${sessionId}, participant ${participantId}.`
    );
    await this.sendNextPracticeQuestion(sessionId, participantId);
  }

  public async handleAnswer(
    sessionId: string,
    participantId: string,
    questionId: string,
    optionId: string
  ) {
    console.log(
      `[GameService] Handling answer for session ${sessionId}, participant ${participantId}, Q: ${questionId}, Option: ${optionId}.`
    );
    let state = await stateManager.get(sessionId);
    if (!state) {
      console.warn(
        `[GameService] State not found for session ${sessionId} during answer handling.`
      );
      return;
    }

    if (state.gameMode === GameMode.PRACTICE) {
      const question = state.questions.find((q) => q.id === questionId);
      if (!question) {
        console.warn(
          `[GameService] Question ${questionId} not found in state for practice session ${sessionId}.`
        );
        return;
      }
      const isCorrect = question.correctOptionId === optionId;
      state.results[participantId].push({
        questionId,
        timeTaken: 0,
        action: "answered",
        correct: isCorrect,
      });
      state.userProgress[participantId]++;
      await stateManager.set(sessionId, state);
      console.log(
        `[GameService] Emitting 'answer:feedback' for practice session ${sessionId}. Correct: ${isCorrect}`
      );
      socketService.emitToParticipant(participantId, "answer:feedback", {
        correct: isCorrect,
        correctOptionId: question.correctOptionId,
        explanation: question.explanation,
        learningTip: question.learningTip,
      });
      return;
    }

    if (state.gameMode === GameMode.FASTEST_FINGER_FIRST) {
      console.log(
        `[GameService] Deferring to Fastest Finger answer handler for session ${sessionId}.`
      );
      return this.handleFastestFingerAnswer(sessionId, participantId, optionId);
    }

    console.log(
      `[GameService] Handling Quick Duel answer for session ${sessionId}.`
    );
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
      console.log(
        `[GameService] Score updated for ${participantId} in Quick Duel.`
      );
    }
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    this.sendNextQuestion(sessionId, participantId);
  }

  public async sendNextQuestion(sessionId: string, participantId: string) {
    console.log(
      `[GameService] Sending next Quick Duel question for session ${sessionId}, participant ${participantId}.`
    );
    let state = await stateManager.get(sessionId);
    if (!state || Date.now() >= state.endTime) {
      console.log(
        `[GameService] Session ${sessionId} ended or invalid for next Quick Duel question.`
      );
      return;
    }

    const questionIndex = state.userProgress[participantId] ?? 0;
    const question = state.questions[questionIndex];

    if (question) {
      state.questionSentAt[participantId] = Date.now();
      await stateManager.set(sessionId, state);

      const session = await sessionManager.getSessionWithParticipants(
        sessionId
      );
      const participant = session?.participants.find(
        (p) => p.id === participantId
      );

      if (participant?.isBot) {
        console.log(
          `[GameService] Quick Duel Bot ${participantId} is answering question.`
        );
        const { chosenOptionId, delay } = botAI.getBotAnswer(
          question,
          GameMode.QUICK_DUEL
        );
        setTimeout(
          () =>
            this.handleAnswer(
              sessionId,
              participantId,
              question.id,
              chosenOptionId
            ),
          delay
        );
      } else {
        console.log(
          `[GameService] Emitting 'question:new' to participant ${participantId} for Quick Duel.`
        );
        const { explanation, learningTip, correctOptionId, ...clientQuestion } =
          question;
        socketService.emitToParticipant(
          participantId,
          "question:new",
          clientQuestion
        );
      }
    } else {
      console.log(
        `[GameService] Participant ${participantId} finished all Quick Duel questions.`
      );
      socketService.emitToParticipant(participantId, "participant:finished", {
        reason: "No more questions",
      });
    }
  }

  private async startFastestFingerQuestion(sessionId: string) {
    console.log(
      `[GameService] Starting new Fastest Finger question for session ${sessionId}.`
    );
    let state = await stateManager.get(sessionId);
    if (
      !state ||
      state.currentQuestionIndex! >= state.questions.length ||
      Date.now() >= state.endTime
    ) {
      console.log(
        `[GameService] Fastest Finger session ${sessionId} ended or invalid for new question.`
      );
      return this.endGame(sessionId);
    }
    const question = state.questions[state.currentQuestionIndex!];
    state.questionStartTime = Date.now();
    state.questionAnswers = [];
    await stateManager.set(sessionId, state);

    console.log(
      `[GameService] Emitting 'ff:new_question' to room ${sessionId}. Q: ${
        state.currentQuestionIndex! + 1
      }`
    );
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
    await stateManager.setTimerJobId(sessionId, jobId);

    const session = await sessionManager.getSessionWithParticipants(sessionId);
    session?.participants.forEach((p) => {
      if (p.isBot) {
        console.log(
          `[GameService] Fastest Finger Bot ${p.id} is answering question.`
        );
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
    console.log(
      `[GameService] Handling Fastest Finger answer for session ${sessionId}, participant ${participantId}, Option: ${optionId}.`
    );
    let state = await stateManager.get(sessionId);
    if (!state) {
      console.warn(
        `[GameService] State not found for session ${sessionId} during FFF answer.`
      );
      return;
    }

    const currentQuestion = state.questions[state.currentQuestionIndex!];
    if (
      !currentQuestion ||
      state.questionAnswers!.some((a) => a.participantId === participantId) ||
      Date.now() > state.questionStartTime! + state.timePerQuestion!
    ) {
      console.log(
        `[GameService] FFF answer ignored. Q: ${currentQuestion?.id}, Participant: ${participantId}, Already answered or timed out.`
      );
      return;
    }

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
    console.log(
      `[GameService] Emitting 'ff:player_answered' for session ${sessionId}, participant ${participantId}.`
    );
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
        console.log(
          `[GameService] Emitting 'ff:point_awarded' for session ${sessionId}. Winner: ${participantId}.`
        );
        socketService.emitToRoom(sessionId, "ff:point_awarded", {
          participantId,
          allScores: state.scores,
          correctOptionId: currentQuestion.correctOptionId,
        });

        const jobIdToCancel = await stateManager.getTimerJobId(sessionId);
        if (jobIdToCancel) {
          console.log(
            `[GameService] Cancelling FFF question timeout job ${jobIdToCancel} for session ${sessionId}.`
          );
          await queueService.removeJob("game-timers", jobIdToCancel);
          await stateManager.delTimerJobId(sessionId);
        }
        setTimeout(() => this.moveToNextFastestFingerQuestion(sessionId), 2000);
      }
    }
  }

  public async processFastestFingerTimeout(
    sessionId: string,
    questionId: string
  ) {
    console.log(
      `[GameService] Processing Fastest Finger timeout for session ${sessionId}, Q: ${questionId}.`
    );
    let state = await stateManager.get(sessionId);
    if (
      !state ||
      state.questions[state.currentQuestionIndex!].id !== questionId ||
      state.questionAnswers!.some((a) => a.correct)
    ) {
      console.log(
        `[GameService] FFF timeout skipped. State invalid, question mismatch, or already answered correctly.`
      );
      return;
    }

    const currentQuestion = state.questions[state.currentQuestionIndex!];
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    session?.participants.forEach((p) => {
      if (!state.questionAnswers!.some((a) => a.participantId === p.id)) {
        console.log(
          `[GameService] Participant ${p.id} timed out in FFF question.`
        );
        state.results[p.id].push({
          questionId: currentQuestion.id,
          timeTaken: state.timePerQuestion!,
          action: "timeout",
          correct: false,
        });
      }
    });
    await stateManager.set(sessionId, state);
    console.log(
      `[GameService] Emitting 'ff:question_timeout' for session ${sessionId}.`
    );
    socketService.emitToRoom(sessionId, "ff:question_timeout", {
      questionNumber: state.currentQuestionIndex! + 1,
      correctOptionId: currentQuestion.correctOptionId,
    });
    this.moveToNextFastestFingerQuestion(sessionId);
  }

  private async moveToNextFastestFingerQuestion(sessionId: string) {
    console.log(
      `[GameService] Moving to next Fastest Finger question for session ${sessionId}.`
    );
    let state = await stateManager.get(sessionId);
    if (!state) {
      console.warn(
        `[GameService] State not found for session ${sessionId} during FFF next question.`
      );
      return;
    }
    state.currentQuestionIndex!++;
    await stateManager.set(sessionId, state);
    setTimeout(() => this.startFastestFingerQuestion(sessionId), 1000);
  }

  public async handleSkip(sessionId: string, participantId: string) {
    console.log(
      `[GameService] Handling skip for session ${sessionId}, participant ${participantId}.`
    );
    let state = await stateManager.get(sessionId);
    if (!state || state.gameMode === GameMode.FASTEST_FINGER_FIRST) {
      console.warn(
        `[GameService] Skip ignored for session ${sessionId}. Game mode: ${state?.gameMode}`
      );
      return;
    }

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
      console.log(
        `[GameService] Question ${question.id} skipped by ${participantId}.`
      );
    }
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    this.sendNextQuestion(sessionId, participantId);
  }

  public async endGame(sessionId: string) {
    console.log(`[GameService] Ending game session ${sessionId}.`);
    await queueService.removeJob("game-timers", `game-end:${sessionId}`);
    const questionJobId = await stateManager.getTimerJobId(sessionId);
    if (questionJobId) {
      await queueService.removeJob("game-timers", questionJobId);
      await stateManager.delTimerJobId(sessionId);
    }

    const state = await stateManager.get(sessionId);
    if (!state) {
      console.warn(
        `[GameService] State not found for session ${sessionId} during endgame.`
      );
      return;
    }

    await stateManager.del(sessionId);

    if (state.gameMode === GameMode.QUICK_DUEL) {
      for (const pId in state.questionSentAt) {
        const startTime = state.questionSentAt[pId];
        if (startTime) {
          const q = state.questions[state.userProgress[pId] ?? 0];
          if (q)
            state.results[pId].push({
              questionId: q.id,
              timeTaken: state.endTime - startTime,
              action: "timeout",
              correct: false,
            });
        }
      }
    }
    await sessionManager.end(sessionId, state.scores);

    const eventName =
      state.gameMode === GameMode.FASTEST_FINGER_FIRST
        ? "ff:game_end"
        : "game:end";
    console.log(`[GameService] Emitting '${eventName}' to room ${sessionId}.`);
    socketService.emitToRoom(sessionId, eventName, {
      scores: state.scores,
      results: state.results,
    });
  }
}

export const gameService = new GameService();
