import { ParticipationStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireGroupMembership, requireGroupRole } from '@/server/auth/authorization';
import { badRequest, notFound } from '@/server/http/errors';
import type { UpsertParticipationInput } from '@/server/schemas/participations';

async function getRunWithLottery(runId: string) {
  const run = await prisma.lotteryRun.findUnique({
    where: { id: runId },
    include: { lottery: true },
  });

  if (!run) throw notFound('Run not found');
  return run;
}

export async function upsertMyParticipation(
  runId: string,
  userId: string,
  input: UpsertParticipationInput,
) {
  const run = await getRunWithLottery(runId);

  await requireGroupMembership(run.lottery.groupId, userId);

  const now = new Date();
  if (now < run.enrollmentOpensAt || now > run.enrollmentClosesAt) {
    throw badRequest('Enrollment window is closed for this run');
  }

  return prisma.participation.upsert({
    where: {
      runId_userId: {
        runId,
        userId,
      },
    },
    update: {
      status: input.status,
      respondedAt: now,
    },
    create: {
      runId,
      userId,
      status: input.status,
      respondedAt: now,
    },
  });
}

export async function listParticipations(runId: string, actorId: string) {
  const run = await getRunWithLottery(runId);
  await requireGroupMembership(run.lottery.groupId, actorId);

  return prisma.participation.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function adminUpsertParticipation(
  runId: string,
  actorId: string,
  targetUserId: string,
  status: ParticipationStatus,
) {
  const run = await getRunWithLottery(runId);
  await requireGroupRole(run.lottery.groupId, actorId, [Role.owner, Role.admin]);

  const now = new Date();

  return prisma.participation.upsert({
    where: {
      runId_userId: {
        runId,
        userId: targetUserId,
      },
    },
    update: {
      status,
      respondedAt: now,
    },
    create: {
      runId,
      userId: targetUserId,
      status,
      respondedAt: now,
    },
  });
}
