import { MembershipStatus, Role, type Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { forbidden, notFound } from '@/lib/server/http/errors';

export async function requireGroupMembership(
  groupId: string,
  userId: string,
  opts?: { roles?: Role[] },
  db: Pick<Prisma.TransactionClient, 'membership'> = prisma,
) {
  const membership = await db.membership.findUnique({
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
      group: { select: { ownerId: true } },
    },
  });

  if (!membership) {
    throw notFound('Membership not found for user in this group');
  }

  if (membership.status !== MembershipStatus.active) {
    throw forbidden('Membership is not active');
  }

  // A historical or malformed owner-role membership cannot grant ownership.
  const role =
    membership.group.ownerId === userId ? Role.owner : membership.role === Role.owner ? Role.member : membership.role;

  if (opts?.roles && !opts.roles.includes(role)) {
    throw forbidden('Insufficient group role');
  }

  return { ...membership, role };
}

export async function requireGroupRole(
  groupId: string,
  userId: string,
  roles: Role[],
  db: Pick<Prisma.TransactionClient, 'membership'> = prisma,
) {
  return requireGroupMembership(groupId, userId, { roles }, db);
}
