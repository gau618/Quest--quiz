// src/lib/game/session/session.manager.ts
import prisma from '@/lib/prisma/client';
import { GameMode, GameStatus } from '@prisma/client';

class SessionManager {
  async create(userIds: string[], botCount: number, gameMode: GameMode) {
    console.log(`[SessionManager] Creating new session in WAITING state. Mode: ${gameMode}, Users: ${userIds.join(', ')}, Bots: ${botCount}`);
    
    if (userIds.length > 0) {
      const existingProfiles = await prisma.userProfile.count({ where: { userId: { in: userIds } } });
      if (existingProfiles !== userIds.length) {
        throw new Error(`One or more user profiles not found for provided userIds: ${userIds.join(', ')}`);
      }
    }

    const session = await prisma.gameSession.create({
      data: {
        mode: gameMode,
        status: GameStatus.WAITING,
        participants: {
          create: userIds.map(userId => ({
            score: 0,
            isBot: false,
            userProfile: {
              connect: { userId: userId }
            }
          }))
        }
      },
    });

    for (let i = 0; i < botCount; i++) {
      const botId = `bot-${session.id.slice(-8)}-${i}`;
      console.log(`[SessionManager] Creating UserProfile for bot with ID: ${botId}`);
      
      const botProfile = await prisma.userProfile.create({
        data: {
          userId: botId,
          username: `Bot ${botId.slice(0, 4)}`,
          name: 'AI Player',
          eloRating: 1200,
        }
      });
      
      console.log(`[SessionManager] UserProfile for bot ${botId} created. Now creating GameParticipant.`);

      // ** THE CRITICAL FIX IS HERE **
      // Use `gameSession: { connect: { ... } }` instead of the scalar `gameSessionId` field.
      await prisma.gameParticipant.create({
        data: {
          score: 0,
          isBot: true,
          // Connect to the parent session
          gameSession: {
            connect: {
              id: session.id,
            },
          },
          // Connect to the newly created bot profile
          userProfile: {
            connect: {
              userId: botProfile.userId
            }
          }
        }
      });
    }

    const fullSession = await this.getSessionWithParticipants(session.id);
    if (!fullSession) throw new Error("Failed to retrieve newly created session with all participants.");

    console.log(`[SessionManager] Session ${fullSession.id} created successfully with ${fullSession.participants.length} participants.`);
    return fullSession;
  }

  async activate(sessionId: string) {
    console.log(`[SessionManager] Activating session ${sessionId}. Status: WAITING -> ACTIVE`);
    return prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: GameStatus.ACTIVE },
    });
  }

  async end(sessionId: string, finalScores: Record<string, number>) {
    console.log(`[SessionManager] Ending session ${sessionId}. Status -> FINISHED.`);
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: GameStatus.FINISHED, finishedAt: new Date() },
    });

    for (const participantId in finalScores) {
      await prisma.gameParticipant.update({
        where: { id: participantId },
        data: { score: finalScores[participantId] }
      }).catch(err => {
        console.warn(`[SessionManager] Could not update score for participant ${participantId}: ${err.message}`);
      });
    }
  }

  async cancel(sessionId: string) {
    console.log(`[SessionManager] Cancelling session ${sessionId}. Status -> CANCELLED`);
    return prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: GameStatus.CANCELLED },
    });
  }

  async getSessionWithParticipants(sessionId: string) {
    return prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: { include: { userProfile: true } }
      }
    });
  }
}

export const sessionManager = new SessionManager();
