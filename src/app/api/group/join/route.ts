import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { lobbyService } from "@/lib/lobby/lobby.service";

export const POST = withAuth(
  ["USER", "ADMIN"],
  async (req: NextRequest, { user }) => {
    try {
      const { roomCode } = await req.json();
      
      // Strict validation for roomCode
      if (!roomCode || typeof roomCode !== 'string' || roomCode.length === 0 || roomCode.length > 50) {
        return NextResponse.json(
          { error: "Invalid roomCode. Must be a string between 1 and 50 characters." },
          { status: 400 }
        );
      }
      const result = await lobbyService.joinLobby(user.id, roomCode);

      // Emit updated lobby state to all clients in the room
      // (Assume lobbyService.joinLobby handles this with socket.io)
      // Example: io.to(roomCode).emit('lobby:update', result.lobby);

      return NextResponse.json(result, { status: 200 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to join lobby" },
        { status: 400 }
      );
    }
  }
);
