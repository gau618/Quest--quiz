// src/workers/matchmaking-timeout.worker.ts

import { matchmakingService } from "@/lib/services/matchmaking/matchmaking.service";
import { createWorker } from "@/lib/queue/config";

// Create a worker for the 'matchmaking-timeout-jobs' queue
// This worker processes a repeating job to check for matchmaking timeouts
// Note: The repeatable scheduling is handled by the Scheduler class (src/lib/queue/scheduler.ts),
// not by worker options. The worker just processes jobs from the queue.
const worker = createWorker(
  "matchmaking-timeout-jobs",
  async () => {
    console.log(
      "[Worker][MatchmakingTimeout] Running matchmaking timeout check..."
    );
    try {
      // Call the service to find and process timed-out players
      await matchmakingService.processTimeouts();
      console.log(
        "[Worker][MatchmakingTimeout] Finished matchmaking timeout check."
      );
    } catch (error) {
      console.error(
        "[Worker][MatchmakingTimeout] Error processing matchmaking timeouts:",
        error
      );
      throw error; // Propagate error
    }
  },
  {
    concurrency: 1,
  }
);

console.log("🚀 Matchmaking timeout worker started!");
