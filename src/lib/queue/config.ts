// src/lib/queue/config.ts

import { Queue, Worker, Job, WorkerOptions, JobsOptions, RepeatOptions } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection details from environment variables
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Recommended for BullMQ with ioredis
});

// This is a singleton instance of the queue service. It ensures that all parts
// of your application share the same queue instances, preventing memory leaks
// and inconsistent state.
export const queueService = {
  queues: new Map<string, Queue>(),

  // Lazily get or create a Queue instance.
  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      console.log(`[QueueService] Creating new queue instance: ${name}`);
      this.queues.set(name, new Queue(name, { connection }));
    }
    return this.queues.get(name)!;
  },

  /**
   * Dispatches a job to a specified queue.
   * @param queueName The name of the queue.
   * @param data The job data.
   * @param options Optional BullMQ job options (e.g., delay, jobId).
   */
  async dispatch<T>(queueName: string, data: T, options?: JobsOptions): Promise<Job<T>> {
    console.log(`[QueueService] Attempting to dispatch job to '${queueName}' with data:`, data);
    const queue = this.getQueue(queueName);
    const job = await queue.add(queueName, data, {
      attempts: 3, // Default retry policy
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true, // Automatically remove jobs when they complete successfully
      removeOnFail: { count: 100 }, // Keep the last 100 failed jobs for inspection
      ...options, // Allow overriding defaults
    });
    console.log(`[QueueService] Dispatched job ${job.id} to queue '${queueName}'`);
    return job;
  },

  /**
   * FIX: Implements the missing removeJob function.
   * Removes a single, specific job from a queue by its ID.
   * This is used to cancel the question timer job in Fastest Finger mode.
   * @param queueName The name of the queue.
   * @param jobId The ID of the job to remove.
   * @returns The number of jobs removed (1 if successful, 0 if not found).
   */
  async removeJob(queueName: string, jobId: string): Promise<number> {
    console.log(`[QueueService] Attempting to remove job ${jobId} from queue '${queueName}'...`);
    try {
      const queue = this.getQueue(queueName);
      const jobsRemoved = await queue.remove(jobId);
      if (jobsRemoved > 0) {
        console.log(`[QueueService] Successfully removed job ${jobId} from queue '${queueName}'.`);
      } else {
        console.warn(`[QueueService] Job ${jobId} not found in queue '${queueName}' for removal.`);
      }
      return jobsRemoved;
    } catch (error) {
      console.error(`[QueueService] Error removing job ${jobId} from queue '${queueName}':`, error);
      return 0;
    }
  },

  /**
   * A helper function to remove repeatable jobs by their unique key.
   * This might be useful for features like daily/weekly tasks.
   * @param key The unique key of the repeatable job.
   */
  async removeRepeatableJobByKey(queueName: string, key: string): Promise<boolean> {
    console.log(`[QueueService] Attempting to remove repeatable job with key ${key} from queue '${queueName}'...`);
    try {
      const queue = this.getQueue(queueName);
      const result = await queue.removeRepeatableByKey(key);
      if (result) {
        console.log(`[QueueService] Successfully removed repeatable job with key ${key}.`);
      } else {
        console.warn(`[QueueService] Repeatable job with key ${key} not found for removal.`);
      }
      return result;
    } catch (error) {
      console.error(`[QueueService] Error removing repeatable job with key ${key}:`, error);
      return false;
    }
  }
};

/**
 * Helper function to create a BullMQ Worker instance.
 * Automatically uses the shared Redis connection and includes common event listeners.
 * @param queueName The name of the queue the worker should process.
 * @param processor The function that processes each job.
 * @param options Optional BullMQ WorkerOptions.
 * @returns A BullMQ Worker instance.
 */
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any> | any,
  options?: Omit<WorkerOptions, 'connection'>
): Worker {
  console.log(`[QueueService] Creating new worker for queue: ${queueName}`);
  const worker = new Worker(queueName, processor, {
    connection, // Use the shared Redis connection
    ...options,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker:${queueName}] ✅ Job ${job.id} has completed.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${queueName}] ❌ Job ${job?.id} has failed with error: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error(`[Worker:${queueName}] 🚨 Worker error:`, err);
  });

  return worker;
}
