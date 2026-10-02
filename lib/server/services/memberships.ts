import { GroupRole, MembershipStatus, Role, Visibility } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireGroupMembership, requireGroupRole } from '@/lib/server/auth/authorization';
import { lockGroupForUpdate } from '@/lib/server/db/group-lock';
import { badRequest, forbidden, notFound } from '@/lib/server/http/errors';
import type { CreateMembershipInput, UpdateMembershipInput } from '@/lib/server/schemas/memberships';

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
      participating: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function joinGroup(groupId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, groupId);
    if (group.visibility === Visibility.invite_only) {
      throw forbidden('This group requires an invite');
    }

    const membership = await tx.membership.findUnique({ where: { userId_groupId: { userId, groupId } } });
    if (membership?.status === MembershipStatus.suspended) {
      throw forbidden('A group administrator must reinstate this membership');
    }
    if (membership?.status === MembershipStatus.active) return membership;
    if (group.ownerId === userId) throw forbidden('Owner membership cannot be changed by joining');

    if (membership) {
      return tx.membership.update({
        where: { id: membership.id },
        data: {
          status: MembershipStatus.active,
          ...(membership.role === Role.owner && { role: Role.member, groupRole: GroupRole.member }),
        },
      });
    }
    return tx.membership.create({
      data: { userId, groupId, role: Role.member, groupRole: GroupRole.member, status: MembershipStatus.active },
    });
  });
}

export async function inviteToGroup(groupId: string, actorId: string, input: CreateMembershipInput) {
  const targetUserId = input.userId;
  if (!targetUserId) throw badRequest('userId is required when inviting');
  if (String(input.role) === Role.owner) throw forbidden('Use the ownership transfer endpoint');

  return prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, groupId);
    await requireGroupRole(groupId, actorId, [Role.owner, Role.admin], tx);
    if (group.ownerId === targetUserId) throw forbidden('Owner membership cannot be changed by inviting');

    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    });
    if (membership?.status === MembershipStatus.suspended) {
      throw forbidden('Reinstate this membership through membership management');
    }
    // Inviting an existing member must not overwrite their approved role or status.
    if (membership) return membership;
    return tx.membership.create({
      data: {
        userId: targetUserId,
        groupId,
        role: input.role ?? Role.member,
        groupRole: input.role ?? GroupRole.member,
        status: input.status ?? MembershipStatus.pending,
      },
    });
  });
}

export async function updateMembership(
  groupId: string,
  actorId: string,
  membershipId: string,
  input: UpdateMembershipInput,
) {
  if (String(input.role) === Role.owner) throw forbidden('Use the ownership transfer endpoint');

  return prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, groupId);
    await requireGroupRole(groupId, actorId, [Role.owner, Role.admin], tx);
    const membership = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.groupId !== groupId) throw notFound('Membership not found');
    if (membership.userId === group.ownerId) throw forbidden('Owner membership cannot be changed here');

    return tx.membership.update({
      where: { id: membershipId },
      data: {
        ...(input.role !== undefined && { role: input.role, groupRole: input.role }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });
  });
}

export async function removeMembership(groupId: string, actorId: string, membershipId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, groupId);
    const membership = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.groupId !== groupId) throw notFound('Membership not found');
    if (membership.userId !== actorId) {
      await requireGroupRole(groupId, actorId, [Role.owner, Role.admin], tx);
    }
    if (membership.userId === group.ownerId) throw forbidden('Owner membership cannot be removed');
    // Deleting a suspension would let the user create a new membership in an open group.
    if (membership.status === MembershipStatus.suspended) {
      throw forbidden('Reinstate this membership before removing it');
    }

    await tx.membership.delete({ where: { id: membershipId } });
    return { id: membershipId, deleted: true as const };
  });
}

export async function transferGroupOwnership(groupId: string, actorId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, groupId);
    await requireGroupRole(groupId, actorId, [Role.owner], tx);
    if (group.ownerId !== actorId) throw forbidden('Only the group owner can transfer ownership');
    if (userId === actorId) throw badRequest('Choose a different group member');

    const target = await tx.membership.findUnique({ where: { userId_groupId: { userId, groupId } } });
    if (!target || target.status !== MembershipStatus.active) {
      throw badRequest('The new owner must be an active group member');
    }

    await tx.membership.updateMany({
      where: { groupId, role: Role.owner },
      data: { role: Role.member, groupRole: GroupRole.member },
    });
    await tx.membership.update({
      where: { userId_groupId: { userId: actorId, groupId } },
      data: { role: Role.admin, groupRole: GroupRole.admin },
    });
    await tx.membership.update({
      where: { id: target.id },
      data: { role: Role.owner, groupRole: GroupRole.owner },
    });
    return tx.group.update({ where: { id: groupId }, data: { ownerId: userId } });
  });
}
