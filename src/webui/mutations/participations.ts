import { apiFetch } from '@/webui/api/client';
import type { Participation } from '@/webui/api/types';

export async function updateParticipation(
  runId: string,
  status: 'confirmed' | 'declined',
): Promise<Participation> {
  return apiFetch<Participation>(`/api/v1/runs/${runId}/participations`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}
