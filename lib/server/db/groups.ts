import { MembershipStatus, type Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { lockGroupForUpdate } from '@/lib/server/db/group-lock';
import type { UpdateGroupInput } from '@/lib/server/schemas/groups';

export function listActiveGroupsForUser(userId: string) {
  return prisma.membership.findMany({
    where: {
      userId,
      status: MembershipStatus.active,
    },
    include: {
      group: true,
    },
    orderBy: {
      joinedAt: 'desc',
    },
  });
}

export function getGroupById(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
  });
}

export function updateGroupById(
  groupId: string,
  input: UpdateGroupInput,
  db: Pick<Prisma.TransactionClient, 'group'> = prisma,
) {
  return db.group.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.visibility !== undefined && {
        visibility: input.visibility,
        groupVisibility: input.visibility,
      }),
      ...(input.defaultGroupSize !== undefined && { defaultGroupSize: input.defaultGroupSize }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
    },
  });
}

export function deleteGroupById(groupId: string, transaction?: Prisma.TransactionClient) {
  const cleanup = async (tx: Prisma.TransactionClient) => {
    // Older db-pushed installations retain this unmanaged lottery hierarchy.
    // Check inside the transaction because fresh migration-built databases do
    // not have these tables. Delete only records belonging to this group.
    const [legacy] = await tx.$queryRaw<
      { lottery: boolean; lotteryRun: boolean; participation: boolean; matchRunId: boolean }[]
    >`
      SELECT to_regclass('"Lottery"') IS NOT NULL AS lottery,
             to_regclass('"LotteryRun"') IS NOT NULL AS "lotteryRun",
             to_regclass('"Participation"') IS NOT NULL AS participation,
             EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'Match' AND column_name = 'runId'
             ) AS "matchRunId"
    `;
    const legacyMatches =
      legacy?.lottery && legacy.lotteryRun && legacy.matchRunId
        ? await tx.$queryRaw<{ id: string }[]>`
            SELECT m."id" FROM "Match" m
            JOIN "LotteryRun" r ON r."id" = m."runId"
            JOIN "Lottery" l ON l."id" = r."lotteryId"
            WHERE l."groupId"::text = ${groupId}::uuid::text
          `
        : [];
    const matchWhere: Prisma.MatchWhereInput = {
      OR: [{ groupId }, { id: { in: legacyMatches.map(({ id }) => id) } }],
    };
    // Descendants precede their restricted foreign keys. All cleanup rolls back
    // together if any deletion fails.
    await tx.calendarArtifact.deleteMany({ where: { match: matchWhere } });
    await tx.lunchEvent.deleteMany({ where: { match: matchWhere } });
    await tx.match.deleteMany({ where: matchWhere });
    if (legacy?.lottery) {
      if (legacy.lotteryRun) {
        if (legacy.participation) {
          await tx.$executeRaw`
            DELETE FROM "Participation" p USING "LotteryRun" r, "Lottery" l
            WHERE p."runId" = r."id" AND r."lotteryId" = l."id"
              AND l."groupId"::text = ${groupId}::uuid::text
          `;
        }
        await tx.$executeRaw`
          DELETE FROM "LotteryRun" r USING "Lottery" l
          WHERE r."lotteryId" = l."id" AND l."groupId"::text = ${groupId}::uuid::text
        `;
      }
      await tx.$executeRaw`DELETE FROM "Lottery" WHERE "groupId"::text = ${groupId}::uuid::text`;
    }
    await tx.lunchRun.deleteMany({ where: { groupId } });
    await tx.availabilitySlot.deleteMany({ where: { groupId } });
    await tx.groupInvite.deleteMany({ where: { groupId } });
    await tx.membership.deleteMany({ where: { groupId } });
    return tx.group.delete({ where: { id: groupId } });
  };
  return transaction
    ? cleanup(transaction)
    : prisma.$transaction(async (tx) => {
        await lockGroupForUpdate(tx, groupId);
        return cleanup(tx);
      });
}
