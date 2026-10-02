import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Exercise the application schema as well as the database connection.
    await prisma.user.findFirst({ select: { id: true } });
    return Response.json(
      { status: 'ready', service: 'lotterylunch-api' },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json(
      { status: 'unavailable', service: 'lotterylunch-api' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
