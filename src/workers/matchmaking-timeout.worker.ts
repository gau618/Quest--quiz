// src/workers/matchmaking-timeout.worker.ts

import { matchmakingService } from '@/lib/services/matchmaking.service';
import { createWorker } from '@/lib/queue/config';

// Create a worker for the 'matchmaking-timeout-jobs' queue
// This worker processes a repeating job to check for matchmaking timeouts
const worker = createWorker('matchmaking-timeout-jobs', async () => {
  console.log('[Worker][MatchmakingTimeout] Running matchmaking timeout check...');
  try {
    // Call the service to find and process timed-out players
    await matchmakingService.processTimeouts();
    console.log('[Worker][MatchmakingTimeout] Finished matchmaking timeout check.');
  } catch (error) {
    console.error('[Worker][MatchmakingTimeout] Error processing matchmaking timeouts:', error);
    throw error; // Propagate error
  }
}, {
  repeat: {
    every: 5000, // Check every 5 seconds for timed-out players
  },
  // Ensure only one instance of this repeatable job is scheduled
  // by providing a jobId that will be reused.
  jobId: 'singleton-matchmaking-timeout-check' 
});

console.log('🚀 Matchmaking timeout worker started!');
