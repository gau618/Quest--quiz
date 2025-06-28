// src/app/api/leaderboard/friends/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { leaderboardService } from "@/lib/services/leaderboard/leaderboard.service";

export const GET = withAuth(["USER"], async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const orderBy =
    (searchParams.get("orderBy") as "eloRating" | "xp") || "eloRating";

  try {
    const leaderboard = await leaderboardService.getFriendsLeaderboard(
      user.id,
      limit,
      orderBy
    );
    return NextResponse.json({ leaderboard });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch friends leaderboard." },
      { status: 500 }
    );
  }
});
