'use client';

import { authClient } from '@/lib/auth-client';
import type { ApiError } from '@/webui/api/client';
import type { Match, Participation, Run } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Card } from '@/webui/components/ui/Card';
import { Notice } from '@/webui/components/ui/Notice';
import { createCalendarArtifact } from '@/webui/mutations/calendar';
import { updateParticipation } from '@/webui/mutations/participations';
import { fetchRun } from '@/webui/queries/lotteries';
import { useEffect, useMemo, useState } from 'react';

export function RunDetailClient({ runId }: { runId: string }) {
  const { data: session } = authClient.useSession();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRun = async () => {
    try {
      const data = await fetchRun(runId);
      setRun(data);
      setError(null);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to load run.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchRun(runId)
      .then((data) => {
        if (cancelled) return;
        setRun(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load run.');
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const myParticipation = useMemo(() => {
    const userId = session?.user?.id;
    if (!userId || !run?.participations) return null;
    return run.participations.find((item) => item.userId === userId) ?? null;
  }, [run, session?.user?.id]);

  const handleParticipation = async (status: Participation['status']) => {
    try {
      await updateParticipation(
        runId,
        status === 'confirmed' ? 'confirmed' : 'declined',
      );
      await loadRun();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to update participation.');
    }
  };

  const handleArtifact = async (match: Match) => {
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      await createCalendarArtifact(match.id, {
        title: 'Lottery Lunch',
        startsAt: now.toISOString(),
        endsAt: end.toISOString(),
      });
      await loadRun();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to create calendar artifact.');
    }
  };

  return (
    <div className="grid gap-6">
      {error ? <Notice>{error}</Notice> : null}

      <Card title="Run status">
        <p className="text-sm text-[rgba(20,18,21,0.7)]">
          Status: <strong>{run?.status ?? 'unknown'}</strong>
        </p>
      </Card>

      <Card title="Your participation">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Status: {myParticipation?.status ?? 'not set'}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleParticipation('confirmed')}
          >
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleParticipation('declined')}
          >
            Decline
          </Button>
        </div>
      </Card>

      <Card title="Matches">
        <div className="grid gap-3">
          {(run?.matches ?? []).length === 0 ? (
            <p className="text-sm text-[rgba(20,18,21,0.6)]">No matches yet.</p>
          ) : (
            (run?.matches ?? []).map((match) => (
              <div
                key={match.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">Match {match.id}</p>
                  <p className="text-xs text-[rgba(20,18,21,0.6)]">
                    Members: {(match.memberIds ?? []).join(', ') || 'TBD'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleArtifact(match)}
                >
                  Create ICS
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
