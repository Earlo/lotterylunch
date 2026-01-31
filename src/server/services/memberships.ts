import { prisma } from '@/lib/prisma';
import {
  requireGroupMembership,
  requireGroupRole,
} from '@/server/auth/authorization';
import { badRequest, forbidden, notFound } from '@/server/http/errors';
import type {
  CreateMembershipInput,
  UpdateMembershipInput,
} from '@/server/schemas/memberships';
import { MembershipStatus, Role, Visibility } from '@prisma/client';

async function getGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw notFound('Group not found');
  return group;
}

export async function listMemberships(groupId: string, userId: string) {
  await requireGroupMembership(groupId, userId);

  return prisma.membership.findMany({
    where: { groupId },
    orderBy: { joinedAt: 'asc' },
    select: {
      id: true,
      userId: true,
      groupId: true,
      role: true,
      status: true,
      joinedAt: true,
    },
  });
}

export async function joinGroup(groupId: string, userId: string) {
  const group = await getGroup(groupId);

  if (group.visibility === Visibility.invite_only) {
    throw forbidden('This group requires an invite');
  }

  const membership = await prisma.membership.upsert({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
    update: {
      status: MembershipStatus.active,
    },
    create: {
      userId,
      groupId,
      role: Role.member,
      status: MembershipStatus.active,
    },
  });

  console.info('[memberships] joined', { groupId, userId });
  return membership;
}

export async function inviteToGroup(
  groupId: string,
  actorId: string,
  input: CreateMembershipInput,
) {
  const targetUserId = input.userId;
  if (!targetUserId) throw badRequest('userId is required when inviting');

  await requireGroupRole(groupId, actorId, [Role.owner, Role.admin]);

  const group = await getGroup(groupId);

  const membership = await prisma.membership.upsert({
    where: {
      userId_groupId: {
        userId: targetUserId,
        groupId,
      },
    },
    update: {
      role: input.role ?? Role.member,
      status: input.status ?? MembershipStatus.pending,
    },
    create: {
      userId: targetUserId,
      groupId: group.id,
      role: input.role ?? Role.member,
      status: input.status ?? MembershipStatus.pending,
    },
  });

  console.info('[memberships] invited', {
    groupId,
    actorId,
    targetUserId,
    role: input.role ?? Role.member,
    status: input.status ?? MembershipStatus.pending,
  });
  return membership;
}

export async function updateMembership(
  groupId: string,
  actorId: string,
  membershipId: string,
  input: UpdateMembershipInput,
) {
  await requireGroupRole(groupId, actorId, [Role.owner, Role.admin]);

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });

  if (!membership || membership.groupId !== groupId) {
    throw notFound('Membership not found');
  }

  if (
    membership.role === Role.owner &&
    input.role &&
    input.role !== Role.owner
  ) {
    throw forbidden('Owner role cannot be changed here');
  }

  const updated = await prisma.membership.update({
    where: { id: membershipId },
    data: {
      role: input.role,
      status: input.status,
    },
  });

  console.info('[memberships] updated', {
    groupId,
    actorId,
    membershipId,
    role: input.role,
    status: input.status,
  });
  return updated;
}

export async function removeMembership(
  groupId: string,
  actorId: string,
  membershipId: string,
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });

  if (!membership || membership.groupId !== groupId) {
    throw notFound('Membership not found');
  }

  const isSelf = membership.userId === actorId;

  if (!isSelf) {
    await requireGroupRole(groupId, actorId, [Role.owner, Role.admin]);
  }

  if (membership.role === Role.owner) {
    throw forbidden('Owner membership cannot be removed');
  }

  await prisma.membership.delete({ where: { id: membershipId } });
  console.info('[memberships] removed', {
    groupId,
    actorId,
    membershipId,
    removedUserId: membership.userId,
  });
  return { id: membershipId, deleted: true as const };
}
