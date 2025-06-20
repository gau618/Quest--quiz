// src/lib/queue/scheduler.ts
import { queueService } from './config';

class Scheduler {
  public async initialize() {
    console.log('[Scheduler] Initializing repeatable jobs...');
    await this.scheduleMatchmakingTimeouts();
    console.log('[Scheduler] Repeatable jobs initialized.');
  }

  private async scheduleMatchmakingTimeouts() {
    const queueName = 'matchmaking-timeout-jobs';
    const jobName = 'check-timeouts';
    const repeatOptions = { every: 5000 }; // Check every 5 seconds
    const jobId = 'singleton-matchmaking-timeout-check';

    // First, remove any existing repeatable job with the same key to ensure consistency
    // This makes sure that on every server start, we have a clean schedule.
    await queueService.removeRepeatableJob(queueName, { pattern: jobId, every: repeatOptions.every });
    console.log(`[Scheduler] Cleared any existing matchmaking timeout job config.`);

    // Now, add the single, definitive repeatable job
    await queueService.dispatch(
      queueName,
      { jobName }, // Give the job a name for clarity in logs
      {
        jobId,
        repeat: repeatOptions,
      }
    );
    console.log(`[Scheduler] Successfully scheduled matchmaking timeout check to run every ${repeatOptions.every}ms.`);
  }
}

export const scheduler = new Scheduler();
