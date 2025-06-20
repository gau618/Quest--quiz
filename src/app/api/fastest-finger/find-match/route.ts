// src/api/fastest-finger/find-match.ts
import { NextRequest, NextResponse } from 'next/server';
import { queueService } from '@/lib/queue/config';
import prisma from '@/lib/prisma/client';
import { GameMode } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/withAuth'; // Adjust path as per your project structure

// Define the allowed roles for this API.
const ALLOWED_ROLES = ['USER', 'ADMIN'];

export const POST = withAuth(ALLOWED_ROLES, async (req: NextRequest, { user }: { user: AuthUser }): Promise<NextResponse> => {
    console.log(`[API][FastestFinger] Received find match request for user: ${user.id} (username: ${user.username})`);
    try {
        const userId = user.id; // User ID obtained from validated JWT

        const { timePerQuestion } = await req.json(); // timePerQuestion in milliseconds
        console.log(`[API][FastestFinger] Requested time per question: ${timePerQuestion}ms`);

        if (!timePerQuestion || ![10000, 20000, 30000].includes(timePerQuestion)) {
            console.warn(`[API][FastestFinger] Invalid timePerQuestion provided: ${timePerQuestion}`);
            return NextResponse.json({ error: 'Invalid timePerQuestion. Must be 10000, 20000, or 30000ms' }, { status: 400 });
        }

        const userProfile = await prisma.userProfile.findUnique({
            where: { userId: userId }
        });

        if (!userProfile) {
            console.error(`[API][FastestFinger] User profile not found for userId: ${userId}`);
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        // Fastest Finger has a fixed duration (e.g., 2 minutes) for queueing purposes
        const FFF_QUEUE_DURATION = 2; // This should match the default in game.service.ts if applicable

        console.log(`[API][FastestFinger] Dispatching matchmaking job for user ${userId}, ELO ${userProfile.eloRating}, duration ${FFF_QUEUE_DURATION}, mode FASTEST_FINGER_FIRST, timePerQuestion ${timePerQuestion}`);
        await queueService.dispatch('matchmaking-jobs', {
            userId: userId,
            eloRating: userProfile.eloRating,
            duration: FFF_QUEUE_DURATION, // Fixed duration for queue
            mode: GameMode.FASTEST_FINGER_FIRST,
            timePerQuestion,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API][FastestFinger] Internal server error during match finding:', error);
        // withAuth already handles 401/403/500 for auth errors.
        // This catch is for errors specific to the API logic.
        return NextResponse.json({ error: 'Internal server error during match finding' }, { status: 500 });
    }
});
