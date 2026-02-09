import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const envOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
let ALLOWED_ORIGINS = [...envOrigins];

// Production: Filter out localhost to enforce security
// if (process.env.NODE_ENV === 'production') {
//   ALLOWED_ORIGINS = ALLOWED_ORIGINS.filter(origin => !origin.includes('localhost'));
// } else {
  // Development: Ensure localhost is available
  if (!ALLOWED_ORIGINS.includes('http://localhost:3000')) ALLOWED_ORIGINS.push('http://localhost:3000');
  if (!ALLOWED_ORIGINS.includes('http://localhost:4000')) ALLOWED_ORIGINS.push('http://localhost:4000');
// }

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  
  // Only apply to /api routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    
    // Check if origin is allowed
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      // Handle simple requests
      const response = NextResponse.next();
      
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT,OPTIONS');
      response.headers.set(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
      );
      
      return response;
    }

    // Handle Preflight (OPTIONS) requests
    if (request.method === 'OPTIONS') {
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        return new NextResponse(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
            'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
