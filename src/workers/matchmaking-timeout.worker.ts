// src/workers/matchmaking-timeout.worker.ts

import { matchmakingService } from '@/lib/services/matchmaking.service';

export async function processTimeoutJob() {
  try {
    await matchmakingService.processTimeouts();
  } catch (error) {
    throw error;
  }
}
