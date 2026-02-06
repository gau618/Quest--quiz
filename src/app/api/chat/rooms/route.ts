// src/app/api/chat/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { chatService } from '@/lib/services/chat/chat.service';
import { ChatRoomType } from '@prisma/client';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rateLimit';

export const GET = withAuth(['USER'], async (_req, { user }) => {
  try {
    const rooms = await chatService.getChatRoomsForUser(user.id);
    return NextResponse.json({ rooms });
  } catch (error: any) {
    // This block is correctly handling the crash and returning the 500 error.
    console.error("Error in GET /api/chat/rooms:", error); // Add a log for easier debugging
    return NextResponse.json({ error: 'Failed to fetch chat rooms.' }, { status: 500 });
  }
});

export const POST = withAuth(['USER'], async (req, { user }) => {
  try {
    // Rate limit: 10 chat room creations per hour per user
    const rateLimitResult = checkRateLimit(`user:${user.id}:create_room`, {
      maxRequests: 10,
      windowMs: 3600000, // 1 hour
    });
    
    if (rateLimitResult.limited) {
      console.warn(`[API][Chat] Rate limit exceeded for user ${user.id}`);
      return createRateLimitResponse(rateLimitResult.resetTime);
    }

    const { type, friendId, groupName, memberIds } = await req.json();

    // Validate type
    if (!type || !['DM', 'GROUP'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type. Must be DM or GROUP.' }, { status: 400 });
    }

    if (type === 'DM') {
      if (!friendId || typeof friendId !== 'string' || friendId.length === 0 || friendId.length > 100) {
        return NextResponse.json({ error: 'Invalid friendId.' }, { status: 400 });
      }
      const room = await chatService.getOrCreateDMRoom(user.id, friendId);
      return NextResponse.json({ room });
    }
    
    if (type === 'GROUP') {
      // Validate group name
      if (!groupName || typeof groupName !== 'string' || groupName.length === 0 || groupName.length > 100) {
        return NextResponse.json({ error: 'Group name must be between 1 and 100 characters.' }, { status: 400 });
      }
      
      // Validate memberIds array
      if (!Array.isArray(memberIds) || memberIds.length === 0 || memberIds.length > 50) {
        return NextResponse.json({ error: 'memberIds must be an array with 1-50 members.' }, { status: 400 });
      }
      
      // Validate all memberIds are strings
      if (!memberIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100)) {
        return NextResponse.json({ error: 'All memberIds must be valid strings.' }, { status: 400 });
      }
      
      const room = await chatService.createGroupChatRoom(user.id, groupName, memberIds);
      return NextResponse.json({ room });
    }
    
    return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
  } catch (error: any) {
    console.error("Error in POST /api/chat/rooms:", error); // Log the error for debugging
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
