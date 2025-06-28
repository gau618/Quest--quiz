// src/app/api/friends/requests/[requestId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { friendsService } from "@/lib/services/friends/friends.service";

// Respond to a friend request (accept or decline)
export const PATCH = withAuth(
  ["USER"],
  async (
    req: NextRequest,
    { user, params }: { user: any; params: { requestId: string } }
  ) => {
    const { requestId } = params;
    try {
      const { action } = await req.json();
      if (!action || !["accept", "decline"].includes(action)) {
        return NextResponse.json(
          { error: 'Invalid action specified. Must be "accept" or "decline".' },
          { status: 400 }
        );
      }
      await friendsService.respondToFriendRequest(user.id, requestId, action);
      return NextResponse.json({ success: true });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
);
