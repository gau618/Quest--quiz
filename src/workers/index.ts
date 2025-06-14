import dotenv from 'dotenv';
dotenv.config(); // This explicitly finds and loads the .env file

import { createWorker } from '@/lib/queue/config';
import { processOnboardingBonus } from './onboarding.worker';

console.log('🚀 Worker process started, waiting for jobs on queue "onboarding-jobs"...');

const onboardingWorker = createWorker('onboarding-jobs', processOnboardingBonus);

onboardingWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} has completed.`);
});

onboardingWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} has failed with error: ${err.message}`);
});
