import { ParticipationStatus, Role, RunStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { createMatches } from '@/server/domain/matching';
import { getLotteryById } from '@/server/db/lotteries';
import {
  cancelRun as cancelRunRecord,
  createRunForLottery,
  getRunById,
  listRecentMatchesForLottery,
  listRunsForLottery,
  markRunMatched,
  replaceRunMatches,
  updateRunStatus,
} from '@/server/db/runs';
import { requireGroupMembership, requireGroupRole } from '@/server/auth/authorization';
import { badRequest, notFound } from '@/server/http/errors';
import type { CreateRunInput } from '@/server/schemas/runs';

function parseMemberIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

async function getRunWithLottery(runId: string) {
  const run = await prisma.lotteryRun.findUnique({
    where: { id: runId },
    include: {
      lottery: true,
      participations: true,
    },
  });

  if (!run) throw notFound('Run not found');
  return run;
}

export async function createRun(lotteryId: string, actorId: string, input: CreateRunInput) {
  const lottery = await getLotteryById(lotteryId);
  if (!lottery) throw notFound('Lottery not found');

  await requireGroupRole(lottery.groupId, actorId, [Role.owner, Role.admin]);

  if (!lottery.isActive) {
    throw badRequest('Cannot create a run for an inactive lottery');
  }

  return createRunForLottery(lotteryId, input);
}

export async function listRuns(lotteryId: string, actorId: string) {
  const lottery = await getLotteryById(lotteryId);
  if (!lottery) throw notFound('Lottery not found');

  await requireGroupMembership(lottery.groupId, actorId);
  return listRunsForLottery(lotteryId);
}

export async function getRun(runId: string, actorId: string) {
  const run = await getRunById(runId);
  if (!run) throw notFound('Run not found');

  await requireGroupMembership(run.lottery.groupId, actorId);
  return run;
}

export async function cancelRun(runId: string, actorId: string) {
  const run = await getRunWithLottery(runId);
  await requireGroupRole(run.lottery.groupId, actorId, [Role.owner, Role.admin]);

  if (run.status === RunStatus.canceled || run.status === RunStatus.matched) {
    throw badRequest('Run cannot be canceled in its current state');
  }

  const canceled = await cancelRunRecord(runId);
  console.info('[runs] canceled', { runId, lotteryId: run.lotteryId, actorId });
  return canceled;
}

export async function executeRun(runId: string, actorId: string) {
  const run = await getRunWithLottery(runId);
  await requireGroupRole(run.lottery.groupId, actorId, [Role.owner, Role.admin]);

  if (run.status === RunStatus.canceled) {
    throw badRequest('Canceled runs cannot be executed');
  }

  if (run.status === RunStatus.matched) {
    return run;
  }

  await updateRunStatus(runId, RunStatus.matching);
  console.info('[runs] matching_started', { runId, lotteryId: run.lotteryId, actorId });

  const confirmedParticipants = run.participations
    .filter((p) => p.status === ParticipationStatus.confirmed)
    .map((p) => p.userId);

  if (confirmedParticipants.length < run.lottery.groupSizeMin) {
    await markRunMatched(runId, new Date());
    console.info('[runs] matching_skipped_insufficient_participants', {
      runId,
      lotteryId: run.lotteryId,
      actorId,
      confirmedCount: confirmedParticipants.length,
    });
    return getRunById(runId);
  }

  const recentMatchesRaw = await listRecentMatchesForLottery(
    run.lotteryId,
    run.lottery.repeatWindowRuns,
  );

  const recentMatches = recentMatchesRaw
    .map((m) => parseMemberIds(m.memberIds))
    .filter((members) => members.length >= 2);

  const matching = createMatches({
    participantIds: confirmedParticipants,
    groupSizeMin: run.lottery.groupSizeMin,
    groupSizeMax: run.lottery.groupSizeMax,
    recentMatches,
    seed: runId,
  });

  await replaceRunMatches(
    runId,
    matching.matches.map((memberIds) => ({
      groupId: run.lottery.groupId,
      memberIds,
      algorithmVersion: matching.algorithmVersion,
    })),
  );

  await markRunMatched(runId, new Date());
  console.info('[runs] matched', {
    runId,
    lotteryId: run.lotteryId,
    actorId,
    matchCount: matching.matches.length,
    unmatchedCount: matching.unmatched.length,
    algorithmVersion: matching.algorithmVersion,
  });
  return getRunById(runId);
}
