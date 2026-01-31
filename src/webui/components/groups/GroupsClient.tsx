'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ApiError } from '@/webui/api/client';
import type { GroupSummary } from '@/webui/api/types';
import { fetchGroups } from '@/webui/queries/groups';
import { createGroup, joinGroup } from '@/webui/mutations/groups';
import { Button } from '@/webui/components/ui/Button';
import { Input } from '@/webui/components/ui/Input';
import { Card } from '@/webui/components/ui/Card';
import { Notice } from '@/webui/components/ui/Notice';

export function GroupsClient() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'open' | 'invite_only'>('open');
  const [joinId, setJoinId] = useState('');
  const [busy, setBusy] = useState(false);

  const hasGroups = groups.length > 0;

  const grouped = useMemo(() => groups, [groups]);

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
        visibility,
      });
      setName('');
      setDescription('');
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
          <label className="text-xs text-[color:rgba(20,18,21,0.7)]">
            Visibility
            <select
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.2)] bg-white/80 px-4 py-2 text-sm text-[color:var(--ink)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--haze)]"
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
          <p className="text-xs text-[color:rgba(20,18,21,0.6)]">
            Use the group ID from an invite or ask a group owner to share it.
          </p>
        </div>
      </Card>

      <Card title="Your groups">
        {loading ? (
          <p className="text-sm text-[color:rgba(20,18,21,0.6)]">Loading groups...</p>
        ) : hasGroups ? (
          <ul className="grid gap-3">
            {grouped.map((group) => (
              <li
                key={group.id}
                className="rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
              >
                <p className="text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-[color:rgba(20,18,21,0.6)]">
                  {group.visibility} · {new Date(group.createdAt).toLocaleDateString()}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:rgba(20,18,21,0.7)]">
                  <span className="rounded-full border border-[color:rgba(20,18,21,0.15)] px-2 py-1">
                    ID: {group.id}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard?.writeText(group.id)}
                  >
                    Copy ID
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[color:rgba(20,18,21,0.6)]">
            You are not in any groups yet.
          </p>
        )}
      </Card>
    </div>
  );
}
