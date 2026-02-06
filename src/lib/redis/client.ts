// src/lib/redis/client.ts

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("❌ REDIS_URL is not defined in environment variables.");
}

console.log("Redis URL configured:", REDIS_URL ? "✅" : "❌");
const isSecure = REDIS_URL.startsWith("rediss://");
console.log("Using secure connection:", isSecure ? "✅" : "No");

// Configure Redis with proper reconnection strategy
const redisConfig = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error("❌ Redis max retries exceeded. Stopping reconnection attempts.");
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    console.log(`⚠️ Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  ...(isSecure ? { tls: { rejectUnauthorized: false } } : {}),
};

// Main Redis clients
const redis = new Redis(REDIS_URL, redisConfig);
const redisPublisher = new Redis(REDIS_URL, redisConfig);
const redisSubscriber = new Redis(REDIS_URL, redisConfig);

// Logging with proper error handling
redis.on("connect", () => console.log("✅ Redis connected: General Client"));
redis.on("error", (err) => {
  console.error("❌ Redis error: General Client", err.message);
  // Don't throw, just log to prevent crash
});

redis.on("error", (err) => {
  console.error("❌ Redis error: General Client", err.message);
  // Don't throw, just log to prevent crash
});
redis.on("close", () => console.log("⚠️ Redis connection closed: General Client"));

redisPublisher.on("connect", () => console.log("✅ Redis connected: Publisher Client"));
redisPublisher.on("error", (err) => {
  console.error("❌ Redis error: Publisher Client", err.message);
});
redisPublisher.on("close", () => console.log("⚠️ Redis connection closed: Publisher Client"));

redisSubscriber.on("connect", () => console.log("✅ Redis connected: Subscriber Client"));
redisSubscriber.on("error", (err) => {
  console.error("❌ Redis error: Subscriber Client", err.message);
});
redisSubscriber.on("close", () => console.log("⚠️ Redis connection closed: Subscriber Client"));

export { redis, redisPublisher, redisSubscriber };
