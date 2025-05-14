// app/api/v1/groups/route.ts
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const group = await prisma.group.create({ data: body });
  return Response.json(group, { status: 201 });
}
