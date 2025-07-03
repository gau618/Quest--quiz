// src/lib/redis/client.ts

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
console.log(REDIS_URL)
const isSecure = REDIS_URL.startsWith("rediss://");

// Main Redis clients
const redis = new Redis(REDIS_URL, isSecure ? { tls: {} } : undefined);
const redisPublisher = new Redis(REDIS_URL, isSecure ? { tls: {} } : undefined);
const redisSubscriber = new Redis(REDIS_URL, isSecure ? { tls: {} } : undefined);

// Logging
redis.on("connect", () => console.log("✅ Redis connected: General Client"));
redis.on("error", (err) => console.error("❌ Redis error: General Client", err));

redisPublisher.on("connect", () => console.log("✅ Redis connected: Publisher Client"));
redisPublisher.on("error", (err) => console.error("❌ Redis error: Publisher Client", err));

redisSubscriber.on("connect", () => console.log("✅ Redis connected: Subscriber Client"));
redisSubscriber.on("error", (err) => console.error("❌ Redis error: Subscriber Client", err));

export { redis, redisPublisher, redisSubscriber };
