// src/app/api/leaderboard/friends/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { leaderboardService } from "@/lib/services/leaderboard/leaderboard.service";

export const GET = withAuth(["USER"], async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get("limit") || "50");
  const limit = isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 500); // Cap between 1-500
  const orderByParam = searchParams.get("orderBy");
  
  // Validate orderBy parameter to prevent injection
  if (orderByParam && orderByParam !== "eloRating" && orderByParam !== "xp") {
    return NextResponse.json({ error: "Invalid orderBy parameter. Must be 'eloRating' or 'xp'." }, { status: 400 });
  }
  
  const orderBy = (orderByParam as "eloRating" | "xp") || "eloRating";

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
