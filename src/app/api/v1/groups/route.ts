// app/api/v1/groups/route.ts
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

type GroupCreate = Prisma.GroupUncheckedCreateInput;

export async function POST(req: Request) {
  const body = (await req.json()) as GroupCreate;
  const group = await prisma.group.create({ data: body });
  return Response.json(group, { status: 201 });
}
