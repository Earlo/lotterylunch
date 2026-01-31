import { prisma } from '@/lib/prisma';
import type { CreateRunInput } from '@/server/schemas/runs';
import { RunStatus } from '@prisma/client';

export function createRunForLottery(lotteryId: string, input: CreateRunInput) {
  return prisma.lotteryRun.create({
    data: {
      lotteryId,
      status: RunStatus.scheduled,
      enrollmentOpensAt: input.enrollmentOpensAt,
      enrollmentClosesAt: input.enrollmentClosesAt,
      matchingExecutesAt: input.matchingExecutesAt,
    },
  });
}

export function listRunsForLottery(lotteryId: string) {
  return prisma.lotteryRun.findMany({
    where: { lotteryId },
    orderBy: { matchingExecutesAt: 'desc' },
  });
}

export function getRunById(runId: string) {
  return prisma.lotteryRun.findUnique({
    where: { id: runId },
    include: {
      lottery: true,
      participations: true,
      matches: true,
    },
  });
}

export function updateRunStatus(runId: string, status: RunStatus) {
  return prisma.lotteryRun.update({
    where: { id: runId },
    data: { status },
  });
}

export function markRunMatched(runId: string, matchedAt: Date) {
  return prisma.lotteryRun.update({
    where: { id: runId },
    data: {
      status: RunStatus.matched,
      matchedAt,
    },
  });
}

export function cancelRun(runId: string) {
  return prisma.lotteryRun.update({
    where: { id: runId },
    data: {
      status: RunStatus.canceled,
    },
  });
}

export function listRecentMatchesForLottery(
  lotteryId: string,
  limitRuns: number,
) {
  return prisma.match.findMany({
    where: {
      run: {
        lotteryId,
        status: RunStatus.matched,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.max(limitRuns * 20, 40),
    select: {
      memberIds: true,
      runId: true,
      createdAt: true,
    },
  });
}

export function replaceRunMatches(
  runId: string,
  matches: Array<{
    groupId: string;
    memberIds: string[];
    algorithmVersion: string;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { runId } });

    if (matches.length === 0) return [];

    const created = await Promise.all(
      matches.map((match) =>
        tx.match.create({
          data: {
            runId,
            groupId: match.groupId,
            memberIds: match.memberIds,
            algorithmVersion: match.algorithmVersion,
          },
        }),
      ),
    );

    return created;
  });
}
