// src/lib/shutdown.ts

import { redis } from './redis/client';
import prisma from './prisma/client';
import { Server } from 'http';

// This function accepts an optional server instance to close
export function setupGracefulShutdown(server?: Server) {
  const handleShutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}. Shutting down gracefully...`);

    try {
      // 1. Close the web server (if provided) to stop accepting new connections.
      if (server) {
        await new Promise<void>(resolve => server.close(() => {
            console.log('[Shutdown] HTTP server closed.');
            resolve();
        }));
      }
      
      // 2. Disconnect from Redis.
      await redis.quit();
      console.log('[Shutdown] Redis connection closed.');
      
      // 3. Disconnect from Prisma/PostgreSQL.
      await prisma.$disconnect();
      console.log('[Shutdown] Prisma client disconnected.');

      console.log('[Shutdown] Graceful shutdown complete.');
      process.exit(0); // Exit cleanly
    } catch (error) {
      console.error('[Shutdown] Error during graceful shutdown:', error);
      process.exit(1); // Exit with an error code
    }
  };

  // Listen for the signals that process managers like tsx send to restart
  process.on('SIGINT', () => handleShutdown('SIGINT')); // Sent by Ctrl+C
  process.on('SIGTERM', () => handleShutdown('SIGTERM')); // Standard termination signal
}
