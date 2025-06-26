import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { lobbyService } from '@/lib/lobby/lobby.service';
import { Difficulty } from '@prisma/client';

export const POST = withAuth(['USER', 'ADMIN'], async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const { difficulty, durationMinutes, maxPlayers } = body;

    if (!difficulty || typeof durationMinutes !== 'number' || typeof maxPlayers !== 'number') {
      return NextResponse.json({ error: 'Missing or invalid required lobby settings.' }, { status: 400 });
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
    return NextResponse.json({ error: err.message || 'Failed to create lobby' }, { status: 500 });
  }
});
