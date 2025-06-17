// src/lib/redis/client.ts

import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Standard client for general use (queues, caching)
export const redis = new Redis(redisUrl);

// A dedicated client for publishing messages
export const redisPublisher = new Redis(redisUrl);

// A dedicated client for subscribing to messages
export const redisSubscriber = new Redis(redisUrl);
