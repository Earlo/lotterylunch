'use client';

import type { ApiError } from '@/webui/api/client';
import type { Lottery, Run } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Card } from '@/webui/components/ui/Card';
import { Notice } from '@/webui/components/ui/Notice';
import { cancelRun, createRun, executeRun } from '@/webui/mutations/lotteries';
import { fetchLottery, fetchRuns } from '@/webui/queries/lotteries';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { useState } from 'react';

export function LotteryDetailClient({ lotteryId }: { lotteryId: string }) {
  const [lottery, setLottery] = useState<Lottery | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [executesAt, setExecutesAt] = useState('');

  const loadAll = async (opts?: { isCancelled?: () => boolean }) => {
    const isCancelled = opts?.isCancelled ?? (() => false);
    try {
      const [lotteryData, runsData] = await Promise.all([
        fetchLottery(lotteryId),
        fetchRuns(lotteryId),
      ]);
      if (isCancelled()) return;
      setLottery(lotteryData);
      setRuns(runsData);
      setError(null);
    } catch (err) {
      if (isCancelled()) return;
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to load lottery data.');
    }
  };

  useCancelableEffect((isCancelled) => {
    loadAll({ isCancelled });
  }, [lotteryId]);

  const handleCreateRun = async () => {
    if (!opensAt || !closesAt || !executesAt) return;
    try {
      await createRun(lotteryId, {
        enrollmentOpensAt: new Date(opensAt).toISOString(),
        enrollmentClosesAt: new Date(closesAt).toISOString(),
        matchingExecutesAt: new Date(executesAt).toISOString(),
      });
      setOpensAt('');
      setClosesAt('');
      setExecutesAt('');
      await loadAll();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to create run.');
    }
  };

  const handleExecute = async (runId: string) => {
    try {
      await executeRun(runId);
      await loadAll();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to execute run.');
    }
  };

  const handleCancel = async (runId: string) => {
    try {
      await cancelRun(runId);
      await loadAll();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to cancel run.');
    }
  };

  return (
    <div className="grid gap-6">
      {error ? <Notice>{error}</Notice> : null}

      <Card title="Lottery details">
        <div className="text-sm text-[rgba(20,18,21,0.7)]">
          <p className="font-semibold text-(--ink)">{lottery?.name}</p>
          <p>Active: {lottery?.isActive ? 'Yes' : 'No'}</p>
          <p>
            Group size: {lottery?.groupSizeMin}–{lottery?.groupSizeMax}
          </p>
          <p>Repeat window: {lottery?.repeatWindowRuns}</p>
        </div>
      </Card>

      <Card title="Schedule a run">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-[rgba(20,18,21,0.7)]">
            Opens
            <input
              className="mt-2 w-full rounded-md border border-[rgba(20,18,21,0.2)] bg-white/80 px-3 py-2 text-xs"
              type="datetime-local"
              value={opensAt}
              onChange={(event) => setOpensAt(event.target.value)}
            />
          </label>
          <label className="text-xs text-[rgba(20,18,21,0.7)]">
            Closes
            <input
              className="mt-2 w-full rounded-md border border-[rgba(20,18,21,0.2)] bg-white/80 px-3 py-2 text-xs"
              type="datetime-local"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </label>
          <label className="text-xs text-[rgba(20,18,21,0.7)]">
            Matches
            <input
              className="mt-2 w-full rounded-md border border-[rgba(20,18,21,0.2)] bg-white/80 px-3 py-2 text-xs"
              type="datetime-local"
              value={executesAt}
              onChange={(event) => setExecutesAt(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3">
          <Button variant="accent" size="sm" onClick={handleCreateRun}>
            Create run
          </Button>
        </div>
      </Card>

      <Card title="Runs">
        <div className="grid gap-3">
          {runs.length === 0 ? (
            <p className="text-sm text-[rgba(20,18,21,0.6)]">No runs yet.</p>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{run.status}</p>
                  <p className="text-xs text-[rgba(20,18,21,0.6)]">
                    Execute at{' '}
                    {new Date(run.matchingExecutesAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExecute(run.id)}
                  >
                    Execute
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancel(run.id)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    as="a"
                    href={`/portal/runs/${run.id}`}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
