import { withAuth } from '@/lib/auth/withAuth';
import { inviteService } from '@/lib/services/invite.service';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client'; // Ensure this path is correct
interface RouteContext {
  params: Promise<{ roomId: string }>;
}

// GET handler to fetch active invites
export const GET = withAuth(['USER'], async (_req: NextRequest, { user, params }: { user: any } & RouteContext) => {
  try {
    const { roomId } = await params;
    
    // Check if user is room admin
    const isAdmin = await prisma.chatRoomMember.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId: roomId,
          userId: user.id,
        },
        role: 'ADMIN'
      }
    });

    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admins can view invites' }, { status: 403 });
    }

    const invites = await inviteService.getActiveInvites(roomId);
    return NextResponse.json(invites);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// POST handler to create new invite (existing code)
export const POST = withAuth(['USER'], async (_req: NextRequest, { user, params }: { user: any } & RouteContext) => {
  try {
    const { roomId } = await params;
    const invite = await inviteService.generateInviteCode(roomId, user.id);
    return NextResponse.json(invite);
  } catch (error: any) {
    console.error('Error generating invite:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
