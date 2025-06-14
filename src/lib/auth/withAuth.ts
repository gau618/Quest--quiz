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
 //   console.log('Token:', token); // Debugging line to check the token value
    try {
      const response = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
        headers: { Authorization: token },
      });
      const user: AuthUser = response.data.data;
      if (!user) {
        return NextResponse.json({ message: 'User not found.' }, { status: 404 });
      }


      // Use 'let' so we can modify the array
      let userRoles = user.userRole?.map(ur => ur?.role?.title).filter(Boolean) as string[] || [];

      // Check if the array is empty after extraction
      if (userRoles.length === 0) {
        userRoles.push('USER');
      }

      return handler(req, { params, user });
    } catch (err: any) {
      if (err.response?.status === 401) {
        return NextResponse.json({ message: 'Wrong authentication token.' }, { status: 401 });
      }
      return NextResponse.json({ message: 'Internal server error during authentication.' }, { status: 500 });
    }
  };
}
