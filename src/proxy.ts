import { SlidingWindowRateLimiter } from '@/server/http/rate-limit';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const rateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
  maxClients: 10_000,
});

export function proxy(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  // The deployment's trusted ingress must set this header. Use only the first
  // address so different proxy chains do not create separate client buckets.
  const client =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const result = rateLimiter.check(client);
  if (!result.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many requests',
        },
      },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/v1/:path*',
};
