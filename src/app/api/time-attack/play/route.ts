// src/pages/api/time-attack/start.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth/withAuth";
import { gameService } from "@/lib/services/game/game.service";
import { Difficulty } from "@prisma/client";
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rateLimit';

const ALLOWED_ROLES = ["USER", "ADMIN"];

async function handler(req: NextRequest, { user }: { user: AuthUser }) {
  try {
    // Rate limit: 20 time attack games per hour per user
    const rateLimitResult = checkRateLimit(`user:${user.id}:timeattack`, {
      maxRequests: 20,
      windowMs: 3600000, // 1 hour
    });
    
    if (rateLimitResult.limited) {
      console.warn(`[API][TimeAttack] Rate limit exceeded for user ${user.id}`);
      return createRateLimitResponse(rateLimitResult.resetTime);
    }

    const { difficulty, categories, durationMinutes } = await req.json();

    // --- Input Validation ---
    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return NextResponse.json(
        { message: "A valid difficulty is required." },
        { status: 400 }
      );
    }
    
    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { message: "Categories must be an array." },
        { status: 400 }
      );
    }
    
    // Prevent resource exhaustion - limit categories array size
    if (categories.length === 0 || categories.length > 20) {
      return NextResponse.json(
        { message: "Categories array must contain 1-20 items." },
        { status: 400 }
      );
    }
    
    // Validate all category IDs are valid strings
    if (!categories.every(cat => typeof cat === 'string' && cat.length > 0 && cat.length <= 100)) {
      return NextResponse.json(
        { message: "All category IDs must be valid strings." },
        { status: 400 }
      );
    }
    
    // Strict numeric validation
    if (typeof durationMinutes !== 'number' || ![1, 2, 5].includes(durationMinutes)) {
      return NextResponse.json(
        { message: "Duration must be 1, 2, or 5 minutes." },
        { status: 400 }
      );
    }

    const result = await gameService.startTimeAttack(
      user.id,
      difficulty,
      categories,
      durationMinutes
    );

    if ("error" in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Time Attack session created.",
        ...result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API][TimeAttack] Error starting session:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(ALLOWED_ROLES, handler);
