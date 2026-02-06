// src/app/api/chat/rooms/[roomId]/members/[memberId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { chatService } from '@/lib/services/chat/chat.service';

interface RouteContext {
  params: Promise<{ roomId: string; memberId: string }>;
}

export const DELETE = withAuth(['USER'], async (_req: NextRequest, { user, params }: { user: any } & RouteContext) => {
  try {
    const { roomId, memberId } = await params;
    
    // Validate roomId and memberId
    if (!roomId || typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 100) {
      return NextResponse.json({ error: "Invalid roomId." }, { status: 400 });
    }
    
    if (!memberId || typeof memberId !== 'string' || memberId.length === 0 || memberId.length > 100) {
      return NextResponse.json({ error: "Invalid memberId." }, { status: 400 });
    }
    
    await chatService.removeMemberFromGroup(user.id, roomId, memberId);
    return NextResponse.json({ message: 'Member removed successfully.' });
  } catch (error: any) {
    const status = error.message.includes("Permission Denied") ? 403 : (error.message.includes("A group must have") ? 400 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
});
