// src/lib/services/game.service.ts
import prisma from '../prisma/client';
import { Difficulty, GameMode, GameStatus } from '@prisma/client';
import { socketService } from '../websocket/socket.service';
import { redis } from '../redis/client';
import { calculateElo } from '../game/elo';
import { queueService } from '../queue/config'; // Import the queue service

const QUESTIONS_PER_BATCH = 50;
const FFF_MAX_QUESTION_TIME = 30000;

// --- INTERFACES ---
interface Question { id: string; text: string; options: { id: string; text: string }[]; correctOptionId: string; }
interface AnswerData { questionId: string; timeTaken: number; action: 'answered' | 'skipped' | 'timeout'; correct?: boolean; }
interface FastestFingerAnswer { participantId: string; optionId: string; timestamp: number; correct: boolean; }

interface GameState {
  questions: Question[]; scores: Record<string, number>; difficulty: Difficulty; endTime: number;
  results: Record<string, AnswerData[]>; gameMode: GameMode; userProgress: Record<string, number>;
  questionSentAt: Record<string, number>; timePerQuestion?: number; currentQuestionIndex?: number;
  questionAnswers?: FastestFingerAnswer[]; questionStartTime?: number;
}

// --- BOT AI HELPERS ---
function getBotAccuracy(elo: number): number {
  const minElo = 600, maxElo = 2800, minAcc = 0.70, maxAcc = 0.99;
  if (elo <= minElo) return minAcc; if (elo >= maxElo) return maxAcc;
  return minAcc + ((elo - minElo) / (maxElo - minElo)) * (maxAcc - minAcc);
}
function getBotDelay(elo: number, gameMode: GameMode): number {
    const minElo = 600, maxElo = 2800; let baseMaxDelay, baseMinDelay, minHumanDelay, maxHumanDelay;
    if (gameMode === GameMode.FASTEST_FINGER_FIRST) { baseMaxDelay = 2500; baseMinDelay = 500; minHumanDelay = 500; maxHumanDelay = 5000; } 
    else { baseMaxDelay = 4000; baseMinDelay = 1000; minHumanDelay = 800; maxHumanDelay = 12000; }
    let baseDelay = (elo <= minElo) ? baseMaxDelay : (elo >= maxElo) ? baseMinDelay : baseMaxDelay - ((elo - minElo) / (maxElo - minElo)) * (baseMaxDelay - baseMinDelay);
    let finalDelay = baseDelay + (Math.random() - 0.5) * 2 * (baseDelay * 0.3);
    if (Math.random() < 0.1) finalDelay *= 1.5 + Math.random() * 1.5; if (Math.random() < 0.15 && !(Math.random() < 0.1)) finalDelay *= 0.4 + Math.random() * 0.4;
    finalDelay *= 0.7 + (Math.max(0.5, (elo - minElo) / (maxElo - minElo)) * 0.6);
    return Math.round(Math.max(minHumanDelay, Math.min(maxHumanDelay, finalDelay)));
}

// --- GAME SERVICE CLASS ---
class GameService {
  private getDifficultyFromElo = (elo: number): Difficulty => {
    if (elo < 1300) return Difficulty.EASY; if (elo < 1600) return Difficulty.MEDIUM; return Difficulty.HARD;
  };

