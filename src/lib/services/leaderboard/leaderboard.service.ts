// src/lib/services/leaderboard.service.ts

import { redis } from "@/lib/redis/client"; // Assuming this is the correct path to your Redis client
import prisma from "@/lib/prisma/client"; // Using a standard path for the Prisma client

// Define how long leaderboard data should be cached (e.g., 5 minutes)
const CACHE_EXPIRATION_SECONDS = 60 * 5;

export const leaderboardService = {
  /**
   * Fetches the global leaderboard, ordered by ELO or XP.
   * This method uses a cache-aside strategy for performance.
   * @param limit - The number of top players to return.
   * @param orderBy - The field to sort by ('eloRating' or 'xp').
   * @returns A ranked list of user profiles.
   */
  async getGlobalLeaderboard(
    limit: number = 100,
    orderBy: "eloRating" | "xp" = "eloRating"
  ) {
    const cacheKey = `leaderboard:global:${orderBy}:${limit}`;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(
          `[LeaderboardService] Serving global leaderboard from cache: ${cacheKey}`
        );
        return JSON.parse(cachedData);
      }
    } catch (error) {
      console.error(
        "[Redis Error] Failed to get global leaderboard from cache:",
        error
      );
    }

    console.log(
      `[LeaderboardService] Fetching global leaderboard from DB: ${cacheKey}`
    );
    const leaderboard = await prisma.userProfile.findMany({
       where: {
        // --- NEW FILTERING LOGIC ---
        // Exclude users whose usernames start with "Bot" or "bot-"
        NOT: {
          OR: [
            { username: { startsWith: 'Bot', mode: 'insensitive' } }, // Catches 'Bot', 'bot', etc.
            { username: { startsWith: 'bot-', mode: 'insensitive' } },
          ],
        },
        // If you had the isBot flag, it would simply be: isBot: false
        // --- END OF FILTERING LOGIC ---
      },
      orderBy: { [orderBy]: "desc" },
      take: limit,
      select: {
        userId: true,
        username: true,
        name: true,
        avatarUrl: true,
        eloRating: true,
        xp: true,
        level: true,
      },
    });

    try {
      // --- CORRECTED LINE ---
      // Use redis.set() with the 'EX' option for expiration in seconds[1][5].
      await redis.set(
        cacheKey,
        JSON.stringify(leaderboard),
        "EX",
        CACHE_EXPIRATION_SECONDS
      );
    } catch (error) {
      console.error(
        "[Redis Error] Failed to set global leaderboard cache:",
        error
      );
    }

    return leaderboard;
  },

  /**
   * Fetches a friends-only leaderboard for a specific user.
   * @param userId - The ID of the user whose friends leaderboard to fetch.
   * @param limit - The number of top friends to return.
   * @param orderBy - The field to sort by.
   * @returns A ranked list of the user's friends (and the user themselves).
   */
  async getFriendsLeaderboard(
    userId: string,
    limit: number = 50,
    orderBy: "eloRating" | "xp" = "eloRating"
  ) {
    const cacheKey = `leaderboard:friends:${userId}:${orderBy}:${limit}`;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(
          `[LeaderboardService] Serving friends leaderboard from cache: ${cacheKey}`
        );
        return JSON.parse(cachedData);
      }
    } catch (error) {
      console.error(
        "[Redis Error] Failed to get friends leaderboard from cache:",
        error
      );
    }

    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      select: { user1Id: true, user2Id: true },
    });

    const friendIds = friendships.map((f) =>
      f.user1Id === userId ? f.user2Id : f.user1Id
    );
    friendIds.push(userId); // Always include the current user

    console.log(
      `[LeaderboardService] Fetching friends leaderboard from DB for user ${userId}`
    );
    const leaderboard = await prisma.userProfile.findMany({
      where: { userId: { in: friendIds } },
      orderBy: { [orderBy]: "desc" },
      take: limit,
      select: {
        userId: true,
        username: true,
        name: true,
        avatarUrl: true,
        eloRating: true,
        xp: true,
        level: true,
      },
    });

    try {
      // --- CORRECTED LINE ---
      await redis.set(
        cacheKey,
        JSON.stringify(leaderboard),
        "EX",
        CACHE_EXPIRATION_SECONDS
      );
    } catch (error) {
      console.error(
        "[Redis Error] Failed to set friends leaderboard cache:",
        error
      );
    }

    return leaderboard;
  },

  /**
   * Clears relevant leaderboard caches. Call this after a user's score changes.
   * Uses SCAN instead of KEYS to prevent blocking Redis in production.
   */
  async clearUserCache(userId: string) {
    try {
      const pattern = `leaderboard:friends:${userId}:*`;
      let cursor = '0';
      let deletedCount = 0;
      let iterations = 0;
      const MAX_ITERATIONS = 1000; // Prevent infinite loop - max 100k keys (1000 * 100)
      
      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount += keys.length;
        }
        
        iterations++;
        if (iterations >= MAX_ITERATIONS) {
          console.warn(`[LeaderboardService] Hit max iterations (${MAX_ITERATIONS}) clearing cache for user ${userId}`);
          break;
        }
      } while (cursor !== '0');
      
      if (deletedCount > 0) {
        console.log(
          `[LeaderboardService] Cleared ${deletedCount} friends leaderboard cache keys for user ${userId}.`
        );
      }
    } catch (error) {
      console.error(
        `[Redis Error] Failed to clear user cache for ${userId}:`,
        error
      );
    }
  },

  /**
   * Clears all global leaderboard caches.
   * Uses SCAN instead of KEYS to prevent blocking Redis in production.
   */
  async clearGlobalLeaderboardCache() {
    try {
      const pattern = `leaderboard:global:*`;
      let cursor = '0';
      let deletedCount = 0;
      let iterations = 0;
      const MAX_ITERATIONS = 1000; // Prevent infinite loop - max 100k keys (1000 * 100)
      
      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount += keys.length;
        }
        
        iterations++;
        if (iterations >= MAX_ITERATIONS) {
          console.warn(`[LeaderboardService] Hit max iterations (${MAX_ITERATIONS}) clearing global cache`);
          break;
        }
      } while (cursor !== '0');
      
      if (deletedCount > 0) {
        console.log(
          `[LeaderboardService] Cleared ${deletedCount} global leaderboard cache keys.`
        );
      }
    } catch (error) {
      console.error(
        "[Redis Error] Failed to clear global leaderboards cache:",
        error
      );
    }
  },
};
