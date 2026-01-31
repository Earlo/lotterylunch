import { prisma } from '@/lib/prisma';
import type {
  CreateLotteryInput,
  UpdateLotteryInput,
} from '@/server/schemas/lotteries';
import type { Prisma } from '@prisma/client';

export function createLotteryForGroup(
  groupId: string,
  input: CreateLotteryInput,
) {
  return prisma.lottery.create({
    data: {
      groupId,
      name: input.name,
      isActive: input.isActive ?? true,
      groupSizeMin: input.groupSizeMin ?? 2,
      groupSizeMax: input.groupSizeMax ?? 3,
      repeatWindowRuns: input.repeatWindowRuns ?? 3,
      scheduleJson: input.scheduleJson as Prisma.InputJsonValue,
    },
  });
}

export function listLotteriesForGroup(groupId: string) {
  return prisma.lottery.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
  });
}

export function getLotteryById(lotteryId: string) {
  return prisma.lottery.findUnique({
    where: { id: lotteryId },
  });
}

export function updateLotteryById(
  lotteryId: string,
  input: UpdateLotteryInput,
) {
  return prisma.lottery.update({
    where: { id: lotteryId },
    data: {
      name: input.name,
      isActive: input.isActive,
      groupSizeMin: input.groupSizeMin,
      groupSizeMax: input.groupSizeMax,
      repeatWindowRuns: input.repeatWindowRuns,
      scheduleJson: input.scheduleJson as Prisma.InputJsonValue | undefined,
    },
  });
}

export function deleteLotteryById(lotteryId: string) {
  return prisma.lottery.delete({
    where: { id: lotteryId },
  });
}
