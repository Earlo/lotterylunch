import crypto from 'crypto';
import { GroupRole, MembershipStatus, Role } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireGroupRole } from '@/lib/server/auth/authorization';
import { lockGroupForUpdate } from '@/lib/server/db/group-lock';
import { forbidden, notFound } from '@/lib/server/http/errors';

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function createGroupInvite(groupId: string, actorId: string, expiresInDays = 7, maxUses = 1) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForUpdate(tx, groupId);
    await requireGroupRole(groupId, actorId, [Role.owner, Role.admin], tx);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    return tx.groupInvite.create({
      data: { groupId, createdById: actorId, token: generateToken(), expiresAt, maxUses, uses: 0 },
    });
  });
}

export async function acceptInvite(token: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.groupInvite.findUnique({ where: { token } });
    if (!invite) throw notFound('Invite not found');
    const group = await lockGroupForUpdate(tx, invite.groupId);
    const now = new Date();
    if (invite.expiresAt <= now) throw forbidden('Invite has expired');

    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId, groupId: invite.groupId } },
    });
    if (membership?.status === MembershipStatus.suspended) {
      throw forbidden('A group administrator must reinstate this membership');
    }
    if (membership?.status === MembershipStatus.active) return membership;
    if (group.ownerId === userId) throw forbidden('Owner membership cannot be changed by accepting an invite');

    // PostgreSQL checks the latest row after any concurrent update. A failed
    // membership write rolls this increment back in the same transaction.
    const claim = await tx.groupInvite.updateMany({
      where: { id: invite.id, uses: { lt: invite.maxUses }, expiresAt: { gt: now } },
      data: { uses: { increment: 1 } },
    });
    if (claim.count !== 1) throw forbidden('Invite has expired or has been used');

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
      data: {
        userId,
        groupId: invite.groupId,
        role: Role.member,
        groupRole: GroupRole.member,
        status: MembershipStatus.active,
      },
    });
  });
}