  private fetchQuestions = async (difficulty: Difficulty, count: number): Promise<Question[]> => {
    const total = await prisma.question.count({ where: { difficulty } }); const skip = total > count ? Math.floor(Math.random() * (total - count)) : 0;
    const rawQuestions = await prisma.question.findMany({ where: { difficulty }, take: count, skip, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, text: true, options: { select: { id: true, text: true, isCorrect: true } } },
    });
    return rawQuestions.map(q => ({ ...q, correctOptionId: q.options.find(opt => opt.isCorrect)!.id, options: q.options.map(({ isCorrect, ...rest }) => rest) }));
  };

  private async createSession(playerIds: string[], botCount: number, duration: number, difficulty: Difficulty, gameMode: GameMode, timePerQuestion?: number) {
    const botUserIds: string[] = [];
    if (botCount > 0) { for (let i = 0; i < botCount; i++) { const botId = `BOT_${Date.now()}_${i}`; botUserIds.push(botId); await prisma.userProfile.create({ data: { userId: botId, eloRating: 1200, onboardingState: {} } }); } }
    const session = await prisma.gameSession.create({
      data: { mode: gameMode, status: GameStatus.ACTIVE, participants: { create: [...playerIds, ...botUserIds].map(id => ({ userId: id, isBot: id.startsWith('BOT_') })) } },
      include: { participants: { include: { userProfile: true } } },
    });
    const questions = await this.fetchQuestions(difficulty, QUESTIONS_PER_BATCH);
    const userProgress: Record<string, number> = {}; const results: Record<string, AnswerData[]> = {};
    session.participants.forEach(p => { userProgress[p.id] = 0; results[p.id] = []; });
    const gameState: GameState = {
      questions, userProgress, results, difficulty, gameMode,
      scores: session.participants.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
      endTime: Date.now() + duration * 60 * 1000, questionSentAt: {},
      ...(gameMode === GameMode.FASTEST_FINGER_FIRST && {
        timePerQuestion: Math.min(timePerQuestion || 30000, FFF_MAX_QUESTION_TIME),
        currentQuestionIndex: 0, questionAnswers: [], questionStartTime: 0,
      }),
    };
    await redis.set(`game_state:${session.id}`, JSON.stringify(gameState), 'KEEPTTL');
    const playersInfo = session.participants.map(p => ({ participantId: p.id, userId: p.userId, username: p.userProfile?.username || `Bot`, avatarUrl: p.userProfile?.avatarUrl, elo: p.userProfile?.eloRating }));
    if (gameMode === GameMode.FASTEST_FINGER_FIRST) {
      socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), 'ff:match_found', { sessionId: session.id, players: playersInfo, timePerQuestion: gameState.timePerQuestion, totalQuestions: questions.length });
      setTimeout(() => this.startFastestFingerQuestion(session.id), 3000);
    } else {
      socketService.emitToUsers(session.participants.filter(p => !p.isBot).map(p => p.userId), 'match:found', { sessionId: session.id, players: playersInfo, duration });
      session.participants.forEach(p => this.sendNextQuestion(session.id, p.id));
    }
    const gameEndJobId = `game-end:${session.id}`;
    await queueService.dispatch('game-timers', { sessionId: session.id, questionId: 'game-end' }, { delay: duration * 60 * 1000, jobId: gameEndJobId });
    console.log(`[GameService] Scheduled game end job ${gameEndJobId} in ${duration} minutes.`);
  }

  public async startDuel(p1Id: string, p2Id: string, duration: number) { const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [p1Id, p2Id] } } }); const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length; await this.createSession([p1Id, p2Id], 0, duration, this.getDifficultyFromElo(avgElo), GameMode.QUICK_DUEL); }
  public async startBotDuel(pId: string, duration: number) { const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: pId } }); await this.createSession([pId], 1, duration, this.getDifficultyFromElo(profile.eloRating), GameMode.QUICK_DUEL); }
  public async startFastestFinger(p1Id: string, p2Id: string, duration: number, time: number) { const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [p1Id, p2Id] } } }); const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length; await this.createSession([p1Id, p2Id], 0, duration, this.getDifficultyFromElo(avgElo), GameMode.FASTEST_FINGER_FIRST, time); }
  public async startFastestFingerBot(pId: string, duration: number, time: number) { const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: pId } }); await this.createSession([pId], 1, duration, this.getDifficultyFromElo(profile.eloRating), GameMode.FASTEST_FINGER_FIRST, time); }

  public async sendNextQuestion(sId: string, pId: string) { const gsStr = await redis.get(`game_state:${sId}`); if (!gsStr) return; const gs: GameState = JSON.parse(gsStr); if (Date.now() >= gs.endTime) return; const idx = gs.userProgress[pId] ?? 0; const q = gs.questions[idx]; if (q) { gs.questionSentAt[pId] = Date.now(); await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL'); const participant = await prisma.gameParticipant.findUnique({ where: { id: pId } }); if (participant?.isBot) { this._simulateQuickDuelBotAnswer(sId, pId, q); } else { socketService.emitToParticipant(pId, 'question:new', q); } } else { socketService.emitToParticipant(pId, 'participant:finished', { reason: 'No more questions' }); } }

  private async startFastestFingerQuestion(sId: string) {
    const gsStr = await redis.get(`game_state:${sId}`); if (!gsStr) return; let gs: GameState = JSON.parse(gsStr);
    if (gs.currentQuestionIndex! >= gs.questions.length || Date.now() >= gs.endTime) { this.endGame(sId); return; }
    const q = gs.questions[gs.currentQuestionIndex!];
    gs.questionStartTime = Date.now(); gs.questionAnswers = [];
    await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL');
    socketService.emitToRoom(sId, 'ff:new_question', { question: q, questionNumber: gs.currentQuestionIndex! + 1, timeLimit: gs.timePerQuestion! });
    
    // NEW: Schedule the timeout using BullMQ
    const jobId = `question-timeout:${sId}:${q.id}`;
    await queueService.dispatch('game-timers', { sessionId: sId, questionId: q.id }, { delay: gs.timePerQuestion!, jobId });
    await redis.set(`ff_timer_job:${sId}`, jobId);
    console.log(`[GameService] Scheduled timeout job ${jobId} for question ${q.id}.`);
    
    const session = await prisma.gameSession.findUnique({ where: { id: sId }, include: { participants: true } });
    session?.participants.forEach(p => { if (p.isBot) this._simulateFastestFingerBotAnswer(sId, p.id, q, gs.timePerQuestion!); });
  }

  public async handleFastestFingerAnswer(sId: string, pId: string, qId: string, oId: string) {
    const gsStr = await redis.get(`game_state:${sId}`); if (!gsStr) return; let gs: GameState = JSON.parse(gsStr);
    const cQ = gs.questions[gs.currentQuestionIndex!];
    if (!cQ || cQ.id !== qId || gs.questionAnswers!.some(a => a.participantId === pId) || Date.now() > (gs.questionStartTime! + gs.timePerQuestion!)) return;
    const isCorrect = cQ.correctOptionId === oId;
    gs.questionAnswers!.push({ participantId: pId, optionId: oId, timestamp: Date.now(), correct: isCorrect });
    gs.results[pId].push({ questionId: qId, timeTaken: Date.now() - gs.questionStartTime!, action: 'answered', correct: isCorrect });
    await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL');
    socketService.emitToRoom(sId, 'ff:player_answered', { participantId: pId, correct: isCorrect });
    if (isCorrect) {
      const correctAnswers = gs.questionAnswers!.filter(a => a.correct);
      if (correctAnswers.length === 1 && correctAnswers[0].participantId === pId) {
        gs.scores[pId] = (gs.scores[pId] || 0) + 1;
        await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL');
        socketService.emitToRoom(sId, 'ff:point_awarded', { participantId: pId, allScores: gs.scores });
        
        // NEW: Cancel the scheduled timeout job.
        const jobIdToCancel = await redis.get(`ff_timer_job:${sId}`);
        if (jobIdToCancel) { await queueService.removeJob('game-timers', jobIdToCancel); await redis.del(`ff_timer_job:${sId}`); console.log(`[GameService] Cancelled timeout job ${jobIdToCancel}.`); }
        
        setTimeout(() => this.moveToNextFastestFingerQuestion(sId), 2000);
      }
    }
  }

  public async processFastestFingerTimeout(sessionId: string, questionId: string) {
    const gsStr = await redis.get(`game_state:${sessionId}`); if (!gsStr) return; let gs: GameState = JSON.parse(gsStr);
    if (gs.questions[gs.currentQuestionIndex!].id !== questionId) { console.warn(`[GameService] Stale timeout job for Q${questionId}. Ignoring.`); return; }
    if (gs.questionAnswers!.some(a => a.correct)) return;
    const cQ = gs.questions[gs.currentQuestionIndex!];
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: { participants: true } });
    session?.participants.forEach(p => { if (!gs.questionAnswers!.some(a => a.participantId === p.id)) gs.results[p.id].push({ questionId: cQ.id, timeTaken: gs.timePerQuestion!, action: 'timeout', correct: false }); });
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gs), 'KEEPTTL');
    socketService.emitToRoom(sessionId, 'ff:question_timeout', { questionNumber: gs.currentQuestionIndex! + 1 });
    this.moveToNextFastestFingerQuestion(sessionId);
  }

  private async moveToNextFastestFingerQuestion(sId: string) {
    const gsStr = await redis.get(`game_state:${sId}`); if (!gsStr) return; let gs: GameState = JSON.parse(gsStr);
    gs.currentQuestionIndex!++; await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL');
    setTimeout(() => this.startFastestFingerQuestion(sId), 1000);
  }
  
  public async handleAnswer(sId: string, pId: string, qId: string, oId: string) {
    const gsStr = await redis.get(`game_state:${sId}`); if (!gsStr) return; let gs: GameState = JSON.parse(gsStr);
    if (gs.gameMode === GameMode.FASTEST_FINGER_FIRST) return this.handleFastestFingerAnswer(sId, pId, qId, oId);
    const question = await prisma.question.findUnique({ where: { id: qId }, include: { options: true } }); if (!question) return;
    const isCorrect = question.options.find(o => o.isCorrect)?.id === oId;
    if (gs.questionSentAt[pId]) { gs.results[pId].push({ questionId: qId, timeTaken: Date.now() - gs.questionSentAt[pId], action: 'answered', correct: isCorrect }); delete gs.questionSentAt[pId]; }
    if (isCorrect) { gs.scores[pId] = (gs.scores[pId] || 0) + 10; socketService.emitToRoom(sId, 'score:update', gs.scores); }
    gs.userProgress[pId]++; await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL');
    await this.sendNextQuestion(sId, pId);
  }

  public async handleSkip(sId: string, pId: string) {
    const gsStr = await redis.get(`game_state:${sId}`); if (!gsStr) return; let gs: GameState = JSON.parse(gsStr);
    if (gs.gameMode === GameMode.FASTEST_FINGER_FIRST) return;
    const startTime = gs.questionSentAt[pId]; const question = gs.questions[gs.userProgress[pId] ?? 0];
    if (startTime && question) { gs.results[pId].push({ questionId: question.id, timeTaken: Date.now() - startTime, action: 'skipped' }); delete gs.questionSentAt[pId]; }
    gs.userProgress[pId]++; await redis.set(`game_state:${sId}`, JSON.stringify(gs), 'KEEPTTL');
    await this.sendNextQuestion(sId, pId);
  }

  private async _simulateQuickDuelBotAnswer(sId: string, pId: string, q: Question) {
    const delay = getBotDelay(1200, GameMode.QUICK_DUEL); const isCorrect = Math.random() < getBotAccuracy(1200);
    const incorrectOpts = q.options.filter(o => o.id !== q.correctOptionId);
    const chosenId = isCorrect ? q.correctOptionId : incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)].id;
    setTimeout(() => this.handleAnswer(sId, pId, q.id, chosenId), delay);
  }

  private async _simulateFastestFingerBotAnswer(sId: string, pId: string, q: Question, time: number) {
    const delay = getBotDelay(1200, GameMode.FASTEST_FINGER_FIRST); const isCorrect = Math.random() < getBotAccuracy(1200);
    const incorrectOpts = q.options.filter(o => o.id !== q.correctOptionId);
    const chosenId = isCorrect ? q.correctOptionId : incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)].id;
    const answerDelay = Math.min(delay, time - 100);
    setTimeout(() => this.handleFastestFingerAnswer(sId, pId, q.id, chosenId), answerDelay);
  }

  public async endGame(sessionId: string) {
    await queueService.removeJob('game-timers', `game-end:${sessionId}`);
    const questionJobId = await redis.get(`ff_timer_job:${sessionId}`);
    if (questionJobId) { await queueService.removeJob('game-timers', questionJobId); await redis.del(`ff_timer_job:${sessionId}`); }
    const gsStr = await redis.get(`game_state:${sessionId}`); if (!gsStr) return;
    await redis.del(`game_state:${sessionId}`);
    let gameState: GameState = JSON.parse(gsStr);
    
    if (gameState.gameMode === GameMode.QUICK_DUEL) {
      for (const pId in gameState.questionSentAt) {
        const startTime = gameState.questionSentAt[pId];
        if (startTime) {
          const q = gameState.questions[gameState.userProgress[pId] ?? 0];
          if (q) gameState.results[pId].push({ questionId: q.id, timeTaken: gameState.endTime - startTime, action: 'timeout', correct: false });
        }
      }
    }
    await prisma.$transaction(async tx => {
      const session = await tx.gameSession.update({ where: { id: sessionId }, data: { status: GameStatus.FINISHED }, include: { participants: { include: { userProfile: true } } } });
      for (const p of session.participants) { await tx.gameParticipant.update({ where: { id: p.id }, data: { score: gameState.scores[p.id] || 0 } }); }
      const humanPlayers = session.participants.filter(p => !p.isBot);
      if (humanPlayers.length === 2) {
        const p1 = humanPlayers[0]; const p2 = humanPlayers[1];
        const scoreA = gameState.scores[p1.id] > gameState.scores[p2.id] ? 1 : (gameState.scores[p1.id] === gameState.scores[p2.id] ? 0.5 : 0);
        const [newP1Elo, newP2Elo] = calculateElo(p1.userProfile!.eloRating, p2.userProfile!.eloRating, scoreA);
        await tx.userProfile.update({ where: { userId: p1.userId }, data: { eloRating: newP1Elo } });
        await tx.userProfile.update({ where: { userId: p2.userId }, data: { eloRating: newP2Elo } });
      }
    });
    
    const eventName = gameState.gameMode === GameMode.FASTEST_FINGER_FIRST ? 'ff:game_end' : 'game:end';
    socketService.emitToRoom(sessionId, eventName, { scores: gameState.scores, results: gameState.results });
  }
}

export const gameService = new GameService();
