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
    // Descendants precede their restricted foreign keys. All cleanup rolls back
    // together if any deletion fails.
    await tx.calendarArtifact.deleteMany({ where: { match: { groupId } } });
    await tx.lunchEvent.deleteMany({ where: { match: { groupId } } });
    await tx.match.deleteMany({ where: { groupId } });
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
