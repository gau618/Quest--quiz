import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { lobbyService } from "@/lib/lobby/lobby.service";
import { Difficulty } from "@prisma/client";
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rateLimit';

export const POST = withAuth(
  ["USER", "ADMIN"],
  async (req: NextRequest, { user }) => {
    try {
      // Rate limit: 5 lobby creations per hour per user
      const rateLimitResult = checkRateLimit(`user:${user.id}:create_lobby`, {
        maxRequests: 5,
        windowMs: 3600000, // 1 hour
      });
      
      if (rateLimitResult.limited) {
        console.warn(`[API][Lobby] Rate limit exceeded for user ${user.id}`);
        return createRateLimitResponse(rateLimitResult.resetTime);
      }

      const body = await req.json();
      const { difficulty, durationMinutes, maxPlayers } = body;

      // Validate difficulty
      const validDifficulties = ['EASY', 'MEDIUM', 'HARD'];
      if (!difficulty || !validDifficulties.includes(difficulty)) {
        return NextResponse.json(
          { error: "Invalid difficulty. Must be EASY, MEDIUM, or HARD." },
          { status: 400 }
        );
      }
      
      // Validate numeric inputs with strict bounds
      if (typeof durationMinutes !== "number" || durationMinutes < 1 || durationMinutes > 60) {
        return NextResponse.json(
          { error: "Invalid durationMinutes. Must be between 1 and 60." },
          { status: 400 }
        );
      }
      
      if (typeof maxPlayers !== "number" || maxPlayers < 2 || maxPlayers > 20) {
        return NextResponse.json(
          { error: "Invalid maxPlayers. Must be between 2 and 20." },
          { status: 400 }
        );
      }

      const { roomCode, lobby } = await lobbyService.createLobby(
        user.id,
        difficulty as Difficulty,
        durationMinutes,
        maxPlayers
      );

      // Emit initial lobby state to all clients in the room (just the host at this point)
      // Example: io.to(roomCode).emit('lobby:update', lobby);

      return NextResponse.json({ roomCode, lobby }, { status: 200 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to create lobby" },
        { status: 500 }
      );
    }
  }
);
