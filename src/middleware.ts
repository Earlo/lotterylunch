import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

function rateLimitKey(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  return `${ip}:${req.nextUrl.pathname.startsWith('/api/v1') ? 'v1' : 'other'}`;
}

function isRateLimited(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/v1')) return false;

  const key = rateLimitKey(req);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };

  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);
  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  return bucket.timestamps.length > MAX_REQUESTS_PER_WINDOW;
}

export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  if (isRateLimited(req)) {
    return NextResponse.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many requests',
        },
      },
      { status: 429 },
    );
  }

  return NextResponse.next();
}
