import { NextResponse, type NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return NextResponse.json({ message: `Hello ${slug}!` });
}
