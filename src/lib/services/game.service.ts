// src/lib/game/game.service.ts
import { GameMode, Difficulty } from "@prisma/client";
import { socketService } from "@/lib/websocket/socket.service";
import { queueService } from "@/lib/queue/config";
import { sessionManager } from "./game/session/session.manager";
import { questionManager } from "./game/question/question.manager";
import { stateManager } from "./game/state/state.manager";
import { botAI } from "./game/bot/bot.ai";
import { GameState, Question, AnswerData } from "./game/types";
import prisma from '@/lib/prisma/client';

const FFF_MAX_QUESTION_TIME = 30000;

class GameService {
  private async initializeGame(playerIds: string[], botCount: number, duration: number, gameMode: GameMode, timePerQuestion?: number, avgElo: number = 1200) {
    const difficulty = questionManager.getDifficultyFromElo(avgElo);
    const session = await sessionManager.create(playerIds, botCount, gameMode);
    const questions = await questionManager.fetchQuestions(difficulty);

    const userProgress: Record<string, number> = {};
    const results: Record<string, AnswerData[]> = {};
    session.participants.forEach(p => { userProgress[p.id] = 0; results[p.id] = []; });

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

    const playersInfo = session.participants.map(p => ({
      participantId: p.id, userId: p.userId, username: p.userProfile?.username || `Bot`,
      avatarUrl: p.userProfile?.avatarUrl, elo: p.userProfile?.eloRating,
    }));

    const baseEventPayload = { sessionId: session.id, players: playersInfo, duration };
    if (gameMode === GameMode.FASTEST_FINGER_FIRST) {
      socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), "ff:match_found", {
        ...baseEventPayload, timePerQuestion: gameState.timePerQuestion, totalQuestions: questions.length,
      });
      setTimeout(() => this.startFastestFingerQuestion(session.id), 3000);
    } else {
      socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), "match:found", baseEventPayload);
      session.participants.forEach(p => this.sendNextQuestion(session.id, p.id));
    }

    const gameEndJobId = `game-end:${session.id}`;
    await queueService.dispatch("game-timers", { sessionId: session.id, questionId: "game-end" }, { delay: duration * 60 * 1000, jobId: gameEndJobId });
  }

  public async startDuel(p1Id: string, p2Id: string, duration: number) {
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [p1Id, p2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.initializeGame([p1Id, p2Id], 0, duration, GameMode.QUICK_DUEL, undefined, avgElo);
  }

  public async startBotDuel(pId: string, duration: number) {
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: pId } });
    await this.initializeGame([pId], 1, duration, GameMode.QUICK_DUEL, undefined, profile.eloRating);
  }

  public async startFastestFinger(p1Id: string, p2Id: string, duration: number, time: number) {
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [p1Id, p2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.initializeGame([p1Id, p2Id], 0, duration, GameMode.FASTEST_FINGER_FIRST, time, avgElo);
  }

  public async startFastestFingerBot(pId: string, duration: number, time: number) {
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: pId } });
    await this.initializeGame([pId], 1, duration, GameMode.FASTEST_FINGER_FIRST, time, profile.eloRating);
  }

  public async sendNextQuestion(sessionId: string, participantId: string) {
    let state = await stateManager.get(sessionId);
    if (!state || Date.now() >= state.endTime) return;
    
    const questionIndex = state.userProgress[participantId] ?? 0;
    const question = state.questions[questionIndex];
    
    if (question) {
      state.questionSentAt[participantId] = Date.now();
      await stateManager.set(sessionId, state);
      
      const session = await sessionManager.getSessionWithParticipants(sessionId);
      const participant = session?.participants.find(p => p.id === participantId);

      if (participant?.isBot) {
        const { chosenOptionId, delay } = botAI.getBotAnswer(question, GameMode.QUICK_DUEL);
        setTimeout(() => this.handleAnswer(sessionId, participantId, question.id, chosenOptionId), delay);
      } else {
        socketService.emitToParticipant(participantId, "question:new", question);
      }
    } else {
      socketService.emitToParticipant(participantId, "participant:finished", { reason: "No more questions" });
    }
  }

  private async startFastestFingerQuestion(sessionId: string) {
    let state = await stateManager.get(sessionId);
    if (!state || state.currentQuestionIndex! >= state.questions.length || Date.now() >= state.endTime) {
      return this.endGame(sessionId);
    }
    const question = state.questions[state.currentQuestionIndex!];
    state.questionStartTime = Date.now();
    state.questionAnswers = [];
    await stateManager.set(sessionId, state);
    
    socketService.emitToRoom(sessionId, "ff:new_question", { question, questionNumber: state.currentQuestionIndex! + 1, timeLimit: state.timePerQuestion! });

    const jobId = `question-timeout:${sessionId}:${question.id}`;
    await queueService.dispatch("game-timers", { sessionId, questionId: question.id }, { delay: state.timePerQuestion!, jobId });
    await stateManager.setTimerJobId(sessionId, jobId);
    
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    session?.participants.forEach(p => {
      if (p.isBot) {
        const { chosenOptionId, delay } = botAI.getBotAnswer(question, GameMode.FASTEST_FINGER_FIRST, state.timePerQuestion);
        setTimeout(() => this.handleFastestFingerAnswer(sessionId, p.id, chosenOptionId), delay);
      }
    });
  }

  public async handleFastestFingerAnswer(sessionId: string, participantId: string, optionId: string) {
    let state = await stateManager.get(sessionId);
    if (!state) return;
    
    const currentQuestion = state.questions[state.currentQuestionIndex!];
    if (!currentQuestion || state.questionAnswers!.some(a => a.participantId === participantId) || Date.now() > (state.questionStartTime! + state.timePerQuestion!)) return;

    const isCorrect = currentQuestion.correctOptionId === optionId;
    state.questionAnswers!.push({ participantId, optionId, timestamp: Date.now(), correct: isCorrect });
    state.results[participantId].push({ questionId: currentQuestion.id, timeTaken: Date.now() - state.questionStartTime!, action: "answered", correct: isCorrect });
    
    await stateManager.set(sessionId, state);
    
    // ** THE LOGIC FIX **
    // This event now ONLY informs that a player answered. It does NOT reveal the correct answer.
    socketService.emitToRoom(sessionId, "ff:player_answered", { participantId, correct: isCorrect });

    // If the answer was correct, the round ends.
    if (isCorrect) {
      const correctAnswers = state.questionAnswers!.filter(a => a.correct);
      // Ensure this is the first correct answer to avoid race conditions.
      if (correctAnswers.length === 1 && correctAnswers[0].participantId === participantId) {
        state.scores[participantId] = (state.scores[participantId] || 0) + 1;
        await stateManager.set(sessionId, state);

        // NOW we can reveal the correct answer, because the round is won.
        socketService.emitToRoom(sessionId, "ff:point_awarded", { participantId, allScores: state.scores, correctOptionId: currentQuestion.correctOptionId });

        const jobIdToCancel = await stateManager.getTimerJobId(sessionId);
        if (jobIdToCancel) {
          await queueService.removeJob("game-timers", jobIdToCancel);
          await stateManager.delTimerJobId(sessionId);
        }
        setTimeout(() => this.moveToNextFastestFingerQuestion(sessionId), 2000);
      }
    }
    // If the answer was incorrect, we do nothing else. The round continues for other players.
  }

  public async processFastestFingerTimeout(sessionId: string, questionId: string) {
    let state = await stateManager.get(sessionId);
    if (!state) return;

    // Stale job check
    if (state.questions[state.currentQuestionIndex!].id !== questionId) return; 
    // If someone already answered correctly, this timeout is stale.
    if (state.questionAnswers!.some(a => a.correct)) return; 

    const currentQuestion = state.questions[state.currentQuestionIndex!];
    const session = await sessionManager.getSessionWithParticipants(sessionId);
    session?.participants.forEach(p => {
      if (!state.questionAnswers!.some(a => a.participantId === p.id))
        state.results[p.id].push({ questionId: currentQuestion.id, timeTaken: state.timePerQuestion!, action: "timeout", correct: false });
    });
    await stateManager.set(sessionId, state);
    
    // The round is over due to timeout, so NOW we can reveal the correct answer.
    socketService.emitToRoom(sessionId, "ff:question_timeout", { questionNumber: state.currentQuestionIndex! + 1, correctOptionId: currentQuestion.correctOptionId });
    this.moveToNextFastestFingerQuestion(sessionId);
  }

  private async moveToNextFastestFingerQuestion(sessionId: string) {
    let state = await stateManager.get(sessionId);
    if (!state) return;
    state.currentQuestionIndex!++;
    await stateManager.set(sessionId, state);
    setTimeout(() => this.startFastestFingerQuestion(sessionId), 1000);
  }

  public async handleAnswer(sessionId: string, participantId: string, questionId: string, optionId: string) {
    let state = await stateManager.get(sessionId);
    if (!state) return;
    if (state.gameMode === GameMode.FASTEST_FINGER_FIRST) return this.handleFastestFingerAnswer(sessionId, participantId, optionId);
    
    const isCorrect = state.questions.find(q => q.id === questionId)?.correctOptionId === optionId;
    if (state.questionSentAt[participantId]) {
      state.results[participantId].push({ questionId, timeTaken: Date.now() - state.questionSentAt[participantId], action: "answered", correct: isCorrect });
      delete state.questionSentAt[participantId];
    }
    if (isCorrect) {
      state.scores[participantId] = (state.scores[participantId] || 0) + 10;
      socketService.emitToRoom(sessionId, "score:update", state.scores);
    }
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    await this.sendNextQuestion(sessionId, participantId);
  }

  public async handleSkip(sessionId: string, participantId: string) {
    let state = await stateManager.get(sessionId);
    if (!state) return;
    if (state.gameMode === GameMode.FASTEST_FINGER_FIRST) return;
    
    const startTime = state.questionSentAt[participantId];
    const question = state.questions[state.userProgress[participantId] ?? 0];
    if (startTime && question) {
      state.results[participantId].push({ questionId: question.id, timeTaken: Date.now() - startTime, action: "skipped", correct: false });
      delete state.questionSentAt[participantId];
    }
    state.userProgress[participantId]++;
    await stateManager.set(sessionId, state);
    await this.sendNextQuestion(sessionId, participantId);
  }

  public async endGame(sessionId: string) {
    await queueService.removeJob("game-timers", `game-end:${sessionId}`);
    const questionJobId = await stateManager.getTimerJobId(sessionId);
    if (questionJobId) {
      await queueService.removeJob("game-timers", questionJobId);
      await stateManager.delTimerJobId(sessionId);
    }

    const state = await stateManager.get(sessionId);
    if (!state) return;
    
    await stateManager.del(sessionId);

    if (state.gameMode === GameMode.QUICK_DUEL) {
      for (const pId in state.questionSentAt) {
        const startTime = state.questionSentAt[pId];
        if (startTime) {
          const q = state.questions[state.userProgress[pId] ?? 0];
          if (q) state.results[pId].push({ questionId: q.id, timeTaken: state.endTime - startTime, action: "timeout", correct: false });
        }
      }
    }
    await sessionManager.end(sessionId, state.scores);

    const eventName = state.gameMode === GameMode.FASTEST_FINGER_FIRST ? "ff:game_end" : "game:end";
    socketService.emitToRoom(sessionId, eventName, { scores: state.scores, results: state.results });
  }
}

export const gameService = new GameService();
