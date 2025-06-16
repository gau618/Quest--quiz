// src/workers/index.ts

import 'dotenv/config';
import { createWorker, queueService } from '@/lib/queue/config';
import { processOnboardingBonus } from './onboarding.worker';
import { processMatchmakingJob } from './matchmaking.worker';
import { processTimeoutJob } from './matchmaking-timeout.worker';

console.log('🚀 Worker process starting...');

createWorker('onboarding-jobs', processOnboardingBonus);
createWorker('matchmaking-queue', processMatchmakingJob);
createWorker('matchmaking-timeout-scheduler', processTimeoutJob);

const addRepeatableJob = async () => {
  const queue = queueService.getQueue('matchmaking-timeout-scheduler');
  await queue.add('timeout-check', null, {
    repeat: { every: 5000 },
    removeOnComplete: true,
    removeOnFail: true,
    jobId: 'singleton-timeout-check'
  });
  console.log('[Scheduler] Repeatable timeout check job configured.');
};
addRepeatableJob().catch(console.error);
