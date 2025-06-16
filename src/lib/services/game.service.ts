// src/lib/services/game.service.ts

import prisma from '../prisma/client';
import { Difficulty, GameMode } from '@prisma/client';
import { socketService } from '../websocket/socket.service';
import { redis } from '../redis/client';
import { calculateElo } from '../game/elo';

const QUESTIONS_PER_BATCH = 20;

interface GameState {
  questions: { id: string; text: string; options: { id: string; text: string }[]; correctOptionId: string }[];
  scores: Record<string, number>;
  difficulty: Difficulty;
  endTime: number;
}

class GameService {
  private getDifficultyFromElo = (elo: number) => {
    if (elo < 1300) return Difficulty.EASY;
    if (elo < 1600) return Difficulty.MEDIUM;
    return Difficulty.HARD;
  };

  private fetchQuestions = async (difficulty: Difficulty, count: number) => {
    const total = await prisma.question.count({ where: { difficulty } });
    const skip = total > count ? Math.floor(Math.random() * (total - count)) : 0;
    const rawQuestions = await prisma.question.findMany({
      where: { difficulty }, take: count, skip,
      select: { id: true, text: true, options: { select: { id: true, text: true, isCorrect: true } } },
    });
    return rawQuestions.map(q => ({
      ...q,
      correctOptionId: q.options.find(opt => opt.isCorrect)!.id,
      options: q.options.map(opt => ({ id: opt.id, text: opt.text }))
    }));
  };

  private async createSession(playerIds: string[], botCount: number, duration: number, difficulty: Difficulty) {
    const botUserIds: string[] = [];

    // --- FIX IS HERE: CREATE BOT PROFILES BEFORE THE GAME ---
    if (botCount > 0) {
      for (let i = 0; i < botCount; i++) {
        // Generate a unique ID for the bot.
        const botId = `BOT_${Date.now()}_${i}`;
        botUserIds.push(botId);

        // Create a dummy user profile for the bot to satisfy the foreign key constraint.
        await prisma.userProfile.create({
          data: {
            userId: botId,
            eloRating: 1200, // Give the bot a default ELO
            onboardingState: {}, // Default empty state, as it's not a real user
          },
        });
        console.log(`[GameService] Created dummy profile for bot: ${botId}`);
      }
    }
    
    // Combine the real player IDs with the newly created bot IDs.
    const allParticipantIds = [...playerIds, ...botUserIds];

    const session = await prisma.gameSession.create({
      data: {
        mode: GameMode.QUICK_DUEL,
        status: 'ACTIVE',
        participants: {
          create: allParticipantIds.map(id => ({
            userId: id,
            isBot: id.startsWith('BOT_'),
          })),
        },
      },
      include: { participants: { include: { userProfile: true } } },
    });

    const questions = await this.fetchQuestions(difficulty, QUESTIONS_PER_BATCH);
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
        participantId: p.id, userId: p.userId,
        username: p.userProfile?.username,
        avatarUrl: p.userProfile?.avatarUrl,
        elo: p.userProfile?.eloRating
      }))
    });
    
    setTimeout(() => this.endGame(session.id), duration * 60 * 1000);
  }

  async startDuel(player1Id: string, player2Id: string, duration: number) {
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [player1Id, player2Id] } } });
    const avgElo = profiles.reduce((sum, p) => sum + p.eloRating, 0) / profiles.length;
    await this.createSession([player1Id, player2Id], 0, duration, this.getDifficultyFromElo(avgElo));
  }

  async startBotDuel(playerId: string, duration: number) {
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: playerId } });
    await this.createSession([playerId], 1, duration, this.getDifficultyFromElo(profile.eloRating));
  }

  async handleAnswer(sessionId: string, participantId: string, optionId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    let gameState: GameState = JSON.parse(gameStateStr);
    
    const currentQuestion = await prisma.question.findFirst({ where: { options: { some: { id: optionId } } }, include: { options: true } });
    const correctOption = currentQuestion?.options.find(o => o.isCorrect);

    if (correctOption?.id === optionId) {
      gameState.scores[participantId] = (gameState.scores[participantId] || 0) + 10;
    }
    
    await this.sendNextQuestion(sessionId, participantId);
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');
    socketService.emitToRoom(sessionId, 'score:update', gameState.scores);
  }
  
  async handleSkip(sessionId: string, participantId: string) {
    await this.sendNextQuestion(sessionId, participantId);
  }
  
  private async sendNextQuestion(sessionId: string, participantId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    let gameState: GameState = JSON.parse(gameStateStr);
    
    if (Date.now() >= gameState.endTime) return;

    let question = gameState.questions.pop();
    if (!question) {
      gameState.questions = await this.fetchQuestions(gameState.difficulty, QUESTIONS_PER_BATCH);
      question = gameState.questions.pop();
    }
    
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');
    if (question) {
        socketService.emitToParticipant(participantId, 'question:new', question);
    }
  }
  
  private async endGame(sessionId: string) {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) return;
    const gameState: GameState = JSON.parse(gameStateStr);
    
    await prisma.gameSession.update({ where: { id: sessionId }, data: { status: 'FINISHED' } });
    // TODO: Persist scores, calculate and update ELOs...
    
    socketService.emitToRoom(sessionId, 'game:end', { scores: gameState.scores });
    await redis.del(`game_state:${sessionId}`);
  }
}
export const gameService = new GameService();
