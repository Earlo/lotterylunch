'use client';

import type { ApiError } from '@/webui/api/client';
import type { GroupSummary } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Card } from '@/webui/components/ui/Card';
import { Input } from '@/webui/components/ui/Input';
import { Notice } from '@/webui/components/ui/Notice';
import { createGroup, joinGroup } from '@/webui/mutations/groups';
import { fetchGroups } from '@/webui/queries/groups';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

  const hasGroups = groups.length > 0;

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await fetchGroups();
      setGroups(data ?? []);
      setError(null);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to load groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups().catch(console.error);
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
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
      await loadGroups();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to create group.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!joinId.trim()) return;
    setBusy(true);
    try {
      await joinGroup(joinId.trim());
      setJoinId('');
      await loadGroups();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to join group.');
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteToken.trim()) return;
    setBusy(true);
    try {
      await import('@/webui/mutations/invites').then(({ acceptInvite }) =>
        acceptInvite(inviteToken.trim()),
      );
      setInviteToken('');
      await loadGroups();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to accept invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      {error ? <Notice>{error}</Notice> : null}

      <Card title="Create a group">
        <div className="grid gap-3">
          <Input
            placeholder="Group name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Input
            placeholder="Location (optional)"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
          <label className="text-xs text-[rgba(20,18,21,0.7)]">
            Visibility
            <select
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
            <Button variant="accent" onClick={handleCreate} disabled={busy}>
              Create group
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Join a group">
        <div className="grid gap-3">
          <Input
            placeholder="Group ID"
            value={joinId}
            onChange={(event) => setJoinId(event.target.value)}
          />
          <div>
            <Button variant="ghost" onClick={handleJoin} disabled={busy}>
              Join group
            </Button>
          </div>
          <p className="text-xs text-[rgba(20,18,21,0.6)]">
            Use the group ID from an invite or ask a group owner to share it.
          </p>
        </div>
      </Card>

      <Card title="Accept invite token">
        <div className="grid gap-3">
          <Input
            placeholder="Invite token"
            value={inviteToken}
            onChange={(event) => setInviteToken(event.target.value)}
          />
          <div>
            <Button
              variant="ghost"
              onClick={handleAcceptInvite}
              disabled={busy}
            >
              Accept invite
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Your groups">
        {loading ? (
          <p className="text-sm text-[rgba(20,18,21,0.6)]">Loading groups...</p>
        ) : hasGroups ? (
          <ul className="grid gap-3">
            {groups.map((group) => (
              <li
                key={group.id}
                className="rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
              >
                <Link
                  href={`/portal/groups/${group.id}`}
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
                    href={`/portal/groups/${group.id}`}
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
