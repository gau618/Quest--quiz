// src/pages/api/time-attack/start.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';
import { gameService } from '@/lib/services/game.service';
import { Difficulty } from '@prisma/client';

const ALLOWED_ROLES = ['USER', 'ADMIN'];

async function handler(req: NextRequest, { user }: { user: AuthUser }) {
  try {
    const { difficulty, categories, durationMinutes } = await req.json();

    // --- Input Validation ---
    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return NextResponse.json({ message: 'A valid difficulty is required.' }, { status: 400 });
    }
    if (!Array.isArray(categories)) {
      return NextResponse.json({ message: 'Categories must be an array.' }, { status: 400 });
    }
    if (!durationMinutes || ![1, 2, 5].includes(durationMinutes)) {
      return NextResponse.json({ message: 'Duration must be 1, 2, or 5 minutes.' }, { status: 400 });
    }

    const result = await gameService.startTimeAttack(user.id, difficulty, categories, durationMinutes);

    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Time Attack session created.',
      ...result,
    }, { status: 200 });

  } catch (error: any) {
    console.error('[API][TimeAttack] Error starting session:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export const POST = withAuth(ALLOWED_ROLES, handler);
