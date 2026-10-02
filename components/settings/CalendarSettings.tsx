'use client';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { getErrorMessage } from '@/lib/webui/api/client';
import type { CalendarConnection } from '@/lib/webui/api/types';
import { createCancelableEffect } from '@/lib/webui/cancelableEffect';
import { deleteCalendarConnection, startGoogleCalendarConnection } from '@/lib/webui/mutations/calendar';
import { fetchCalendarConnections } from '@/lib/webui/queries/calendar';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const providers: Array<{ id: CalendarConnection['provider']; label: string }> = [
  { id: 'google', label: 'Google Calendar' },
];

export function CalendarSettings() {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();
  const calendarStatus = searchParams.get('calendar');
  const notice =
    calendarStatus === 'connected'
      ? 'Google Calendar connected.'
      : calendarStatus === 'error'
        ? 'Google Calendar connection failed.'
        : null;

  const loadConnections = useCallback(async (opts?: { isCancelled?: () => boolean; signal?: AbortSignal }) => {
    const isCancelled = opts?.isCancelled ?? (() => false);
    try {
      const data = await fetchCalendarConnections(opts?.signal);
      if (isCancelled()) return;
      setConnections(data);
      setError(null);
      setStatus('idle');
    } catch (err) {
      if (isCancelled()) return;
      setError(getErrorMessage(err, 'Unable to load connections.'));
      setStatus('error');
    }
  }, []);

  useEffect(
    () =>
      createCancelableEffect((isCancelled, signal) => {
        void loadConnections({ isCancelled, signal });
      }),
    [loadConnections],
  );

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const returnTo = window.location.pathname;
      const { url } = await startGoogleCalendarConnection(returnTo);
      window.location.assign(url);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to connect calendar.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteCalendarConnection(id);
      setStatus('loading');
      await loadConnections();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to remove connection.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">Calendar</p>
        <h2 className="text-2xl font-semibold">Calendar integrations</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Connect Google Calendar to add your matches to your calendar. You can also download an ICS file from a match
          without connecting a calendar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => {
          const connection = connections.find((item) => item.provider === provider.id);
          return (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold">{provider.label}</p>
                <p className="text-xs text-[rgba(20,18,21,0.6)]">
                  {connection ? `Connected · ${connection.status}` : 'Not connected'}
                </p>
              </div>
              {connection ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || status !== 'idle'}
                  aria-label={`Disconnect ${provider.label}`}
                  onClick={() => {
                    void handleDisconnect(connection.id);
                  }}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || status !== 'idle'}
                  aria-label={`Connect ${provider.label}`}
                  onClick={() => {
                    void handleConnect();
                  }}
                >
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {status === 'loading' ? <Notice>Loading calendar connections...</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Notice role="alert">{error}</Notice> : null}
      {status === 'error' ? (
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setStatus('loading');
              void loadConnections();
            }}
          >
            Retry loading connections
          </Button>
        </div>
      ) : null}
    </div>
  );
}
