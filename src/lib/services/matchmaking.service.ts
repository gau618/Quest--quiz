// src/lib/services/matchmaking.service.ts
import { redis } from '../redis/client';
import { gameService } from './game.service';
import { GameMode } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const ELO_RANGE = 200;
const TIMEOUT_SECONDS = 30; // Max time a player waits in queue before getting a bot
const FFF_DEFAULT_DURATION_MINS = 2; // Should match game.service.ts if used for FF games

// Load the Lua script on service initialization
// process.cwd() is safe here as this is a backend service.
const matchmakingScript = fs.readFileSync(path.join(process.cwd(), 'src/lib/redis/matchmaking.lua'), 'utf8');
console.log('[MatchmakingService] Matchmaking Lua script loaded.');


class MatchmakingService {
  // Generates a unique queue name based on game duration and mode
  private getQueueName = (duration: number, mode: GameMode) => `matchmaking_queue_${mode}_${duration}min`;

  public async processNewPlayer(userId: string, elo: number, duration: number, mode: GameMode, timePerQuestion?: number) {
    console.log(`[MatchmakingService][processNewPlayer] Entry - User: ${userId}, ELO: ${elo}, Mode: ${mode}, Duration: ${duration}min, FFTime: ${timePerQuestion || 'N/A'}`);
    
    const queue = this.getQueueName(duration, mode);
    console.log(`[MatchmakingService][processNewPlayer] Using queue name: '${queue}'`);
    
    const minElo = elo - ELO_RANGE;
    const maxElo = elo + ELO_RANGE;
    const playerDataJson = JSON.stringify({ timestamp: Date.now(), timePerQuestion }); // Data to store with player in queue

    console.log(`[MatchmakingService][processNewPlayer] Executing atomic Lua script for matchmaking.`);
    // Execute the atomic Lua script on Redis
    // KEYS: [queue]
    // ARGV: [userId, elo, minElo, maxElo, playerDataJson]
    const result = await redis.eval(
      matchmakingScript,
      1, // Number of KEYS provided (just 'queue')
      queue, // KEYS[1]
      userId, // ARGV[1]
      elo.toString(), // ARGV[2] (ELO as score)
      minElo.toString(), // ARGV[3]
      maxElo.toString(), // ARGV[4]
      playerDataJson // ARGV[5] (JSON string to store)
    ) as string | null;

    if (result) {
      // --- FIX 1: Robustly parse the result string ---
      // Instead of result.split(':', 2), find the first colon and split manually.
      // This correctly handles JSON that might contain colons.
      const firstColonIndex = result.indexOf(':');
      if (firstColonIndex === -1) {
          console.error(`[MatchmakingService][processNewPlayer] Invalid result from Lua script (no colon found): ${result}`);
          return; // Exit if the result is malformed
      }
      const opponentId = result.substring(0, firstColonIndex);
      const opponentDataStr = result.substring(firstColonIndex + 1);
      // ----------------------------------------------------

      console.log(`[MatchmakingService][processNewPlayer] Lua script returned a match! Pairing ${userId} with ${opponentId}.`);
      
      let opponentTimePerQuestion: number | undefined;
      // --- FIX 2: Use the correct GameMode enum value ---
      if (mode === GameMode.FASTEST_FINGER_FIRST) { // Changed from FASTEST_FINGER_FIRST_FIRST
        try {
          const opponentData = JSON.parse(opponentDataStr);
          opponentTimePerQuestion = opponentData.timePerQuestion;
          console.log(`[MatchmakingService][processNewPlayer] Opponent's FF time per question (parsed from Lua): ${opponentTimePerQuestion}`);
        } catch (e) {
          console.error(`[MatchmakingService][processNewPlayer] Error parsing opponent data string from Lua result: '${opponentDataStr}'`, e);
        }
      }

      // Start the game based on mode
      // --- FIX 2: Use the correct GameMode enum value ---
      if (mode === GameMode.FASTEST_FINGER_FIRST) { // Changed from FASTEST_FINGER_FIRST_FIRST
        const finalTimePerQuestion = Math.min(timePerQuestion || 2000, opponentTimePerQuestion || 2000);
        console.log(`[MatchmakingService][processNewPlayer] Calling gameService.startFastestFinger(${userId}, ${opponentId}, ${finalTimePerQuestion}).`);
        await gameService.startFastestFinger(userId, opponentId, finalTimePerQuestion);
        console.log(`[MatchmakingService][processNewPlayer] gameService.startFastestFinger call completed.`);
      } else { // QUICK_DUEL
        console.log(`[MatchmakingService][processNewPlayer] Calling gameService.startDuel(${userId}, ${opponentId}, ${duration}).`);
        await gameService.startDuel(userId, opponentId, duration);
        console.log(`[MatchmakingService][processNewPlayer] gameService.startDuel call completed.`);
      }
      console.log(`[MatchmakingService][processNewPlayer] Matchmaking job for ${userId} finished: Match found.`);
      return; // Exit as match is handled
    } else {
      // If result is null, the Lua script added the current player to the queue.
      console.log(`[MatchmakingService][processNewPlayer] Lua script confirmed no match found. Player ${userId} added to queue '${queue}'.`);
      console.log(`[MatchmakingService][processNewPlayer] Exit - User ${userId} added to queue.`);
    }
  }
  
