import {
  requireGroupMembership,
  requireGroupRole,
} from '@/server/auth/authorization';
import {
  createLotteryForGroup,
  deleteLotteryById,
  getLotteryById,
  listLotteriesForGroup,
  updateLotteryById,
} from '@/server/db/lotteries';
import { badRequest, notFound } from '@/server/http/errors';
import type {
  CreateLotteryInput,
  UpdateLotteryInput,
} from '@/server/schemas/lotteries';
import { Role } from '@prisma/client';

function assertScheduleJson(scheduleJson: CreateLotteryInput['scheduleJson']) {
  // We keep scheduleJson intentionally flexible, but require a non-empty object.
  if (!scheduleJson || Object.keys(scheduleJson).length === 0) {
    throw badRequest('scheduleJson must be a non-empty object');
  }
}

export async function createLottery(
  groupId: string,
  actorId: string,
  input: CreateLotteryInput,
) {
  await requireGroupRole(groupId, actorId, [Role.owner, Role.admin]);
  assertScheduleJson(input.scheduleJson);
  return createLotteryForGroup(groupId, input);
}

export async function listLotteries(groupId: string, actorId: string) {
  await requireGroupMembership(groupId, actorId);
  return listLotteriesForGroup(groupId);
}

export async function getLottery(lotteryId: string, actorId: string) {
  const lottery = await getLotteryById(lotteryId);
  if (!lottery) throw notFound('Lottery not found');

  await requireGroupMembership(lottery.groupId, actorId);
  return lottery;
}

export async function updateLottery(
  lotteryId: string,
  actorId: string,
  input: UpdateLotteryInput,
) {
  const lottery = await getLotteryById(lotteryId);
  if (!lottery) throw notFound('Lottery not found');

  await requireGroupRole(lottery.groupId, actorId, [Role.owner, Role.admin]);

  if (input.scheduleJson) assertScheduleJson(input.scheduleJson);
  return updateLotteryById(lotteryId, input);
}

export async function deleteLottery(lotteryId: string, actorId: string) {
  const lottery = await getLotteryById(lotteryId);
  if (!lottery) throw notFound('Lottery not found');

  await requireGroupRole(lottery.groupId, actorId, [Role.owner, Role.admin]);
  await deleteLotteryById(lotteryId);
  return { id: lotteryId, deleted: true as const };
}
