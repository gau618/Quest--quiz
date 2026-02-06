import { withAuth } from '@/lib/auth/withAuth';
import { inviteService } from '@/lib/services/invite.service';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client'; // Ensure this path is correct
export const POST = withAuth(['USER'], async (req: NextRequest, { user }) => {
  const { code } = await req.json();
  
  // Strict validation for invite code
  if (!code || typeof code !== 'string' || code.length === 0 || code.length > 100) {
    return NextResponse.json(
      { error: "Invalid code. Must be a string between 1 and 100 characters." },
      { status: 400 }
    );
  }
  
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
