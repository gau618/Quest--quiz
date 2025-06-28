// src/app/api/friends/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { friendsService } from "@/lib/services/friends/friends.service";

export const GET = withAuth(["USER"], async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const users = await friendsService.searchUsers(query, user.id);
    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to search for users." },
      { status: 500 }
    );
  }
});
