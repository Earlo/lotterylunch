import { Prisma } from '@/generated/prisma/client';
import { notFound } from '@/lib/server/http/errors';

// Group mutations use one lock order so ownership, membership and lottery writes
// cannot change their authorization between checking it and committing the write.
export async function lockGroupForUpdate(tx: Prisma.TransactionClient, groupId: string) {
  const groups = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE
  `);
  if (groups.length === 0) throw notFound('Group not found');
  return tx.group.findUniqueOrThrow({ where: { id: groupId } });
}
