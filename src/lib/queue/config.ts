import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: process.env.REDIS_HOST!,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

export const onboardingQueue = new Queue('onboarding-jobs', { connection });

export const createWorker = (name: string, processor: any) => {
  return new Worker(name, processor, { connection });
};
