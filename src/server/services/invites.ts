import { prisma } from '@/lib/prisma';
import { requireGroupRole } from '@/server/auth/authorization';
import { forbidden, notFound } from '@/server/http/errors';
import { MembershipStatus, Role } from '@prisma/client';
import crypto from 'crypto';

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function createGroupInvite(
  groupId: string,
  actorId: string,
  expiresInDays = 7,
  maxUses = 1,
) {
  await requireGroupRole(groupId, actorId, [Role.owner, Role.admin]);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  return prisma.groupInvite.create({
    data: {
      groupId,
      createdById: actorId,
      token: generateToken(),
      expiresAt,
      maxUses,
      uses: 0,
    },
  });
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await prisma.groupInvite.findUnique({ where: { token } });
  if (!invite) throw notFound('Invite not found');
  if (invite.expiresAt < new Date()) throw forbidden('Invite has expired');
  if (invite.uses >= invite.maxUses) throw forbidden('Invite has been used');

  const membership = await prisma.membership.upsert({
    where: {
      userId_groupId: {
        userId,
        groupId: invite.groupId,
      },
    },
    update: {
      status: MembershipStatus.active,
    },
    create: {
      userId,
      groupId: invite.groupId,
      role: Role.member,
      status: MembershipStatus.active,
    },
  });

  await prisma.groupInvite.update({
    where: { token },
    data: { uses: invite.uses + 1 },
  });

  return membership;
}