  public async processTimeouts() {
    console.log(`[MatchmakingService][processTimeouts] Entry - Starting periodic timeout check.`);

    const durations = [1, 2, 5];
    const allRelevantDurations = Array.from(new Set([...durations, FFF_DEFAULT_DURATION_MINS]));
    console.log(`[MatchmakingService][processTimeouts] Durations to check: ${allRelevantDurations.join(', ')}`);
    
    const modes = Object.values(GameMode);
    console.log(`[MatchmakingService][processTimeouts] Modes to check: ${modes.join(', ')}`);

    for (const duration of allRelevantDurations) {
      for (const mode of modes) {
        const queue = this.getQueueName(duration, mode);
        console.log(`[MatchmakingService][processTimeouts] Checking queue: '${queue}'.`);
        
        console.log(`[MatchmakingService][processTimeouts] Calling redis.zrange to get all players in queue '${queue}'.`);
        const allPlayers = await redis.zrange(queue, 0, -1);
        console.log(`[MatchmakingService][processTimeouts] redis.zrange returned ${allPlayers.length} players from '${queue}'.`);

        for (const playerString of allPlayers) {
          // --- FIX 1: Robustly parse the player string ---
          const firstColonIndex = playerString.indexOf(':');
          if (firstColonIndex === -1) {
              console.error(`[MatchmakingService][processTimeouts] Invalid player string in queue (no colon): ${playerString}`);
              continue;
          }
          const userId = playerString.substring(0, firstColonIndex);
          const playerDataStr = playerString.substring(firstColonIndex + 1);
          // ----------------------------------------------------
          
          console.log(`[MatchmakingService][processTimeouts] Inspecting player string: '${playerString}'. User: ${userId}.`);
          
          let playerData: { timestamp: number, timePerQuestion?: number };
          try {
            playerData = JSON.parse(playerDataStr);
            console.log(`[MatchmakingService][processTimeouts] Player data parsed:`, playerData);
          } catch (e) {
            console.error(`[MatchmakingService][processTimeouts] Error parsing player data for user ${userId} in queue '${queue}': '${playerDataStr}'. Removing malformed entry.`, e);
            await redis.zrem(queue, playerString);
            continue; // Skip to next player
          }

          const elapsedTime = Date.now() - playerData.timestamp;
          console.log(`[MatchmakingService][processTimeouts] User ${userId}. Elapsed time in queue: ${elapsedTime}ms. Configured timeout: ${TIMEOUT_SECONDS * 1000}ms.`);

          if (elapsedTime > TIMEOUT_SECONDS * 1000) {
            console.log(`[MatchmakingService][processTimeouts] User ${userId} HAS EXCEEDED TIMEOUT! Elapsed: ${elapsedTime}ms.`);
            console.log(`[MatchmakingService][processTimeouts] Attempting to atomically remove ${userId} from queue '${queue}'.`);
            const removed = await redis.zrem(queue, playerString);
            console.log(`[MatchmakingService][processTimeouts] redis.zrem for ${userId} returned: ${removed}.`);

            if (removed > 0) { // Successfully removed, meaning we will start bot match
              console.log(`[MatchmakingService][processTimeouts] User ${userId} successfully removed from queue. Initiating bot match for mode: ${mode}.`);
              
              // --- FIX 2: Use the correct GameMode enum value ---
              if (mode === GameMode.FASTEST_FINGER_FIRST) { // Changed from FASTEST_FINGER_FIRST_FIRST
                console.log(`[MatchmakingService][processTimeouts] Calling gameService.startFastestFingerBot(${userId}, ${playerData.timePerQuestion || 2000}).`);
                await gameService.startFastestFingerBot(userId, playerData.timePerQuestion || 2000);
                console.log(`[MatchmakingService][processTimeouts] gameService.startFastestFingerBot call completed.`);
              } else { // QUICK_DUEL
                console.log(`[MatchmakingService][processTimeouts] Calling gameService.startBotDuel(${userId}, ${duration}).`);
                await gameService.startBotDuel(userId, duration);
                console.log(`[MatchmakingService][processTimeouts] gameService.startBotDuel call completed.`);
              }
            } else {
              console.log(`[MatchmakingService][processTimeouts] User ${userId} was already removed from queue '${queue}' by another process. Skipping bot match initiation.`);
            }
          } else {
            console.log(`[MatchmakingService][processTimeouts] User ${userId} NOT TIMED OUT YET. Remaining: ${TIMEOUT_SECONDS * 1000 - elapsedTime}ms.`);
          }
        }
      }
    }
    console.log(`[MatchmakingService][processTimeouts] Exit - Periodic timeout check finished.`);
  }
}

export const matchmakingService = new MatchmakingService();
