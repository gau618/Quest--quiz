// src/workers/lobby-countdown.worker.ts
import { Job } from 'bullmq';
import { createWorker } from '@/lib/queue/config';
import { lobbyService } from '@/lib/lobby/lobby.service';

// The job data should have at least: { roomCode: string }
interface LobbyCountdownJobData {
  roomCode: string;
}

createWorker<LobbyCountdownJobData>(
  'lobby-countdown-jobs',
  async (job: Job<LobbyCountdownJobData>) => {
    console.log(job.data);
    const { sessionId } = job.data;
    console.log(`[LobbyCountdownWorker] Countdown finished for lobby ${sessionId}. Starting group game.`);
    try {
      await lobbyService.startGame(sessionId);
      console.log(`[LobbyCountdownWorker] Group game started for lobby ${sessionId}.`);
    } catch (err: any) {
      console.error(`[LobbyCountdownWorker] Failed to start group game for lobby ${sessionId}:`, err);
      throw err;
    }
  },
  { concurrency: 1 } // Only one countdown per lobby at a time
);

console.log('🚀 Lobby Countdown worker started and listening on the "lobby-countdown-jobs" queue!');
