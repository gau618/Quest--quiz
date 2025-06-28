// src/app/api/leaderboard/global/route.ts
import { NextRequest, NextResponse } from "next/server";
import { leaderboardService } from "@/lib/services/leaderboard/leaderboard.service";

export const GET = async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "100");
  const orderBy =
    (searchParams.get("orderBy") as "eloRating" | "xp") || "eloRating";

  try {
    const leaderboard = await leaderboardService.getGlobalLeaderboard(
      limit,
      orderBy
    );
    return NextResponse.json({ leaderboard });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch global leaderboard." },
      { status: 500 }
    );
  }
};
