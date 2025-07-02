// src/lib/redis/client.ts
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Connecting to Redis at ${REDIS_URL}`);
// Main Redis client for general operations
const redis = new Redis(REDIS_URL);
// Separate Redis client for publishing messages (BullMQ uses its own for internal pub/sub)
const redisPublisher = new Redis(REDIS_URL);
// Separate Redis client for subscribing to messages (BullMQ also uses its own)
const redisSubscriber = new Redis(REDIS_URL);

// Add event listeners for connection status to all Redis clients
redis.on('connect', () => console.log('✅ Redis connected: General Client'));
redis.on('error', (err) => console.error('❌ Redis error: General Client', err));

redisPublisher.on('connect', () => console.log('✅ Redis connected: Publisher Client'));
redisPublisher.on('error', (err) => console.error('❌ Redis error: Publisher Client', err));

redisSubscriber.on('connect', () => console.log('✅ Redis connected: Subscriber Client'));
redisSubscriber.on('error', (err) => console.error('❌ Redis error: Subscriber Client', err));


export { redis, redisPublisher, redisSubscriber };