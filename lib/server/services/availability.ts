import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { forbidden } from '@/lib/server/http/errors';
import { upsertAvailabilitySchema, type AvailabilitySlotInput } from '@/lib/server/schemas/availability';

export async function listAvailability(userId: string, groupId?: string) {
  return prisma.availabilitySlot.findMany({
    where: {
      userId,
      ...(groupId ? { groupId } : {}),
    },
    orderBy: { startAt: 'asc' },
  });
}

export async function upsertAvailability(userId: string, slots: AvailabilitySlotInput[]) {
  const input = upsertAvailabilitySchema.parse(slots);
  const groupIds = [...new Set(input.flatMap((slot) => (slot.groupId ? [slot.groupId] : [])))];
  return prisma.$transaction(async (tx) => {
    // Match lottery lock ordering: groups first, then users. Otherwise an insert's
    // foreign-key check can deadlock with a draw holding the group row lock.
    if (groupIds.length) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Group"
        WHERE "id" IN (${Prisma.join(groupIds.map((groupId) => Prisma.sql`${groupId}::uuid`))})
        ORDER BY "id" FOR UPDATE
      `);
    }
    // Serialize replacements for one user so concurrent saves cannot mix slots.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (groupIds.length) {
      const memberships = await tx.membership.count({
        where: { userId, groupId: { in: groupIds }, status: 'active' },
      });
      if (memberships !== groupIds.length)
        throw forbidden('Active group membership is required for grouped availability');
    }
    await tx.availabilitySlot.deleteMany({ where: { userId } });
    if (!input.length) return { count: 0 };
    return tx.availabilitySlot.createMany({
      data: input.map((slot) => ({
        userId,
        groupId: slot.groupId ?? null,
        startAt: new Date(slot.startAt),
        endAt: new Date(slot.endAt),
        recurringRule: slot.recurringRule ?? null,
        type: slot.type,
      })),
    });
  });
}
