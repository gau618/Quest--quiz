// src/api/fastest-finger/find-match.ts
import { NextRequest, NextResponse } from 'next/server';
import { queueService } from '@/lib/queue/config';
import prisma from '@/lib/prisma/client';
import { GameMode } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';

const ALLOWED_ROLES = ['USER', 'ADMIN'];

export const POST = withAuth(ALLOWED_ROLES, async (req: NextRequest, { user }: { user: AuthUser }): Promise<NextResponse> => {
  try {
    const userId = user.id;
    const { timePerQuestion, duration } = await req.json();
    
    if (!timePerQuestion || ![10000, 20000, 30000].includes(timePerQuestion)) {
      return NextResponse.json({ error: 'Invalid timePerQuestion.' }, { status: 400 });
    }
    if (!duration || ![1, 2, 5].includes(duration)) {
      return NextResponse.json({ error: 'Invalid duration.' }, { status: 400 });
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
