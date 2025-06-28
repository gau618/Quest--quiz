// src/app/api/chat/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { chatService } from '@/lib/services/chat/chat.service';
import { ChatRoomType } from '@prisma/client';

export const GET = withAuth(['USER'], async (_req, { user }) => {
  try {
    const rooms = await chatService.getChatRoomsForUser(user.id);
    return NextResponse.json({ rooms });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch chat rooms.' }, { status: 500 });
  }
});

export const POST = withAuth(['USER'], async (req, { user }) => {
  try {
    const { type, friendId, groupName, memberIds } = await req.json();
    if (type === 'DM' && friendId) {
      const room = await chatService.getOrCreateDMRoom(user.id, friendId);
      return NextResponse.json({ room });
    }
    if (type === 'GROUP' && groupName && Array.isArray(memberIds)) {
      const room = await chatService.createGroupChatRoom(user.id, groupName, memberIds);
      return NextResponse.json({ room });
    }
    return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
