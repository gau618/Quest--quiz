import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';

const allowedRoles = ['ADMIN', 'USER']; // Adjust as needed

const handler = async (
  req: NextRequest,
  { params, user }: { params: any; user: AuthUser }
) => {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  }
  try {
    const body = await req.json();
    const userIds = body.userIds;
    
    // Validate array
    if (!Array.isArray(userIds)) {
      return NextResponse.json({ error: 'userIds must be an array' }, { status: 400 });
    }
    
    // Prevent resource exhaustion - limit to 100 profiles per request
    if (userIds.length === 0 || userIds.length > 100) {
      return NextResponse.json({ error: 'userIds array must contain 1-100 items' }, { status: 400 });
    }
    
    // Validate all elements are strings
    if (!userIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100)) {
      return NextResponse.json({ error: 'All userIds must be valid strings' }, { status: 400 });
    }
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: userIds } },
    });
    if (!profiles.length) {
      console.warn('[getUserProfiles] No profiles found for userIds:', userIds);
    }
    return NextResponse.json(profiles, { status: 200 });
  } catch (error) {
    console.error('[getUserProfiles] Error fetching user profiles:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};

export const POST = withAuth(allowedRoles, handler);
