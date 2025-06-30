// src/app/api/users/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import prisma from '@/lib/prisma/client';

export const GET = withAuth(['USER'], async (request: NextRequest, { user }: { user: any }) => {
  try {
    // 1. Get Search Query and Room to Exclude from URL
    // This is the correct way to read search params in Next.js 13+ App Router
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const excludeRoomId = searchParams.get('excludeRoomId');
    console.log(`Search query: ${query}, Exclude Room ID: ${excludeRoomId}`);

    if (!query) {
      return NextResponse.json({ error: "Search query is required." }, { status: 400 });
    }

    let membersToExclude: string[] = [];

    // 2. If a room ID is provided, find all members already in that chat room
    if (excludeRoomId) {
      const roomMembers = await prisma.chatRoomMember.findMany({
        where: { chatRoomId: excludeRoomId },
        select: { userId: true },
      });
      membersToExclude = roomMembers.map(member => member.userId);
    }
    
    // Also exclude the current user from the search results
    const allExcludedIds = [...membersToExclude, user.id];

    // 3. Find users matching the query, excluding the ones already in the room and the user themselves
    const users = await prisma.userProfile.findMany({
      where: {
        AND: [
          {
            username: {
              contains: query,
              mode: 'insensitive', // Case-insensitive search
            },
          },
          {
            NOT: {
              // The UserProfile ID, not the auth user ID
              id: { in: allExcludedIds },
            },
          },
        ],
      },
      take: 10, // Limit results to prevent sending too much data
      select: {
        id: true, // This is the UserProfile ID
        userId:true,
        username: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({ users });

  } catch (error: any) {
    console.error("User search failed:", error);
    return NextResponse.json({ error: "An error occurred while searching for users." }, { status: 500 });
  }
});
