// src/lib/queue/config.ts

import { Queue, Worker, Job, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection details from environment variables
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Recommended for BullMQ with ioredis
};

// Create a single IORedis connection instance for BullMQ internal use
const redisConnection = new IORedis(connection);

export const queueService = {
  queues: new Map<string, Queue>(),

  // Lazily get or create a Queue instance
  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      console.log(`[QueueService] Creating new queue instance: ${name}`);
      this.queues.set(name, new Queue(name, { connection: redisConnection }));
    } else {
      console.log(`[QueueService] Reusing existing queue instance: ${name}`);
    }
    return this.queues.get(name)!;
  },

  // Dispatch a job to a specified queue
  async dispatch<T>(queueName: string, data: T): Promise<Job<T>> {
    console.log(`[QueueService] Attempting to dispatch job to '${queueName}' with data:`, data);
    const queue = this.getQueue(queueName);
    const job = await queue.add(queueName, data, {
      attempts: 3, // Retry failed jobs 3 times
      backoff: { type: 'exponential', delay: 1000 }, // Exponential backoff for retries
    });
    console.log(`[QueueService] Dispatched job ${job.id} to queue '${queueName}'`);
    return job;
  },
};

/**
 * Helper function to create a BullMQ Worker instance.
 * Automatically uses the shared Redis connection and includes common event listeners.
 * @param queueName The name of the queue the worker should process.
 * @param processor The function that processes each job.
 * @param options Optional BullMQ WorkerOptions (e.g., concurrency, repeat, lockDuration).
 * @returns A BullMQ Worker instance.
 */
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void> | void,
  options?: Omit<WorkerOptions, 'connection'> // Omit 'connection' as it's handled internally
): Worker {
  console.log(`[QueueService] Creating new worker for queue: ${queueName}`);
  const worker = new Worker(queueName, processor, {
    connection: redisConnection, // Use the shared Redis connection
    ...options, // Spread any additional worker options
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
