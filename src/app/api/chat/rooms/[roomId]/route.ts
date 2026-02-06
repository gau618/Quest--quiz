// src/app/api/chat/rooms/[roomId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { chatService } from '@/lib/services/chat/chat.service';

interface RouteContext {
  params: Promise<{ roomId: string }>;
}

export const DELETE = withAuth(['USER'], async (_req: NextRequest, { user, params }: { user: any } & RouteContext) => {
  try {
    const { roomId } = await params;
    
    // Validate roomId
    if (!roomId || typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 100) {
      return NextResponse.json({ error: "Invalid roomId." }, { status: 400 });
    }
    
    await chatService.deleteGroupAsAdmin(user.id, roomId);
    return NextResponse.json({ message: 'Group deleted successfully.' }, { status: 200 });
  } catch (error: any) {
    const status = error.message.includes("Permission Denied") ? 403 : (error.message.includes("Access Denied") ? 404 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
});

export const PATCH = withAuth(['USER'], async (req: NextRequest, { user, params }: { user: any, params: Promise<{ roomId: string }> }) => {
  try {
    const { roomId } = await params;
    const body = await req.json();
    
    // Validate roomId
    if (!roomId || typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 100) {
      return NextResponse.json({ error: "Invalid roomId." }, { status: 400 });
    }
    
    // Validate body has valid structure
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    
    // Validate groupName if provided
    if (body.groupName && (typeof body.groupName !== 'string' || body.groupName.length === 0 || body.groupName.length > 100)) {
      return NextResponse.json({ error: "Group name must be between 1 and 100 characters." }, { status: 400 });
    }
    
    const updatedRoom = await chatService.updateGroupDetails(user.id, roomId, body);
    return NextResponse.json({ updatedRoom });
  } catch (error: any) {
    console.error("Error in PATCH /api/chat/rooms/[roomId]:", error); // Log the error for debugging
    const status = error.message.includes("Permission Denied") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
});
