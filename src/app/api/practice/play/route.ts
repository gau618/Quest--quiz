// src/app/api/practice/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';
import { gameService } from '@/lib/services/game.service'; // Adjust path if game.service is moved
import { Difficulty } from '@prisma/client';

// The actual handler function for the POST method
async function POST_HANDLER(
  req: NextRequest,
  { user }: { user: AuthUser } // user object is injected by withAuth
) {
  try {
    // Parse the request body as JSON
    const body = await req.json();
    const { difficulty, categories, numQuestions } = body;

    // --- Input Validation ---
    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return NextResponse.json({ message: 'A valid difficulty (EASY, MEDIUM, HARD) is required.' }, { status: 400 });
    }
    // categories can be an empty array (for "All Categories"), but it must be an array.
    if (!Array.isArray(categories)) {
      return NextResponse.json({ message: 'Categories must be provided as an array.' }, { status: 400 });
    }
    if (typeof numQuestions !== 'number' || numQuestions <= 0 || numQuestions > 50) {
      return NextResponse.json({ message: 'Number of questions must be between 1 and 50.' }, { status: 400 });
    }

    // FIX: Capture the return value from gameService.startPractice
    const { sessionId, participantId, totalQuestions } = await gameService.startPractice(user.id, difficulty, categories, numQuestions);

    // Respond with success, including the session and participant IDs
    return NextResponse.json({
      success: true,
      message: 'Practice session successfully started.',
      sessionId,        // Include sessionId
      participantId,    // Include participantId
      totalQuestions    // Include totalQuestions
    }, { status: 200 });
  } catch (error: any) { // Catch potential errors from gameService.startPractice as well
    console.error('Error starting practice session:', error);
    // If gameService.startPractice throws an error (e.g., no questions found),
    // we should return that specific error message to the frontend.
    if (error.message) {
        return NextResponse.json({ message: error.message }, { status: 400 }); // Bad Request for user-facing errors
    }
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

// Wrap the handler with the withAuth middleware and export it as the POST method.
export const POST = withAuth(['USER', 'ADMIN'], POST_HANDLER);
