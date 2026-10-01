import { prisma } from '@/lib/prisma';
import type { AvailabilitySlotInput } from '@/lib/server/schemas/availability';

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
  const groupIds = new Set(slots.map((slot) => slot.groupId).filter((groupId): groupId is string => Boolean(groupId)));
  const includesUngrouped = slots.some((slot) => !slot.groupId);

  if (groupIds.size > 0) {
    await prisma.availabilitySlot.deleteMany({
      where: { userId, groupId: { in: Array.from(groupIds) } },
    });
  }

  if (includesUngrouped) {
    await prisma.availabilitySlot.deleteMany({
      where: { userId, groupId: null },
    });
  }

  return prisma.availabilitySlot.createMany({
    data: slots.map((slot) => ({
      userId,
      groupId: slot.groupId ?? null,
      startAt: new Date(slot.startAt),
      endAt: new Date(slot.endAt),
      recurringRule: slot.recurringRule ?? null,
      type: slot.type,
    })),
  });
}
