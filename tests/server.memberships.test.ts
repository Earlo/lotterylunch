import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { MembershipStatus, Role, Visibility } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireGroupRole } from '@/lib/server/auth/authorization';
import { HttpError } from '@/lib/server/http/errors';
import { createMembershipSchema, updateMembershipSchema } from '@/lib/server/schemas/memberships';
import { acceptInvite } from '@/lib/server/services/invites';
import {
  inviteToGroup,
  joinGroup,
  removeMembership,
  transferGroupOwnership,
  updateMembership,
} from '@/lib/server/services/memberships';

const groupId = '11111111-1111-4111-8111-111111111111';
const group = { id: groupId, ownerId: 'owner', visibility: Visibility.open };
function member(userId: string, role: Role = Role.member, status: MembershipStatus = MembershipStatus.active) {
  return { id: `membership-${userId}`, userId, groupId, role, status, group: { ownerId: group.ownerId } };
}

function mockPrismaMethod<Delegate extends object>(
  context: TestContext,
  delegate: Delegate,
  method: keyof Delegate,
  implementation: (...args: never[]) => unknown,
) {
  const original = delegate[method];
  Object.assign(delegate, { [method]: context.mock.fn(implementation) });
  context.after(() => {
    Object.assign(delegate, { [method]: original });
  });
}

function database(t: TestContext, records: ReturnType<typeof member>[]) {
  const writes: unknown[] = [];
  const tx = {
    $queryRaw: () => Promise.resolve([{ id: groupId }]),
    group: {
      findUniqueOrThrow: () => Promise.resolve(group),
      update: (args: unknown) => {
        writes.push(args);
        return Promise.resolve(group);
      },
    },
    membership: {
      findUnique: (args: { where: { id?: string; userId_groupId?: { userId: string } } }) =>
        Promise.resolve(
          records.find((record) =>
            args.where.id ? record.id === args.where.id : record.userId === args.where.userId_groupId?.userId,
          ) ?? null,
        ),
      create: (args: unknown) => {
        writes.push(args);
        return Promise.resolve(args);
      },
      update: (args: unknown) => {
        writes.push(args);
        return Promise.resolve(args);
      },
      updateMany: (args: unknown) => {
        writes.push(args);
        return Promise.resolve({ count: 1 });
      },
      delete: (args: unknown) => {
        writes.push(args);
        return Promise.resolve(args);
      },
    },
    groupInvite: {
      findUnique: () =>
        Promise.resolve({
          id: 'invite',
          groupId,
          maxUses: 1,
          uses: 0,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      updateMany: (args: unknown) => {
        writes.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
  };
  mockPrismaMethod(t, prisma, '$transaction', (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mockPrismaMethod(t, prisma.membership, 'findUnique', tx.membership.findUnique);
  return { tx, writes };
}

function denied(error: unknown) {
  return error instanceof HttpError && error.status === 403;
}

void test('generic membership payloads reject ownership promotion', () => {
  assert.equal(createMembershipSchema.safeParse({ userId: 'attacker', role: 'owner' }).success, false);
  assert.equal(updateMembershipSchema.safeParse({ role: 'owner' }).success, false);
});

void test('an owner role without Group.ownerId never grants owner or administrator permissions', async (t) => {
  database(t, [member('attacker', Role.owner)]);
  await assert.rejects(requireGroupRole(groupId, 'attacker', [Role.owner, Role.admin]), denied);
});

void test('administrator cannot overwrite, suspend or remove the canonical owner', async (t) => {
  // Deliberately use a corrupted persisted role: ownership protection must use ownerId.
  const owner = member('owner', Role.member);
  const { writes } = database(t, [owner, member('admin', Role.admin)]);
  await assert.rejects(inviteToGroup(groupId, 'admin', { userId: 'owner' }), denied);
  await assert.rejects(updateMembership(groupId, 'admin', owner.id, { status: MembershipStatus.suspended }), denied);
  await assert.rejects(removeMembership(groupId, 'admin', owner.id), denied);
  assert.deepEqual(writes, []);
});

void test('suspended members cannot recover their role by joining, invitation or leaving first', async (t) => {
  const suspended = member('suspended', Role.admin, MembershipStatus.suspended);
  const { writes } = database(t, [suspended, member('owner', Role.owner)]);
  await assert.rejects(joinGroup(groupId, suspended.userId), denied);
  await assert.rejects(acceptInvite('valid-token', suspended.userId), denied);
  await assert.rejects(inviteToGroup(groupId, 'owner', { userId: suspended.userId }), denied);
  await assert.rejects(removeMembership(groupId, suspended.userId, suspended.id), denied);
  assert.deepEqual(writes, []);
});

void test('active administrators can explicitly reinstate a suspended membership', async (t) => {
  const suspended = member('suspended', Role.member, MembershipStatus.suspended);
  const { writes } = database(t, [suspended, member('admin', Role.admin)]);
  await updateMembership(groupId, 'admin', suspended.id, { status: MembershipStatus.active });
  assert.deepEqual(writes, [{ where: { id: suspended.id }, data: { status: MembershipStatus.active } }]);
});

void test('inviting an existing member preserves their approved role and status', async (t) => {
  const existing = member('existing', Role.admin);
  const { writes } = database(t, [existing, member('owner', Role.owner)]);
  assert.deepEqual(await inviteToGroup(groupId, 'owner', { userId: existing.userId }), existing);
  assert.deepEqual(writes, []);
});

void test('a lost invite claim cannot create a membership', async (t) => {
  const { tx, writes } = database(t, []);
  t.mock.method(tx.groupInvite, 'updateMany', () => Promise.resolve({ count: 0 }));
  await assert.rejects(acceptInvite('single-use-token', 'new-member'), denied);
  assert.deepEqual(writes, []);
});

void test('accepting an invite twice as an active member does not consume another use', async (t) => {
  const existing = member('existing');
  const { writes } = database(t, [existing]);
  assert.deepEqual(await acceptInvite('valid-token', existing.userId), existing);
  assert.deepEqual(writes, []);
});

void test('ownership transfer requires the canonical owner and an active target', async (t) => {
  const { writes } = database(t, [
    member('owner', Role.owner),
    member('admin', Role.admin),
    member('suspended', Role.member, MembershipStatus.suspended),
  ]);
  await assert.rejects(transferGroupOwnership(groupId, 'admin', 'owner'), denied);
  await assert.rejects(transferGroupOwnership(groupId, 'owner', 'suspended'), {
    status: 400,
  });
  assert.deepEqual(writes, []);
});
