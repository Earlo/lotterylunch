'use client';

import { getErrorMessage } from '@/webui/api/client';
import type { GroupSummary } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Card } from '@/webui/components/ui/Card';
import { Input } from '@/webui/components/ui/Input';
import { Notice } from '@/webui/components/ui/Notice';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { createGroup, joinGroup } from '@/webui/mutations/groups';
import { acceptInvite } from '@/webui/mutations/invites';
import { fetchGroups } from '@/webui/queries/groups';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';

export function GroupsClient() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'open' | 'invite_only'>('open');
  const [joinId, setJoinId] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);

  const hasGroups = groups.length > 0;

  const loadGroups = async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    const isCurrent = () =>
      !signal?.aborted && version === requestVersion.current;
    try {
      const data = await fetchGroups(signal);
      if (!isCurrent()) return;
      setGroups(data ?? []);
      setError(null);
    } catch (err) {
      if (!isCurrent()) return;
      setError(getErrorMessage(err, 'Unable to load groups.'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useCancelableEffect((_isCancelled, signal) => {
    void loadGroups(signal);
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      await createGroup({
        name: name.trim(),
        description: description || undefined,
        location: location.trim() || undefined,
        visibility,
      });
      setName('');
      setDescription('');
      setLocation('');
      setVisibility('open');
      setLoading(true);
      await loadGroups();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create group.'));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !joinId.trim()) return;
    setBusy(true);
    try {
      await joinGroup(joinId.trim());
      setJoinId('');
      setLoading(true);
      await loadGroups();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to join group.'));
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !inviteToken.trim()) return;
    setBusy(true);
    try {
      await acceptInvite(inviteToken.trim());
      setInviteToken('');
      setLoading(true);
      await loadGroups();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to accept invite.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      {error ? <Notice role="alert">{error}</Notice> : null}

      <Card title="Create a group">
        <form className="grid gap-3" onSubmit={handleCreate}>
          <Input
            aria-label="Group name"
            disabled={busy}
            required
            maxLength={120}
            placeholder="Group name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label="Description (optional)"
            disabled={busy}
            maxLength={2000}
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Input
            aria-label="Location (optional)"
            disabled={busy}
            maxLength={200}
            placeholder="Location (optional)"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
          <label className="text-xs text-[rgba(20,18,21,0.7)]">
            Visibility
            <select
              disabled={busy}
              className="mt-2 w-full rounded-md border border-[rgba(20,18,21,0.2)] bg-white/80 px-4 py-2 text-sm text-(--ink) shadow-sm transition focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--haze) focus-visible:outline-none"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as 'open' | 'invite_only')
              }
            >
              <option value="open">Open (anyone can join)</option>
              <option value="invite_only">Private (invite only)</option>
            </select>
          </label>
          <div>
            <Button
              variant="accent"
              type="submit"
              disabled={busy || !name.trim()}
            >
              Create group
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Join a group">
        <form className="grid gap-3" onSubmit={handleJoin}>
          <Input
            aria-label="Group ID"
            disabled={busy}
            required
            placeholder="Group ID"
            value={joinId}
            onChange={(event) => setJoinId(event.target.value)}
          />
          <div>
            <Button
              variant="ghost"
              type="submit"
              disabled={busy || !joinId.trim()}
            >
              Join group
            </Button>
          </div>
          <p className="text-xs text-[rgba(20,18,21,0.6)]">
            Use the group ID from an invite or ask a group owner to share it.
          </p>
        </form>
      </Card>

      <Card title="Accept invite token">
        <form className="grid gap-3" onSubmit={handleAcceptInvite}>
          <Input
            aria-label="Invite token"
            disabled={busy}
            required
            placeholder="Invite token"
            value={inviteToken}
            onChange={(event) => setInviteToken(event.target.value)}
          />
          <div>
            <Button
              variant="ghost"
              type="submit"
              disabled={busy || !inviteToken.trim()}
            >
              Accept invite
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Your groups">
        {loading ? (
          <p role="status" className="text-sm text-[rgba(20,18,21,0.6)]">
            Loading groups...
          </p>
        ) : hasGroups ? (
          <ul className="grid gap-3">
            {groups.map((group) => (
              <li
                key={group.id}
                className="rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
              >
                <Link
                  href={`/portal/groups/${encodeURIComponent(group.id)}`}
                  className="text-sm font-semibold text-(--ink) underline-offset-4 hover:underline"
                >
                  {group.name}
                </Link>
                <p className="text-xs text-[rgba(20,18,21,0.7)]">
                  Location: {group.location ?? 'Not set'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[rgba(20,18,21,0.7)]">
                  <Button
                    variant="ghost"
                    size="sm"
                    as={Link}
                    href={`/portal/groups/${encodeURIComponent(group.id)}`}
                  >
                    Manage
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[rgba(20,18,21,0.6)]">
            You are not in any groups yet.
          </p>
        )}
      </Card>
    </div>
  );
}
