// src/lib/redis/client.ts

import Redis from 'ioredis';

const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

// This singleton pattern ensures we have only one connection
const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ?? new Redis(redisUrl, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

console.log('Redis client initialized.');
