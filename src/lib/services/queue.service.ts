import { onboardingQueue } from '@/lib/queue/config';

class QueueService {
  async addOnboardingCompletedJob(userId: string) {
    const jobId = `onboarding-bonus-${userId}`;
    await onboardingQueue.add('onboarding-completed', { userId }, { jobId });
    console.log(`[QueueService] Dispatched job ${jobId} to queue 'onboarding-jobs'`);
  }
}

export const queueService = new QueueService();
