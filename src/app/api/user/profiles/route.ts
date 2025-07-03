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
    if (!Array.isArray(userIds)) {
      return NextResponse.json({ error: 'userIds must be an array' }, { status: 400 });
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
