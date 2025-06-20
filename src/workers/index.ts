// src/workers/index.ts
import 'dotenv/config';

console.log('🚀 Initializing all BullMQ worker processes...');

import './onboarding.worker';
import './matchmaking.worker';
import './matchmaking-timeout.worker';
import './game-timer.worker'; // <-- NEW: Import the game timer worker

console.log('✅ All worker processes have been initialized and are running.');
