// src/lib/queue/config.ts

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const redisConnection = new IORedis(connection);

export const queueService = {
  queues: new Map<string, Queue>(),

  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection: redisConnection }));
    }
    return this.queues.get(name)!;
  },

  async dispatch<T>(queueName: string, data: T): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(queueName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    console.log(`[QueueService] Dispatched job ${job.id} to queue '${queueName}'`);
    return job;
  },
};

export function createWorker<T>(queueName: string, processor: (job: Job<T>) => Promise<void>): Worker {
  const worker = new Worker(queueName, processor, { connection: redisConnection });

  worker.on('completed', (job) => {
    console.log(`[Worker:${queueName}] ✅ Job ${job.id} has completed.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${queueName}] ❌ Job ${job?.id} has failed with error: ${err.message}`);
  });

  return worker;
}
