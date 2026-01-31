import { apiFetch } from '@/webui/api/client';
import type { Lottery, Run } from '@/webui/api/types';

export type CreateLotteryInput = {
  name: string;
  groupSizeMin?: number;
  groupSizeMax?: number;
  repeatWindowRuns?: number;
  scheduleJson: Record<string, unknown>;
};

export type UpdateLotteryInput = Partial<CreateLotteryInput> & {
  isActive?: boolean;
};

export async function createLottery(
  groupId: string,
  input: CreateLotteryInput,
): Promise<Lottery> {
  return apiFetch<Lottery>(`/api/v1/groups/${groupId}/lotteries`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateLottery(
  lotteryId: string,
  input: UpdateLotteryInput,
): Promise<Lottery> {
  return apiFetch<Lottery>(`/api/v1/lotteries/${lotteryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function createRun(
  lotteryId: string,
  input: {
    enrollmentOpensAt: string;
    enrollmentClosesAt: string;
    matchingExecutesAt: string;
  },
): Promise<Run> {
  return apiFetch<Run>(`/api/v1/lotteries/${lotteryId}/runs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function cancelRun(runId: string): Promise<Run> {
  return apiFetch<Run>(`/api/v1/runs/${runId}/cancel`, { method: 'POST' });
}

export async function executeRun(runId: string): Promise<Run> {
  return apiFetch<Run>(`/api/v1/runs/${runId}/execute`, { method: 'POST' });
}
