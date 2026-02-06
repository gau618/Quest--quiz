// src/workers/index.ts
import 'dotenv/config';
import { scheduler } from '@/lib/queue/scheduler';

async function startWorkers() {
  try {
    console.log('🚀 Initializing application scheduler...');
    await scheduler.initialize();

    console.log('🚀 Initializing all BullMQ worker processes...');
    await Promise.all([
      import('./onboarding.worker'),
      import('./matchmaking.worker'),
      import('./matchmaking-timeout.worker'),
      import('./game-timer.worker'),
      import('./lobby-countdown.worker')
    ]);

    console.log('✅ All worker processes have been initialized and are running.');
  } catch (err) {
    console.error("❌ Failed to start workers:", err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down workers gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down workers gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception in worker:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection in worker at:', promise, 'reason:', reason);
  process.exit(1);
});

startWorkers();
