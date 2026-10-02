import { GroupRole, GroupVisibility, MembershipStatus, Role, Visibility } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireGroupMembership, requireGroupRole } from '@/lib/server/auth/authorization';
import { lockGroupForUpdate } from '@/lib/server/db/group-lock';
import { deleteGroupById, getGroupById, listActiveGroupsForUser, updateGroupById } from '@/lib/server/db/groups';
import { notFound } from '@/lib/server/http/errors';
import type { CreateGroupInput, UpdateGroupInput } from '@/lib/server/schemas/groups';

export async function createGroup(userId: string, input: CreateGroupInput) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        location: input.location ?? null,
        visibility: input.visibility ?? Visibility.open,
        groupVisibility: input.visibility ?? GroupVisibility.open,
        defaultGroupSize: input.defaultGroupSize ?? 2,
        timezone: input.timezone ?? 'UTC',
        ownerId: userId,
      },
    });

    await tx.membership.create({
      data: {
        userId,
        groupId: group.id,
        role: Role.owner,
        groupRole: GroupRole.owner,
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
  return prisma.$transaction(async (tx) => {
    await lockGroupForUpdate(tx, groupId);
    await requireGroupRole(groupId, userId, [Role.owner, Role.admin], tx);
    return updateGroupById(groupId, input, tx);
  });
}

export async function deleteGroupForUser(groupId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForUpdate(tx, groupId);
    await requireGroupRole(groupId, userId, [Role.owner], tx);
    await deleteGroupById(groupId, tx);
    return { id: groupId, deleted: true as const };
  });
}
