// src/lib/game/session/session.manager.ts
import prisma from '@/lib/prisma/client';
import { GameMode, GameStatus } from '@prisma/client';
import { calculateElo } from '@/lib/game/elo'; // Assuming elo.ts is in lib/game

class SessionManager {
  public async create(playerIds: string[], botCount: number, gameMode: GameMode) {
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
    return await prisma.gameSession.create({
      data: {
        mode: gameMode,
        status: GameStatus.ACTIVE,
        participants: {
          create: [...playerIds, ...botUserIds].map((id) => ({
            userId: id,
            isBot: id.startsWith("BOT_"),
          })),
        },
      },
      include: { participants: { include: { userProfile: true } } },
    });
  }

  public async getSessionWithParticipants(sessionId: string) {
    return await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
  }

  public async end(sessionId: string, scores: Record<string, number>) {
    await prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.update({
        where: { id: sessionId },
        data: { status: GameStatus.FINISHED },
        include: { participants: { include: { userProfile: true } } },
      });
      
      for (const p of session.participants) {
        await tx.gameParticipant.update({
          where: { id: p.id },
          data: { score: scores[p.id] || 0 },
        });
      }

      const humanPlayers = session.participants.filter((p) => !p.isBot);
      if (humanPlayers.length === 2) {
        const p1 = humanPlayers[0];
        const p2 = humanPlayers[1];
        const scoreA = scores[p1.id] > scores[p2.id] ? 1 : scores[p1.id] === scores[p2.id] ? 0.5 : 0;
        const [newP1Elo, newP2Elo] = calculateElo(p1.userProfile!.eloRating, p2.userProfile!.eloRating, scoreA);
        
        await tx.userProfile.update({ where: { userId: p1.userId }, data: { eloRating: newP1Elo } });
        await tx.userProfile.update({ where: { userId: p2.userId }, data: { eloRating: newP2Elo } });
      }
    });
  }
}

export const sessionManager = new SessionManager();
