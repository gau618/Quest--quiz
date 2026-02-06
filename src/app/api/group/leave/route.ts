import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { lobbyService } from "@/lib/lobby/lobby.service";

export const POST = withAuth(
  ["USER", "ADMIN"],
  async (req: NextRequest, { user }) => {
    try {
      const { sessionId } = await req.json();
      
      // Strict validation for sessionId
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 100) {
        return NextResponse.json(
          { error: "Invalid sessionId. Must be a string between 1 and 100 characters." },
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
