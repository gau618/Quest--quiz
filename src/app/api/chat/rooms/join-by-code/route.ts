import { withAuth } from '@/lib/auth/withAuth';
import { inviteService } from '@/lib/services/invite.service';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client'; // Ensure this path is correct
export const POST = withAuth(['USER'], async (req: NextRequest, { user }) => {
  const { code } = await req.json();
  
  try {
    console.log(`Joining group with code: ${code} for user: ${user.id}`);
    const room = await inviteService.validateInviteCode(code, user.id);
    const fullRoom = await prisma.chatRoom.findUnique({
      where: { id: room.id },
      include: {
        members: {
          include: {
            userProfile: true
          }
        }
      }
    });
    console.log(`Successfully joined room: ${room.id}`);
    return NextResponse.json({ room:fullRoom });
  } catch (error: any) {
    console.error('Join by code error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
