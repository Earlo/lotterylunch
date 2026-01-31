import { MembershipStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { forbidden, notFound } from '@/server/http/errors';

export async function requireGroupMembership(
  groupId: string,
  userId: string,
  opts?: { roles?: Role[] },
) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
    select: {
      id: true,
      role: true,
      status: true,
      groupId: true,
      userId: true,
    },
  });

  if (!membership) {
    throw notFound('Membership not found for user in this group');
  }

  if (membership.status !== MembershipStatus.active) {
    throw forbidden('Membership is not active');
  }

  if (opts?.roles && !opts.roles.includes(membership.role)) {
    throw forbidden('Insufficient group role');
  }

  return membership;
}

export async function requireGroupRole(groupId: string, userId: string, roles: Role[]) {
  return requireGroupMembership(groupId, userId, { roles });
}
