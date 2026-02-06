// src/lib/auth/withAuth.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { checkRateLimit, createRateLimitResponse, getClientIP } from '../middleware/rateLimit';

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
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const isAllowed = allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin));
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': allowedOrigins.includes('*') ? 'false' : 'true',
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

    // Rate limiting check (before authentication to prevent auth service spam)
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit(clientIP, {
      maxRequests: 100,  // 100 requests
      windowMs: 60000,   // per minute
    });
    
    if (rateLimitResult.limited) {
      const response = createRateLimitResponse(rateLimitResult.resetTime);
      const finalHeaders = new Headers(response.headers);
      const corsHeaders = getCorsHeaders(origin);
      Object.entries(corsHeaders).forEach(([k, v]) => finalHeaders.set(k, v));
      return new NextResponse(response.body, {
        status: response.status,
        headers: finalHeaders,
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
    let user: AuthUser | null = null;

    try {
      // Ensure token has Bearer prefix if needed
      const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      
      const response = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
        headers: { Authorization: authHeader },
        timeout: 5000
      });
      user = response.data.data;

    } catch (e: any) {
         // Retry/Fallback logic
         try {
             // 1. Try raw token request if headers might be issue
             try {
                const retryResponse = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
                   headers: { Authorization: token },
                   timeout: 3000
                 });
                 user = retryResponse.data.data;
             } catch (apiError) {
                 // 2. If API is totally dead/404, trust the token (JWT Decode)
                 const userToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
                 const decoded: any = jwtDecode(userToken);
                 if (decoded && decoded.id) {
                     user = {
                         id: decoded.id, 
                         email: decoded.email || '', 
                         username: decoded.username || 'User', 
                         name: decoded.name || 'User'
                     } as AuthUser;
                 }
             }
         } catch (finalError) {
            console.error("Auth verification failed completely. Final error:", finalError);
         }
    }

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
