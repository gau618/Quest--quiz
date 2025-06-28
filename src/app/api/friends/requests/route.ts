// src/app/api/friends/requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { friendsService } from "@/lib/services/friends/friends.service";

// Send a new friend request
export const POST = withAuth(["USER"], async (req: NextRequest, { user }) => {
  try {
    const { receiverId } = await req.json();
    if (!receiverId) {
      return NextResponse.json(
        { error: "receiverId is required." },
        { status: 400 }
      );
    }
    const request = await friendsService.sendFriendRequest(user.id, receiverId);
    return NextResponse.json({ success: true, request });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});

// Get pending friend requests for the current user
export const GET = withAuth(["USER"], async (_req: NextRequest, { user }) => {
  try {
    const requests = await friendsService.getPendingRequests(user.id);
    return NextResponse.json({ requests });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch friend requests." },
      { status: 500 }
    );
  }
});
