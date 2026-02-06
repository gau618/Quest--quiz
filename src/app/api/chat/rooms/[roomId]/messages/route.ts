// src/app/api/chat/rooms/[roomId]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { chatService } from '@/lib/services/chat/chat.service';

// --- The Type Definition Fix ---
// Update the type to correctly reflect that `params` is a Promise.
interface RouteContext {
  params: Promise<{ roomId: string }>;
}
// -----------------------------

export const GET = withAuth(['USER'], async (_req: NextRequest, { user, params }: { user: any } & RouteContext) => {
  try {
    // --- THE CORE FIX ---
    // 1. Await the `params` promise to get the resolved object.
    const resolvedParams = await params;
    const roomId = resolvedParams.roomId;
    // --------------------

    // Validate roomId
    if (!roomId || typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 100) {
      return NextResponse.json({ error: "Invalid roomId." }, { status: 400 });
    }

    // 2. Now, use the `roomId` safely.
    const messages = await chatService.getMessagesForRoom(user.id, roomId);
    return NextResponse.json({ messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
});

// A cleaner way to write the function signature and destructure:
export const POST = withAuth(['USER'], async (req: NextRequest, { user, params }: { user: any } & RouteContext) => {
  try {
    const { roomId } = await params; // Destructure directly from the awaited promise
    
    // Validate roomId
    if (!roomId || typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 100) {
      return NextResponse.json({ error: "Invalid roomId." }, { status: 400 });
    }
    
    const { content } = await req.json();

    // Strict validation: content must be string with length limits
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Message content must be a string.' }, { status: 400 });
    }
    
    if (content.length === 0 || content.length > 5000) {
      return NextResponse.json({ error: 'Message content must be between 1 and 5000 characters.' }, { status: 400 });
    }
    
    const message = await chatService.sendMessage(user.id, roomId, content);
    return NextResponse.json({ message });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
