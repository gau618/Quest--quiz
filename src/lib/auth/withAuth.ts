// src/lib/auth/withAuth.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export interface AuthUser {
  id: string;
  username: string;
  name: string;      // <-- Ensure this is included!
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
    //console.log(`[withAuth] Initiating authentication for request to ${req.url}`);
    const token = req.headers.get('authorization');
    if (!token) {
      console.warn(`[withAuth] Token missing for request to ${req.url}`);
      return NextResponse.json({ message: 'Token required.' }, { status: 403 });
    }
    try {
     // console.log(`[withAuth] Verifying token with auth service: ${token.substring(0, 30)}...`);
      const response = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
        headers: { Authorization: token },
      });
      const user: AuthUser = response.data.data;
     // console.log(`[withAuth] User data received: ${JSON.stringify(user)}`);
      
      if (!user) {
        console.warn(`[withAuth] User not found after token verification for ${req.url}`);
        return NextResponse.json({ message: 'User not found.' }, { status: 404 });
      }

      let userRoles = user.userRole?.map(ur => ur?.role?.title).filter(Boolean) as string[] || [];
      if (userRoles.length === 0) {
        userRoles.push('USER'); // Default role if none found
       // console.log(`[withAuth] User ${user.username} has no roles, assigning default 'USER'.`);
      }

      // const hasPermission = allowedRoles.some(role => userRoles.includes(role));
      // if (!hasPermission) {
      //   console.warn(`[withAuth] User ${user.username} (${user.id}) lacks required roles. Has: ${userRoles.join(', ')}, Required: ${allowedRoles.join(', ')}`);
      //   return NextResponse.json({ message: 'Access forbidden.' }, { status: 403 });
      // }

     // console.log(`[withAuth] User ${user.username} (${user.id}) authenticated and authorized. Roles: ${userRoles.join(', ')}`);
      return handler(req, { params, user });
    } catch (err: any) {
      if (err.response?.status === 401) {
        console.error(`[withAuth] Authentication failed for ${req.url}: Wrong authentication token.`, err.message);
        return NextResponse.json({ message: 'Wrong authentication token.' }, { status: 401 });
      }
      console.error(`[withAuth] Internal server error during authentication for ${req.url}:`, err);
      return NextResponse.json({ message: 'Internal server error during authentication.' }, { status: 500 });
    }
  };
}
