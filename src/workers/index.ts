// src/workers/index.ts

// Load environment variables early in the worker process
import 'dotenv/config';

// Import each worker module.
// When these modules are imported, their top-level code executes,
// which includes the `createWorker` calls within each file.
// This effectively starts each BullMQ worker and schedules any repeatable jobs
// (like the matchmaking timeout check) that are defined within them.
import './onboarding.worker';
import './matchmaking.worker';
import './matchmaking-timeout.worker';

console.log('🚀 All BullMQ worker processes initialized and started.');

// No further code is needed here.
// The individual worker files are responsible for their own setup,
// processing logic, and error handling.
