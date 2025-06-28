// src/app/api/friends/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { friendsService } from "@/lib/services/friends/friends.service";

// Get the current user's friends list
export const GET = withAuth(["USER"], async (_req: NextRequest, { user }) => {
  try {
    const friends = await friendsService.getFriends(user.id);
    return NextResponse.json({ friends });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch friends list." },
      { status: 500 }
    );
  }
});

// Remove a friend
export const DELETE = withAuth(["USER"], async (req: NextRequest, { user }) => {
  try {
    const { friendId } = await req.json();
    if (!friendId) {
      return NextResponse.json(
        { error: "friendId is required." },
        { status: 400 }
      );
    }
    await friendsService.removeFriend(user.id, friendId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
