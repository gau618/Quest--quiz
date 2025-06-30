import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { lobbyService } from "@/lib/lobby/lobby.service";

export const POST = withAuth(
  ["USER", "ADMIN"],
  async (req: NextRequest, { user }) => {
    try {
      const { sessionId } = await req.json(); // FIX: Use sessionId, not roomCode
      if (!sessionId) {
        return NextResponse.json(
          { error: "Missing sessionId" },
          { status: 400 }
        );
      }
      await lobbyService.leaveLobby(user.id, sessionId); // FIX: userId, sessionId order
      return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to leave lobby" },
        { status: 400 }
      );
    }
  }
);
