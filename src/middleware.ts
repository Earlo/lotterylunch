import { NextResponse } from 'next/server';

// Prisma adapter isn't Edge-compatible; keep middleware no-op for now.
export function middleware() {
  return NextResponse.next();
}
