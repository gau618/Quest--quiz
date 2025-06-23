// src/lib/prisma/client.ts
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Ensure the PrismaClient is reused in development to prevent multiple instances
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
    console.log('[Prisma] New PrismaClient created for development.');
  } else {
    console.log('[Prisma] Reusing existing PrismaClient for development.');
  }
  prisma = (global as any).prisma;
}

export default prisma;
