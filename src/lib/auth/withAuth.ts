// src/lib/auth/withAuth.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
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

// Helper: build CORS headers dynamically
function getCorsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    // Removed 'Access-Control-Allow-Credentials': 'true' to allow wildcard origin
  };
}

export function withAuth(allowedRoles: string[], handler: AuthenticatedRouteHandler) {
  return async (req: NextRequest, { params }: { params: any }): Promise<NextResponse> => {
    const origin = req.headers.get('origin');

    // Handle CORS preflight request (OPTIONS)
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    const token = req.headers.get('authorization');
    if (!token) {
      return new NextResponse(
        JSON.stringify({ message: 'Token required.' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          },
        }
      );
    }

    try {
      const response = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
        headers: { Authorization: token },
      });

      const user: AuthUser = response.data.data;

      if (!user) {
        return new NextResponse(
          JSON.stringify({ message: 'User not found.' }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(origin),
            },
          }
        );
      }

      let userRoles = user.userRole?.map(ur => ur?.role?.title).filter(Boolean) as string[] || [];
      if (userRoles.length === 0) userRoles.push('USER');

      // Check if user has required role (OPTIONAL)
      // const hasPermission = allowedRoles.some(role => userRoles.includes(role));
      // if (!hasPermission) {
      //   return new NextResponse(JSON.stringify({ message: 'Access forbidden.' }), {
      //     status: 403,
      //     headers: {
      //       'Content-Type': 'application/json',
      //       ...getCorsHeaders(origin),
      //     },
      //   });
      // }

      // Run original handler
      const res = await handler(req, { params, user });

      // Attach CORS headers to response
      const finalHeaders = new Headers(res.headers);
      const corsHeaders = getCorsHeaders(origin);
      Object.entries(corsHeaders).forEach(([k, v]) => finalHeaders.set(k, v));

      return new NextResponse(res.body, {
        status: res.status,
        headers: finalHeaders,
      });

    } catch (err: any) {
      const status = err.response?.status === 401 ? 401 : 500;
      const message = status === 401 ? 'Wrong authentication token.' : 'Internal server error during authentication.';
      return new NextResponse(JSON.stringify({ message }), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      });
    }
  };
}
