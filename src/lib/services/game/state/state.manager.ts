// src/lib/game/state/state.manager.ts
import { redis } from '@/lib/redis/client';
import { GameState } from '../types';

class StateManager {
  private getGameStateKey(sessionId: string): string {
    return `game_state:${sessionId}`;
  }

  private getTimerJobKey(sessionId: string): string {
      return `ff_timer_job:${sessionId}`;
  }

  public async get(sessionId: string): Promise<GameState | null> {
    const gameStateStr = await redis.get(this.getGameStateKey(sessionId));
    return gameStateStr ? JSON.parse(gameStateStr) as GameState : null;
  }

  public async set(sessionId: string, gameState: GameState): Promise<void> {
    await redis.set(this.getGameStateKey(sessionId), JSON.stringify(gameState), "KEEPTTL");
  }

  public async del(sessionId: string): Promise<void> {
    await redis.del(this.getGameStateKey(sessionId));
  }

  public async getTimerJobId(sessionId: string): Promise<string | null> {
      return await redis.get(this.getTimerJobKey(sessionId));
  }

  public async setTimerJobId(sessionId: string, jobId: string): Promise<void> {
      await redis.set(this.getTimerJobKey(sessionId), jobId);
  }

  public async delTimerJobId(sessionId: string): Promise<void> {
      await redis.del(this.getTimerJobKey(sessionId));
  }
}

export const stateManager = new StateManager();
