import { randomUUID } from 'node:crypto';
import { MembershipStatus, Prisma, Role } from '@/generated/prisma/client';
import { LUNCH_NOTICE_MINUTES } from '@/lib/lunchNotice';
import { prisma } from '@/lib/prisma';
import { requireGroupMembership, requireGroupRole } from '@/lib/server/auth/authorization';
import { lockGroupForUpdate } from '@/lib/server/db/group-lock';
import { scheduleLunches, SchedulingCapacityError } from '@/lib/server/domain/matching/availability';
import { MAX_AVAILABILITY_SLOTS, MAX_EXISTING_BOOKINGS } from '@/lib/server/domain/matching/limits';
import { badRequest } from '@/lib/server/http/errors';
import { executeLotterySchema, type ExecuteLotteryInput } from '@/lib/server/schemas/lottery';

function memberIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export async function getParticipation(groupId: string, userId: string) {
  await requireGroupMembership(groupId, userId);
  return prisma.membership.findUniqueOrThrow({
    where: { userId_groupId: { userId, groupId } },
    select: { participating: true },
  });
}

export async function setParticipation(groupId: string, userId: string, participating: boolean) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForUpdate(tx, groupId);
    const membership = await requireGroupMembership(groupId, userId, undefined, tx);
    return tx.membership.update({
      where: { id: membership.id },
      data: { participating },
      select: { participating: true },
    });
  });
}

export async function listLunchRuns(groupId: string, userId: string) {
  await requireGroupMembership(groupId, userId);
  const runs = await prisma.lunchRun.findMany({
    where: { groupId },
    include: {
      matches: {
        orderBy: { scheduledFor: 'asc' },
        include: { calendarArtifacts: { where: { userId }, select: { id: true, type: true, payload: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  for (const run of runs) {
    for (const match of run.matches) {
      match.calendarArtifacts = match.calendarArtifacts.map((artifact) => {
        const payload = artifact.payload;
        const eventLink =
          payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.eventLink === 'string'
            ? payload.eventLink
            : undefined;
        return { id: artifact.id, type: artifact.type, payload: eventLink ? { eventLink } : {} };
      });
    }
  }
  return runs;
}

export async function executeLottery(groupId: string, userId: string, input: ExecuteLotteryInput) {
  const parsed = executeLotterySchema.parse(input);
  const windowStart = new Date(parsed.windowStart);
  const windowEnd = new Date(parsed.windowEnd);
  if (windowStart.getTime() < Date.now()) throw badRequest('Lottery window must start in the future');

  return prisma.$transaction(
    async (tx) => {
      const group = await lockGroupForUpdate(tx, groupId);
      await requireGroupRole(groupId, userId, [Role.owner, Role.admin], tx);
      const memberships = await tx.membership.findMany({
        where: { groupId, status: MembershipStatus.active, participating: true },
        orderBy: { userId: 'asc' },
      });
      if (memberships.length < 2)
        throw badRequest('At least two active members must opt in before running the lottery');
      if (memberships.length > 500) throw badRequest('A lottery supports up to 500 participating members');
      const participantIds = memberships.map((membership) => membership.userId);

      // Participant locks serialize runs in different groups sharing the same people.
      // This prevents concurrent runs from booking a person twice at the same time.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(participantIds)}) ORDER BY "id" FOR UPDATE`;
      // Read profiles after acquiring the locks: a concurrent timezone update may
      // have committed while this draw waited, and must apply to its fresh slots.
      const participants = await tx.user.findMany({
        where: { id: { in: participantIds } },
        select: { id: true, timezone: true, shortNoticePreference: true },
        orderBy: { id: 'asc' },
      });

      const slots = await tx.availabilitySlot.findMany({
        where: { userId: { in: participantIds }, OR: [{ groupId }, { groupId: null }] },
        take: participantIds.length * MAX_AVAILABILITY_SLOTS + 1,
      });
      const slotsByUser = new Map<string, typeof slots>();
      for (const slot of slots) {
        const userSlots = slotsByUser.get(slot.userId) ?? [];
        userSlots.push(slot);
        slotsByUser.set(slot.userId, userSlots);
      }
      const previousMatches = await tx.match.findMany({
        where: { groupId, status: { not: 'canceled' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { memberIds: true },
      });
      const existingMatches = await tx.match.findMany({
        where: {
          state: 'scheduled',
          status: { not: 'canceled' },
          scheduledFor: { lt: windowEnd },
          OR: [
            { scheduledUntil: { gt: windowStart } },
            { scheduledUntil: null, scheduledFor: { gt: new Date(windowStart.getTime() - 60 * 60 * 1000) } },
          ],
          AND: [{ OR: participantIds.map((id) => ({ memberIds: { array_contains: [id] } })) }],
        },
        select: { memberIds: true, scheduledFor: true, scheduledUntil: true },
        take: MAX_EXISTING_BOOKINGS + 1,
      });
      const lunchRunId = randomUUID();
      // Notice starts when the locked, current profiles are used for this draw.
      const drawnAt = new Date();
      let drawn: ReturnType<typeof scheduleLunches>;
      try {
        drawn = scheduleLunches({
          participants: participants.map((participant) => ({
            id: participant.id,
            timezone: participant.timezone,
            notBefore: new Date(
              drawnAt.getTime() + LUNCH_NOTICE_MINUTES[participant.shortNoticePreference ?? 'standard'] * 60 * 1000,
            ),
            slots: slotsByUser.get(participant.id) ?? [],
          })),
          windowStart,
          windowEnd,
          durationMinutes: parsed.durationMinutes,
          maxGroupSize: group.defaultGroupSize,
          recentMatches: previousMatches.map((match) => memberIds(match.memberIds)),
          existingBookings: existingMatches.flatMap((match) =>
            match.scheduledFor
              ? [
                  {
                    memberIds: memberIds(match.memberIds),
                    start: match.scheduledFor,
                    end: match.scheduledUntil ?? new Date(match.scheduledFor.getTime() + 60 * 60 * 1000),
                  },
                ]
              : [],
          ),
          seed: lunchRunId,
        });
      } catch (error) {
        if (error instanceof SchedulingCapacityError) throw badRequest(error.message);
        throw error;
      }
      // Lock waits and scheduling can outlast a short future window. Recheck at
      // the persistence boundary so queued draws cannot create lunches in the past.
      if (windowStart.getTime() < Date.now()) throw badRequest('Lottery window must start in the future');
      return tx.lunchRun.create({
        data: {
          id: lunchRunId,
          groupId,
          executedById: userId,
          windowStart,
          windowEnd,
          durationMinutes: parsed.durationMinutes,
          participantIds,
          unmatchedUserIds: drawn.unmatchedUserIds,
          algorithmVersion: drawn.algorithmVersion,
          createdAt: drawnAt,
          matches: {
            create: drawn.matches.map((match) => ({
              memberIds: match.memberIds,
              scheduledFor: match.scheduledFor,
              scheduledUntil: match.scheduledUntil,
              groupId,
              algorithmVersion: drawn.algorithmVersion,
              state: 'scheduled',
              status: 'confirmed',
              event: { create: { venue: group.location, status: 'confirmed' } },
            })),
          },
        },
        include: { matches: { orderBy: { scheduledFor: 'asc' } } },
      });
    },
    { timeout: 20_000 },
  );
}
