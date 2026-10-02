'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Notice } from '@/components/ui/Notice';
import { getErrorMessage } from '@/lib/webui/api/client';
import type { GroupDetail, Membership } from '@/lib/webui/api/types';
import { createCancelableEffect } from '@/lib/webui/cancelableEffect';
import {
  executeLunchLottery,
  fetchLunchRuns,
  setLunchParticipation,
  type LunchMatch,
  type LunchRun,
} from '@/lib/webui/lottery';
import { createCalendarArtifact } from '@/lib/webui/mutations/calendar';
import { fetchCalendarConnections } from '@/lib/webui/queries/calendar';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';

function localInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const artifactSchema = z.object({ id: z.string(), payload: z.object({ eventLink: z.string().url().optional() }) });

export function LunchLotteryPanel({
  group,
  memberships,
  myMembership,
  isAdmin,
  onMembershipChange,
}: {
  group: GroupDetail;
  memberships: Membership[];
  myMembership: Membership;
  isAdmin: boolean;
  onMembershipChange: () => Promise<void>;
}) {
  const [runs, setRuns] = useState<LunchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [browserTimezone, setBrowserTimezone] = useState('your local timezone');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarLinks, setCalendarLinks] = useState<Record<string, { url: string; label: string }>>({});
  const participantCount = memberships.filter((member) => member.status === 'active' && member.participating).length;
  const memberName = (id: string) => {
    const membership = memberships.find((member) => member.userId === id);
    return membership?.user?.name || membership?.user?.email || 'Former member';
  };
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: group.timezone,
    }).format(new Date(value));

  const loadRuns = useCallback(
    async (opts?: { signal?: AbortSignal; isCancelled?: () => boolean }) => {
      try {
        const [data, connections] = await Promise.all([
          fetchLunchRuns(group.id, opts?.signal),
          fetchCalendarConnections(opts?.signal),
        ]);
        if (opts?.isCancelled?.()) return;
        const start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        setWindowStart((current) => current || localInputValue(start));
        setWindowEnd((current) => current || localInputValue(end));
        setBrowserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        setRuns(data);
        setGoogleConnected(
          connections.some((connection) => connection.provider === 'google' && connection.status === 'connected'),
        );
        setError(null);
      } catch (err) {
        if (!opts?.isCancelled?.()) setError(getErrorMessage(err, 'Unable to load lunch results.'));
      } finally {
        if (!opts?.isCancelled?.()) setLoading(false);
      }
    },
    [group.id],
  );

  useEffect(() => {
    return createCancelableEffect((isCancelled, signal) => {
      void loadRuns({ isCancelled, signal });
    });
  }, [loadRuns]);

  const toggleParticipation = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await setLunchParticipation(group.id, !myMembership.participating);
      await onMembershipChange();
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update participation.'));
    } finally {
      setBusy(false);
    }
  };

  const runLottery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const run = await executeLunchLottery(group.id, {
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        durationMinutes,
      });
      setRuns((current) => [run, ...current].slice(0, 20));
      setError(null);
      setMessage(
        `Lottery saved: ${run.matches.length} lunch${run.matches.length === 1 ? '' : 'es'}, ${run.unmatchedUserIds.length} unmatched member${run.unmatchedUserIds.length === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to run the lunch lottery.'));
    } finally {
      setBusy(false);
    }
  };

  const addCalendar = async (match: LunchMatch, provider: 'google' | 'ics') => {
    setBusy(true);
    setMessage(null);
    try {
      const artifact = artifactSchema.parse(
        await createCalendarArtifact(match.id, {
          provider,
          title: `${group.name}: lunch`,
          startsAt: match.scheduledFor,
          endsAt: match.scheduledUntil,
          timezone: group.timezone,
          ...(group.location ? { location: group.location } : {}),
          notes: `Lunch with ${match.memberIds.map(memberName).join(', ')}`.slice(0, 500),
        }),
      );
      const url =
        provider === 'ics'
          ? `/api/v1/calendar-artifacts/${encodeURIComponent(artifact.id)}.ics`
          : artifact.payload.eventLink;
      if (url)
        setCalendarLinks((current) => ({
          ...current,
          [`${match.id}:${provider}`]: {
            url,
            label: provider === 'ics' ? 'Download calendar file' : 'Open Google event',
          },
        }));
      setError(null);
      setMessage(provider === 'ics' ? 'Your calendar file is ready below.' : 'Lunch added to your Google calendar.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create calendar event.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Lunch lottery">
      <div className="grid gap-5">
        {error ? <Notice role="alert">{error}</Notice> : null}
        {message ? <Notice>{message}</Notice> : null}
        <div className="grid gap-3 text-sm">
          <p>
            {myMembership.participating
              ? 'You are participating in future lunch draws.'
              : 'Join the lottery to be included in future lunch draws.'}{' '}
            {participantCount} active members have opted in.
          </p>
          <p>
            Add lunch availability in{' '}
            <Link href="/portal/settings" className="underline">
              preferred times
            </Link>
            . Weekly times use your profile timezone, and day overrides skip the selected weekly slot. An owner or admin
            runs each draw.
          </p>
          <div>
            <Button
              variant="ghost"
              disabled={busy || loading}
              onClick={() => {
                void toggleParticipation();
              }}
            >
              {myMembership.participating ? 'Pause participation' : 'Join lottery'}
            </Button>
          </div>
        </div>
        {isAdmin ? (
          <form
            onSubmit={(event) => {
              void runLottery(event);
            }}
            className="grid gap-3 border-t border-[rgba(20,18,21,0.12)] pt-4"
          >
            <p className="text-sm">
              Draw lunches in a future window of up to 31 days. Each member gets at most one lunch per draw; existing
              calendar bookings from this app are respected. Lunches contain 2–{group.defaultGroupSize} members. Recent
              pairings are avoided when possible.
            </p>
            <p className="text-xs text-[rgba(20,18,21,0.7)]">
              Enter dates in {browserTimezone}. Results are shown in {group.timezone}.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label htmlFor="lottery-window-start" className="grid gap-1 text-sm">
                Window starts
                <Input
                  id="lottery-window-start"
                  type="datetime-local"
                  required
                  value={windowStart}
                  onChange={(event) => setWindowStart(event.target.value)}
                />
              </label>
              <label htmlFor="lottery-window-end" className="grid gap-1 text-sm">
                Window ends
                <Input
                  id="lottery-window-end"
                  type="datetime-local"
                  required
                  value={windowEnd}
                  onChange={(event) => setWindowEnd(event.target.value)}
                />
              </label>
              <label htmlFor="lottery-duration" className="grid gap-1 text-sm">
                Lunch duration (minutes)
                <Input
                  id="lottery-duration"
                  type="number"
                  min={15}
                  max={180}
                  required
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value))}
                />
              </label>
            </div>
            <div>
              <Button type="submit" disabled={busy || loading || participantCount < 2}>
                Run lunch lottery
              </Button>
            </div>
            {participantCount < 2 ? (
              <p className="text-xs">At least two active members must join the lottery first.</p>
            ) : null}
          </form>
        ) : null}
        <div className="grid gap-4 border-t border-[rgba(20,18,21,0.12)] pt-4">
          <h3 className="text-sm font-semibold">Recent results</h3>
          {loading ? (
            <Notice>Loading lunch results...</Notice>
          ) : runs.length === 0 ? (
            <p className="text-sm">No draws yet.</p>
          ) : null}
          {runs.map((run) => (
            <div key={run.id} className="grid gap-3 rounded-md border border-[rgba(20,18,21,0.12)] p-4">
              <p className="text-xs">
                Draw for {formatTime(run.windowStart)} – {formatTime(run.windowEnd)} ({group.timezone})
              </p>
              {run.matches.length === 0 ? <p className="text-sm">No shared lunch availability was found.</p> : null}
              {run.matches.map((match) => (
                <div key={match.id} className="grid gap-2 text-sm">
                  <p className="font-semibold">{match.memberIds.map(memberName).join(' · ')}</p>
                  <p>
                    {formatTime(match.scheduledFor)} – {formatTime(match.scheduledUntil)} ({group.timezone})
                  </p>
                  {match.memberIds.includes(myMembership.userId) || isAdmin ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {(googleConnected ? (['ics', 'google'] as const) : (['ics'] as const)).map((provider) => {
                        const link = calendarLinks[`${match.id}:${provider}`];
                        return link ? (
                          <a
                            key={provider}
                            href={link.url}
                            className="underline"
                            {...(provider === 'google' ? { target: '_blank', rel: 'noreferrer' } : {})}
                          >
                            {link.label}
                          </a>
                        ) : (
                          <Button
                            key={provider}
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              void addCalendar(match, provider);
                            }}
                          >
                            {provider === 'ics' ? 'Create calendar file' : 'Add to my Google calendar'}
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
              {run.unmatchedUserIds.length ? (
                <p className="text-xs">
                  Unmatched: {run.unmatchedUserIds.map(memberName).join(', ')}. Add or widen lunch availability for a
                  future draw.
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-[rgba(20,18,21,0.7)]">
            Calendar events are added when you choose an action.{' '}
            <Link href="/portal/settings" className="underline">
              Connect Google Calendar
            </Link>{' '}
            to add a lunch directly to your calendar.
          </p>
        </div>
      </div>
    </Card>
  );
}
