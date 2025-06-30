import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { lobbyService } from "@/lib/lobby/lobby.service";

export const POST = withAuth(
  ["USER", "ADMIN"],
  async (req: NextRequest, { user }) => {
    try {
      const { sessionId } = await req.json();
      if (!sessionId) {
        return NextResponse.json(
          { error: "Missing sessionId" },
          { status: 400 }
        );
      }
      const result = await lobbyService.cancelCountdown(user.id, sessionId);

      // Emit countdown cancel to all clients in the lobby
      // Example: io.to(sessionId).emit('lobby:countdownCancelled', result);

      return NextResponse.json(result, { status: 200 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to cancel countdown" },
        { status: 400 }
      );
    }
  }
);
