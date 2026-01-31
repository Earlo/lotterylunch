import { apiFetch } from '@/webui/api/client';
import type { Lottery, Run } from '@/webui/api/types';

export async function fetchGroupLotteries(groupId: string): Promise<Lottery[]> {
  return apiFetch<Lottery[]>(`/api/v1/groups/${groupId}/lotteries`);
}

export async function fetchLottery(lotteryId: string): Promise<Lottery> {
  return apiFetch<Lottery>(`/api/v1/lotteries/${lotteryId}`);
}

export async function fetchRuns(lotteryId: string): Promise<Run[]> {
  return apiFetch<Run[]>(`/api/v1/lotteries/${lotteryId}/runs`);
}

export async function fetchRun(runId: string): Promise<Run> {
  return apiFetch<Run>(`/api/v1/runs/${runId}`);
}
