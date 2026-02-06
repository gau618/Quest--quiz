// src/api/fastest-finger/find-match.ts
import { NextRequest, NextResponse } from 'next/server';
import { queueService } from '@/lib/queue/config';
import prisma from '@/lib/prisma/client';
import { GameMode } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rateLimit';

const ALLOWED_ROLES = ['USER', 'ADMIN'];

export const POST = withAuth(ALLOWED_ROLES, async (req: NextRequest, { user }: { user: AuthUser }): Promise<NextResponse> => {
  try {
    const userId = user.id;

    // Rate limit: 10 matchmaking attempts per minute per user
    const rateLimitResult = checkRateLimit(`user:${userId}:matchmaking`, {
      maxRequests: 10,
      windowMs: 60000,
    });
    
    if (rateLimitResult.limited) {
      console.warn(`[API][FastestFinger] Rate limit exceeded for user ${userId}`);
      return createRateLimitResponse(rateLimitResult.resetTime);
    }

    const { timePerQuestion, duration } = await req.json();
    
    // Strict validation: must be numbers with exact values
    if (typeof timePerQuestion !== 'number' || ![10000, 20000, 30000].includes(timePerQuestion)) {
      return NextResponse.json({ error: 'Invalid timePerQuestion. Must be 10000, 20000, or 30000.' }, { status: 400 });
    }
    
    if (typeof duration !== 'number' || ![1, 2, 5].includes(duration)) {
      return NextResponse.json({ error: 'Invalid duration. Must be 1, 2, or 5.' }, { status: 400 });
    }

    const userProfile = await prisma.userProfile.findUnique({ where: { userId } });

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const jobData = {
      userId,
      eloRating: userProfile.eloRating,
      duration,
      mode: GameMode.FASTEST_FINGER_FIRST, // Use correct enum
      timePerQuestion,
    };
    
    await queueService.dispatch('matchmaking-jobs', jobData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API][FastestFinger] Internal server error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
});
