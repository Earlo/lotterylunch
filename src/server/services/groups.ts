import { MembershipStatus, Role, Visibility } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { deleteGroupById, getGroupById, listActiveGroupsForUser, updateGroupById } from '@/server/db/groups';
import { requireGroupMembership, requireGroupRole } from '@/server/auth/authorization';
import { notFound } from '@/server/http/errors';
import type { CreateGroupInput, UpdateGroupInput } from '@/server/schemas/groups';

export async function createGroup(userId: string, input: CreateGroupInput) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        name: input.name,
        description: input.description,
        visibility: input.visibility ?? Visibility.open,
        ownerId: userId,
      },
    });

    await tx.membership.create({
      data: {
        userId,
        groupId: group.id,
        role: Role.owner,
        status: MembershipStatus.active,
      },
    });

    return group;
  });
}

export async function listGroupsForUser(userId: string) {
  const memberships = await listActiveGroupsForUser(userId);

  return memberships.map((membership) => membership.group);
}

export async function getGroupForUser(groupId: string, userId: string) {
  await requireGroupMembership(groupId, userId);

  const group = await getGroupById(groupId);

  if (!group) {
    throw notFound('Group not found');
  }

  return group;
}

export async function updateGroupForUser(groupId: string, userId: string, input: UpdateGroupInput) {
  await requireGroupRole(groupId, userId, [Role.owner, Role.admin]);

  const group = await getGroupById(groupId);
  if (!group) throw notFound('Group not found');

  return updateGroupById(groupId, input);
}

export async function deleteGroupForUser(groupId: string, userId: string) {
  await requireGroupRole(groupId, userId, [Role.owner]);

  const group = await getGroupById(groupId);
  if (!group) throw notFound('Group not found');

  await deleteGroupById(groupId);

  return { id: groupId, deleted: true as const };
}
