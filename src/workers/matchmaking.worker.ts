// src/workers/matchmaking.worker.ts

import { Job } from 'bullmq';
import { matchmakingService } from '@/lib/services/matchmaking.service';

interface MatchmakingJobData {
  userId: string;
  eloRating: number;
  duration: number;
}

export async function processMatchmakingJob(job: Job<MatchmakingJobData>) {
  const { userId, eloRating, duration } = job.data;
  console.log(`[Worker] Processing matchmaking job #${job.id} for user ${userId} (Attempt #${job.attemptsMade + 1})`);
  try {
    await matchmakingService.processNewPlayer(userId, eloRating, duration);
  } catch (error) {
    console.error(`[Worker] Failed to process job #${job.id} for user ${userId}`, error);
    throw error;
  }
}
