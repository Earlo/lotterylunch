import { MembershipStatus } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
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

export function updateGroupById(groupId: string, input: UpdateGroupInput) {
  return prisma.group.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
    },
  });
}

export function deleteGroupById(groupId: string) {
  return prisma.group.delete({
    where: { id: groupId },
  });
}
