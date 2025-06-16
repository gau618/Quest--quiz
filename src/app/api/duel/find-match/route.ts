// src/app/api/game/duel/find-match/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { findMatchSchema } from '@/dtos/game.dto';
import { queueService } from '@/lib/queue/config';
import prisma from '@/lib/prisma/client';

export const POST = withAuth([], async (req, { user }) => {
    console.log(req.body)
  try {
    const body = await req.json();
    const validation = findMatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ errors: validation.error.errors }, { status: 400 });
    }
    const userProfile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: user.id } });
    await queueService.dispatch('matchmaking-queue', {
      userId: user.id, eloRating: userProfile.eloRating, duration: validation.data.duration,
    });
    return NextResponse.json({ status: 'searching' }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
});
