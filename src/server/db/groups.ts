import { prisma } from '@/lib/prisma';
import type { UpdateGroupInput } from '@/server/schemas/groups';
import { MembershipStatus } from '@prisma/client';

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
      name: input.name,
      description: input.description,
      location: input.location,
      visibility: input.visibility,
    },
  });
}

export function deleteGroupById(groupId: string) {
  return prisma.group.delete({
    where: { id: groupId },
  });
}
