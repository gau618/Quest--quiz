import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { lobbyService } from '@/lib/lobby/lobby.service';
import prisma from '@/lib/prisma/client';

export const POST = withAuth(['USER', 'ADMIN'], async (req: NextRequest, { user }) => {
  try {
    const { roomCode } = await req.json();
    if (!roomCode) {
      return NextResponse.json({ error: 'Missing roomCode' }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      select: { id: true }
    });

    if (!session) {
      return NextResponse.json({ error: 'Lobby not found.' }, { status: 404 });
    }

    const result = await lobbyService.initiateCountdown(user.id, session.id);

    // Emit countdown start to all clients in the lobby
    // Example: io.to(session.id).emit('lobby:countdownStarted', result);

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to initiate countdown' }, { status: 400 });
  }
});
