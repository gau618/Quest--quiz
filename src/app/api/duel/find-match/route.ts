// src/api/duel/find-match.ts
import { NextRequest, NextResponse } from 'next/server';
import { queueService } from '@/lib/queue/config';
import prisma from '@/lib/prisma/client';
import { GameMode } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/withAuth'; // Adjust path as per your project structure
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rateLimit';

// Define the allowed roles for this API. For example, all authenticated users.
const ALLOWED_ROLES = ['USER', 'ADMIN'];

export const POST = withAuth(ALLOWED_ROLES, async (req: NextRequest, { user }: { user: AuthUser }): Promise<NextResponse> => {
  console.log(`[API][QuickDuel] Received find match request for user: ${user.id} (username: ${user.username})`);
  try {
    const userId = user.id; // User ID obtained from validated JWT

    // Rate limit: 10 matchmaking attempts per minute per user
    const rateLimitResult = checkRateLimit(`user:${userId}:matchmaking`, {
      maxRequests: 10,
      windowMs: 60000,
    });
    
    if (rateLimitResult.limited) {
      console.warn(`[API][QuickDuel] Rate limit exceeded for user ${userId}`);
      return createRateLimitResponse(rateLimitResult.resetTime);
    }

    const { duration } = await req.json();
    console.log(`[API][QuickDuel] Requested duration: ${duration} minutes`);
    
    // Strict validation: must be number and exact value
    if (typeof duration !== 'number' || ![1, 2, 5].includes(duration)) {
      console.warn(`[API][QuickDuel] Invalid duration provided: ${duration}`);
      return NextResponse.json({ error: 'Invalid duration. Must be 1, 2, or 5 minutes' }, { status: 400 });
    }

    const userProfile = await prisma.userProfile.findUnique({
      where: { userId: userId }
    });

    if (!userProfile) {
      console.error(`[API][QuickDuel] User profile not found for userId: ${userId}`);
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Dispatch a matchmaking job for Quick Duel mode
    console.log(`[API][QuickDuel] Dispatching matchmaking job for user ${userId}, ELO ${userProfile.eloRating}, duration ${duration}, mode QUICK_DUEL`);
    console.log(GameMode);
    await queueService.dispatch('matchmaking-jobs', {
      userId: userId,
      eloRating: userProfile.eloRating,
      duration,
      mode: GameMode.QUICK_DUEL,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API][QuickDuel] Internal server error during match finding:', error);
    // withAuth already handles 401/403/500 for auth errors.
    // This catch is for errors specific to the API logic.
    return NextResponse.json({ error: 'Internal server error during match finding' }, { status: 500 });
  }
});
