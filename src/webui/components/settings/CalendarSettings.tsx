'use client';

import type { ApiError } from '@/webui/api/client';
import type { CalendarConnection } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Notice } from '@/webui/components/ui/Notice';
import {
  createCalendarConnection,
  deleteCalendarConnection,
  startGoogleCalendarConnection,
} from '@/webui/mutations/calendar';
import { fetchCalendarConnections } from '@/webui/queries/calendar';
import { useEffect, useState } from 'react';

const providers: Array<{ id: CalendarConnection['provider']; label: string }> =
  [
    { id: 'google', label: 'Google Calendar' },
    { id: 'outlook', label: 'Outlook' },
    { id: 'apple', label: 'Apple Calendar' },
    { id: 'ics', label: 'ICS Feed' },
  ];

export function CalendarSettings() {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadConnections = async () => {
    setStatus('loading');
    try {
      const data = await fetchCalendarConnections();
      setConnections(data);
      setError(null);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to load connections.');
      setStatus('error');
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchCalendarConnections()
      .then((data) => {
        if (cancelled) return;
        setConnections(data);
        setError(null);
        setStatus('idle');
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load connections.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async (provider: CalendarConnection['provider']) => {
    try {
      if (provider === 'google') {
        const returnTo = window.location.pathname;
        const { url } = await startGoogleCalendarConnection(returnTo);
        window.location.assign(url);
        return;
      }
      await createCalendarConnection(provider);
      await loadConnections();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to connect calendar.');
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await deleteCalendarConnection(id);
      await loadConnections();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to remove connection.');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarStatus = params.get('calendar');
    if (calendarStatus === 'connected') {
      setNotice('Google Calendar connected.');
    } else if (calendarStatus === 'error') {
      setNotice('Google Calendar connection failed.');
    }
  }, []);

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">
          Calendar
        </p>
        <h2 className="text-2xl font-semibold">Calendar integrations</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Connect calendars to publish match invites automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => {
          const connection = connections.find(
            (item) => item.provider === provider.id,
          );
          return (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold">{provider.label}</p>
                <p className="text-xs text-[rgba(20,18,21,0.6)]">
                  {connection
                    ? `Connected · ${connection.status}`
                    : 'Not connected'}
                </p>
              </div>
              {connection ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnect(connection.id)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleConnect(provider.id)}
                >
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {status === 'loading' ? (
        <Notice>Loading calendar connections...</Notice>
      ) : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </div>
  );
}
