// src/workers/game-timer.worker.ts
import { Job } from 'bullmq';
import { gameService } from '@/lib/services/game.service';
import { createWorker } from '@/lib/queue/config';

interface GameTimerJobData {
  sessionId: string;
  questionId: string; // Special value 'game-end' for the overall game timer
}

// Create a worker for the 'game-timers' queue
const worker = createWorker<GameTimerJobData>('game-timers', async (job: Job<GameTimerJobData>) => {
  const { sessionId, questionId } = job.data;

  // --- FIX: Route the job to the correct service function ---
  // If the job is for the main game end, call endGame.
  if (questionId === 'game-end') {
    console.log(`[Worker][GameTimer] Processing GAME END for session ${sessionId}`);
    await gameService.endGame(sessionId);
    return;
  }

  // Otherwise, it's a per-question timeout for Fastest Finger.
  console.log(`[Worker][GameTimer] Processing question timeout for session ${sessionId}, question ${questionId}`);
  try {
    await gameService.processFastestFingerTimeout(sessionId, questionId);
    console.log(`[Worker][GameTimer] Finished processing timeout for session ${sessionId}`);
  } catch (error) {
    console.error(`[Worker][GameTimer] Error processing game timer job for session ${sessionId}:`, error);
    throw error;
  }
}, {
  concurrency: 10,
});

console.log('🚀 Game Timer worker started!');
