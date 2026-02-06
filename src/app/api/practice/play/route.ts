import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth/withAuth";
import { gameService } from "@/lib/services/game/game.service";
import { Difficulty } from "@prisma/client";
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rateLimit';

async function POST_HANDLER(
  req: NextRequest,
  { user }: { user: AuthUser }
) {
  try {
    // Rate limit: 20 practice games per hour per user
    const rateLimitResult = checkRateLimit(`user:${user.id}:practice`, {
      maxRequests: 20,
      windowMs: 3600000, // 1 hour
    });
    
    if (rateLimitResult.limited) {
      console.warn(`[API][Practice] Rate limit exceeded for user ${user.id}`);
      return createRateLimitResponse(rateLimitResult.resetTime);
    }

    const body = await req.json();
    const { difficulty, categories, numQuestions } = body;

    // --- Input Validation ---
    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return NextResponse.json(
        { message: "A valid difficulty (EASY, MEDIUM, HARD) is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { message: "Categories must be provided as an array." },
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

    if (
      typeof numQuestions !== "number" ||
      numQuestions <= 0 ||
      numQuestions > 50
    ) {
      return NextResponse.json(
        { message: "Number of questions must be between 1 and 50." },
        { status: 400 }
      );
    }

    // Call service and handle response safely
    const result = await gameService.startPractice(
      user.id,
      difficulty,
      categories,
      numQuestions
    );

    if ("error" in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    const { sessionId, participantId, totalQuestions } = result;

    return NextResponse.json(
      {
        success: true,
        message: "Practice session successfully started.",
        sessionId,
        participantId,
        totalQuestions,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error starting practice session:", error);
    return NextResponse.json(
      {
        message: error?.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(["USER", "ADMIN"], POST_HANDLER);
