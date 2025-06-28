// src/workers/matchmaking.worker.ts

import { Job } from "bullmq";
import { matchmakingService } from "@/lib/services/matchmaking/matchmaking.service";
import { createWorker } from "@/lib/queue/config";
import { GameMode } from "@prisma/client";

interface MatchmakingJobData {
  userId: string;
  eloRating: number;
  duration: number;
  mode: GameMode;
  timePerQuestion?: number;
}

// Create a worker for the 'matchmaking-jobs' queue
const worker = createWorker<MatchmakingJobData>(
  "matchmaking-jobs",
  async (job: Job<MatchmakingJobData>) => {
    const { userId, eloRating, duration, mode, timePerQuestion } = job.data;
    console.log(
      `[Worker][Matchmaking] Processing job #${
        job.id
      } for user ${userId} (Mode: ${mode}, Attempt #${job.attemptsMade + 1})`
    );
    try {
      // Call the service to process the new player for matchmaking
      await matchmakingService.processNewPlayer(
        userId,
        eloRating,
        duration,
        mode,
        timePerQuestion
      );
      console.log(
        `[Worker][Matchmaking] Successfully processed job #${job.id} for user ${userId}.`
      );
    } catch (error) {
      console.error(
        `[Worker][Matchmaking] Failed to process job #${job.id} for user ${userId}:`,
        error
      );
      throw error; // Re-throw to make BullMQ retry the job
    }
  },
  {
    concurrency: 5, // Process 5 jobs at a time to optimize throughput
  }
);

console.log("🚀 Matchmaking worker started!");
