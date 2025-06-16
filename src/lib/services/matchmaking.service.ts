// src/lib/services/matchmaking.service.ts

import { redis } from '../redis/client';
import { gameService } from './game.service';

const ELO_RANGE = 50;
const TIMEOUT_SECONDS = 30;

class MatchmakingService {
  private getQueueName = (duration: number) => `matchmaking_players_${duration}min`;

  public async processNewPlayer(userId: string, elo: number, duration: number) {
    const queue = this.getQueueName(duration);
    
    // First, try to find an existing opponent for the new player.
    const minElo = elo - ELO_RANGE;
    const maxElo = elo + ELO_RANGE;

    // Use ZREMRANGEBYSCORE to find and atomically remove the first available opponent.
    // This is a more advanced Redis command that prevents race conditions.
    const opponents = await redis.zrangebyscore(queue, minElo, maxElo, 'LIMIT', 0, 1);
    
    if (opponents.length > 0) {
      const opponentString = opponents[0];
      const opponentId = opponentString.split(':')[0];

      // Ensure we don't match with ourselves in a race condition.
      if (opponentId !== userId) {
        // Atomically remove the opponent we found.
        const removed = await redis.zrem(queue, opponentString);
        if (removed > 0) {
          console.log(`[Matchmaking] Match found! Pairing new player ${userId} with waiting player ${opponentId}`);
          await gameService.startDuel(userId, opponentId, duration);
          return; // Success, we are done.
        }
      }
    }

    // If no match was found (or we found ourselves), add the new player to the queue to wait.
    console.log(`[Matchmaking] No opponent found for ${userId}. Adding to queue.`);
    
    // Before adding, ensure the user isn't already in the queue from a failed job.
    // This prevents the duplicate user issue.
    const userEntries = await redis.zrangebylex(queue, `[${userId}:`, `[${userId}:\xff`);
    if (userEntries.length > 0) {
        await redis.zrem(queue, ...userEntries);
        console.log(`[Matchmaking] Cleaned up stale entries for ${userId}.`);
    }

    await redis.zadd(queue, elo, `${userId}:${Date.now()}`);
  }
  
  public async processTimeouts() {
    for (const duration of [1, 2, 5]) {
      const queue = this.getQueueName(duration);
      const allPlayers = await redis.zrange(queue, 0, -1);
      
      for (const playerString of allPlayers) {
        const [userId, timestampStr] = playerString.split(':');
        if (Date.now() - parseInt(timestampStr, 10) > TIMEOUT_SECONDS * 1000) {
          if (await redis.zrem(queue, playerString) > 0) {
            console.log(`[Matchmaking] User ${userId} timed out in ${queue}. Matching with bot.`);
            await gameService.startBotDuel(userId, duration);
          }
        }
      }
    }
  }
}

export const matchmakingService = new MatchmakingService();
