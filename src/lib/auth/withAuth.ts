// src/lib/auth/withAuth.ts

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  userRole: { role: { title: string } }[];
}

interface AuthenticatedRequestContext {
  params: any;
  user: AuthUser;
}

type AuthenticatedRouteHandler = (
  req: NextRequest,
  context: AuthenticatedRequestContext
) => Promise<NextResponse> | NextResponse;

export function withAuth(allowedRoles: string[], handler: AuthenticatedRouteHandler) {
  return async (req: NextRequest, { params }: { params: any }): Promise<NextResponse> => {
    const token = req.headers.get('authorization');
    if (!token) {
      return NextResponse.json({ message: 'Token required.' }, { status: 403 });
    }
    try {
      const response = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
        headers: { Authorization: token },
      });
      const user: AuthUser = response.data.data;
      console.log(user)
      if (!user) {
        return NextResponse.json({ message: 'User not found.' }, { status: 404 });
      }
      let userRoles = user.userRole?.map(ur => ur?.role?.title).filter(Boolean) as string[] || [];
      if (userRoles.length === 0) {
        userRoles.push('USER');
      }
      console.log(`[Auth] User ${user.username} (${user.id}) authenticated with roles: ${userRoles.join(', ')}`);
      return handler(req, { params, user });
    } catch (err: any) {
      if (err.response?.status === 401) {
        return NextResponse.json({ message: 'Wrong authentication token.' }, { status: 401 });
      }
      return NextResponse.json({ message: 'Internal server error during authentication.' }, { status: 500 });
    }
  };
}
