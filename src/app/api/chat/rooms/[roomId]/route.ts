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
    const updatedRoom = await chatService.updateGroupDetails(user.id, roomId, body);
    return NextResponse.json({ updatedRoom });
  } catch (error: any) {
    console.error("Error in PATCH /api/chat/rooms/[roomId]:", error); // Log the error for debugging
    const status = error.message.includes("Permission Denied") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
});
