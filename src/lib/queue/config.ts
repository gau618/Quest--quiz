// src/lib/queue/config.ts
import { Queue, Worker, Job, WorkerOptions, JobsOptions, Repeat } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

export const queueService = {
  queues: new Map<string, Queue>(),

  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection }));
    }
    return this.queues.get(name)!;
  },

  async dispatch<T>(queueName: string, data: T, options?: JobsOptions): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(queueName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
      ...options,
    });
    return job;
  },

  async removeJob(queueName: string, jobId: string): Promise<number> {
    const queue = this.getQueue(queueName);
    return await queue.remove(jobId);
  },

  /**
   * FIX: Corrects the misplaced 'await' keyword.
   * This function now correctly finds and removes existing repeatable jobs.
   */
  async removeRepeatableJob(queueName: string, repeat: Repeat): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      const jobs = await queue.getRepeatableJobs();
      for (const job of jobs) {
        if (job.pattern === repeat.pattern && job.every === repeat.every) {
          // Correctly await the asynchronous removal operation.
          await queue.removeRepeatableByKey(job.key);
          console.log(`[QueueService] Removed existing repeatable job with key: ${job.key}`);
        }
      }
    } catch (error) {
      console.error(`[QueueService] Error removing repeatable job:`, error);
    }
  },
};

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any> | any,
  options?: Omit<WorkerOptions, 'connection'>
): Worker {
  const worker = new Worker(queueName, processor, { connection, ...options });
  worker.on('completed', (job) => console.log(`[Worker:${queueName}] ✅ Job ${job.id} has completed.`));
  worker.on('failed', (job, err) => console.error(`[Worker:${queueName}] ❌ Job ${job?.id} has failed with error: ${err.message}`));
  worker.on('error', (err) => console.error(`[Worker:${queueName}] 🚨 Worker error:`, err));
  return worker;
}
