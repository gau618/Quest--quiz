// src/workers/index.ts
import 'dotenv/config';
import { scheduler } from '@/lib/queue/scheduler';

async function startWorkers() {
  console.log('🚀 Initializing application scheduler...');
  await scheduler.initialize();

  console.log('🚀 Initializing all BullMQ worker processes...');
  import('./onboarding.worker');
  import('./matchmaking.worker');
  import('./matchmaking-timeout.worker');
  import('./game-timer.worker');

  console.log('✅ All worker processes have been initialized and are running.');
}

startWorkers().catch(err => {
    console.error("Failed to start workers:", err);
    process.exit(1);
});
