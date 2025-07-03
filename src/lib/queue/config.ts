// src/lib/queue/config.ts
import { Queue, Worker, Job, WorkerOptions, JobsOptions, Repeat } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error('❌ REDIS_URL environment variable is required for queue configuration');
}

console.log('Queue Redis URL configured:', REDIS_URL ? 'YES' : 'NO');
const isSecure = REDIS_URL.startsWith("rediss://");

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
  ...(isSecure ? { tls: { rejectUnauthorized: false } } : {}),
});

// Add connection event handlers
connection.on('connect', () => {
  console.log('✅ Queue Redis Connected');
});

connection.on('error', (err) => {
  console.error('❌ Queue Redis Connection Error:', err.message);
});

connection.on('ready', () => {
  console.log('✅ Queue Redis Ready');
});

// --- Register and manage all queues, including the new lobby-countdown-jobs queue ---
export const queueService = {
  queues: new Map<string, Queue>(),

  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection }));
    }
    return this.queues.get(name)!;
  },

  async dispatch<T>(
    queueName: string,
    data: T,
    options?: JobsOptions
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(
      options?.name || queueName, // Use explicit job name if provided, else queueName
      data,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
        ...options,
      }
    );
    return job;
  },

  async removeJob(queueName: string, jobId: string): Promise<number> {
    const queue = this.getQueue(queueName);
    return await queue.remove(jobId);
  },

  async removeRepeatableJob(queueName: string, repeat: Repeat): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      const jobs = await queue.getRepeatableJobs();
      for (const job of jobs) {
        if (job.pattern === repeat.pattern && job.every === repeat.every) {
          await queue.removeRepeatableByKey(job.key);
          console.log(
            `[QueueService] Removed existing repeatable job with key: ${job.key}`
          );
        }
      }
    } catch (error) {
      console.error(`[QueueService] Error removing repeatable job:`, error);
    }
  },
};

// --- Worker factory ---
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any> | any,
  options?: Omit<WorkerOptions, "connection">
): Worker {
  const worker = new Worker(queueName, processor, { connection, ...options });
  worker.on("completed", (job) =>
    console.log(`[Worker:${queueName}] ✅ Job ${job.id} has completed.`)
  );
  worker.on("failed", (job, err) =>
    console.error(
      `[Worker:${queueName}] ❌ Job ${job?.id} has failed with error: ${err.message}`
    )
  );
  worker.on("error", (err) =>
    console.error(`[Worker:${queueName}] 🚨 Worker error:`, err)
  );
  return worker;
}
