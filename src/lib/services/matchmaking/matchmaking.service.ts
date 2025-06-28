// src/lib/services/matchmaking.service.ts
import { redis } from "../../redis/client";
import { gameService } from "../game/game.service";
import { GameMode } from "@prisma/client";
import fs from "fs";
import path from "path";

const ELO_RANGE = 200000;
const TIMEOUT_SECONDS = 30;

const matchmakingScript = fs.readFileSync(
  path.join(process.cwd(), "src/lib/redis/matchmaking.lua"),
  "utf8"
);

class MatchmakingService {
  private getQueueName = (duration: number, mode: GameMode) =>
    `matchmaking_queue_${mode}_${duration}min`;

  public async processNewPlayer(
    userId: string,
    elo: number,
    duration: number,
    mode: GameMode,
    timePerQuestion?: number
  ) {
    const queue = this.getQueueName(duration, mode);
    const minElo = elo - ELO_RANGE;
    const maxElo = elo + ELO_RANGE;
    const playerDataJson = JSON.stringify({
      timestamp: Date.now(),
      timePerQuestion,
    });

    const result = (await redis.eval(
      matchmakingScript,
      1,
      queue,
      userId,
      elo.toString(),
      minElo.toString(),
      maxElo.toString(),
      playerDataJson
    )) as string | null;

    if (result) {
      const firstColonIndex = result.indexOf(":");
      if (firstColonIndex === -1) {
        console.error(`[MatchmakingService] Invalid Lua result: ${result}`);
        return;
      }
      const opponentId = result.substring(0, firstColonIndex);
      const opponentDataStr = result.substring(firstColonIndex + 1);

      let opponentTimePerQuestion: number | undefined;
      if (mode === GameMode.FASTEST_FINGER_FIRST) {
        try {
          opponentTimePerQuestion = JSON.parse(opponentDataStr).timePerQuestion;
        } catch (e) {
          console.error(
            `[MatchmakingService] Error parsing opponent data: '${opponentDataStr}'`,
            e
          );
        }
      }

      if (mode === GameMode.FASTEST_FINGER_FIRST) {
        const finalTimePerQuestion = Math.min(
          timePerQuestion || 30000,
          opponentTimePerQuestion || 30000
        );
        await gameService.startFastestFinger(
          userId,
          opponentId,
          duration,
          finalTimePerQuestion
        );
      } else {
        await gameService.startDuel(userId, opponentId, duration);
      }
    } else {
      console.log(
        `[MatchmakingService] Player ${userId} added to queue '${queue}'.`
      );
    }
  }

  public async processTimeouts() {
    const durations = [1, 2, 5];
    const modes = Object.values(GameMode);

    for (const duration of durations) {
      for (const mode of modes) {
        const queue = this.getQueueName(duration, mode);
        const allPlayers = await redis.zrange(queue, 0, -1);
        for (const playerString of allPlayers) {
          const firstColonIndex = playerString.indexOf(":");
          if (firstColonIndex === -1) continue;

          const userId = playerString.substring(0, firstColonIndex);
          const playerDataStr = playerString.substring(firstColonIndex + 1);

          let playerData: { timestamp: number; timePerQuestion?: number };
          try {
            playerData = JSON.parse(playerDataStr);
          } catch (e) {
            await redis.zrem(queue, playerString);
            continue;
          }

          if (Date.now() - playerData.timestamp > TIMEOUT_SECONDS * 1000) {
            if ((await redis.zrem(queue, playerString)) > 0) {
              console.log(
                `[MatchmakingService] Player ${userId} timed out. Matching with bot for ${mode}.`
              );
              if (mode === GameMode.FASTEST_FINGER_FIRST) {
                await gameService.startFastestFingerBot(
                  userId,
                  duration,
                  playerData.timePerQuestion || 30000
                );
              } else {
                await gameService.startBotDuel(userId, duration);
              }
            }
          }
        }
      }
    }
  }
}

export const matchmakingService = new MatchmakingService();
