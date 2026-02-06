// src/app/api/leaderboard/global/route.ts
import { NextRequest, NextResponse } from "next/server";
import { leaderboardService } from "@/lib/services/leaderboard/leaderboard.service";
import { withAuth } from "@/lib/auth/withAuth";
import { checkRateLimit, createRateLimitResponse, getClientIP } from '@/lib/middleware/rateLimit';

export const GET = withAuth(["USER"], async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  
  // Additional rate limiting for leaderboard queries (expensive DB operation)
  const rateLimitResult = checkRateLimit(`user:${user.id}:leaderboard`, {
    maxRequests: 30,
    windowMs: 60000, // 30 requests per minute
  });
  
  if (rateLimitResult.limited) {
    console.warn(`[API][Leaderboard] Rate limit exceeded for user ${user.id}`);
    return createRateLimitResponse(rateLimitResult.resetTime);
  }
  
  const limitParam = parseInt(searchParams.get("limit") || "100");
  const limit = isNaN(limitParam) ? 100 : Math.min(Math.max(limitParam, 1), 500); // Cap between 1-500
  const orderByParam = searchParams.get("orderBy");
  
  // Validate orderBy parameter to prevent injection
  if (orderByParam && orderByParam !== "eloRating" && orderByParam !== "xp") {
    return NextResponse.json({ error: "Invalid orderBy parameter. Must be 'eloRating' or 'xp'." }, { status: 400 });
  }
  
  const orderBy = (orderByParam as "eloRating" | "xp") || "eloRating";

  try {
    const leaderboard = await leaderboardService.getGlobalLeaderboard(
      limit,
      orderBy
    );
    return NextResponse.json({ leaderboard });
  } catch (error: any) {
     console.log("Error fetching global leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch global leaderboard." },
      { status: 500 }
    );
  }
});
