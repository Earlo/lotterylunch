'use client';

import { LunchLotteryPanel } from '@/components/groups/LunchLotteryPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { selectBaseStyles } from '@/components/ui/formStyles';
import { Input } from '@/components/ui/Input';
import { Notice } from '@/components/ui/Notice';
import { authClient } from '@/lib/auth-client';
import { getErrorMessage } from '@/lib/webui/api/client';
import type { GroupDetail, GroupInvite, Membership } from '@/lib/webui/api/types';
import { createCancelableEffect } from '@/lib/webui/cancelableEffect';
import { deleteGroup, transferGroupOwnership, updateGroup } from '@/lib/webui/mutations/groups';
import { createGroupInvite } from '@/lib/webui/mutations/invites';
import { removeMembership, updateMembership } from '@/lib/webui/mutations/memberships';
import { fetchGroup } from '@/lib/webui/queries/groups';
import { fetchMemberships } from '@/lib/webui/queries/memberships';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

export function GroupDetailClient({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'open' | 'invite_only'>('open');
  const [defaultGroupSize, setDefaultGroupSize] = useState(2);
  const [timezone, setTimezone] = useState('UTC');
  const myMembership = memberships.find((member) => member.userId === session?.user?.id);
  const isAdmin = myMembership?.status === 'active' && (myMembership.role === 'owner' || myMembership.role === 'admin');
  const isOwner = myMembership?.status === 'active' && group?.ownerId === myMembership.userId;
  const selectStyles = `${selectBaseStyles} px-3 py-2 text-xs`;

  const loadAll = useCallback(
    async (opts?: { isCancelled?: () => boolean; signal?: AbortSignal }) => {
      const isCancelled = opts?.isCancelled ?? (() => false);
      try {
        const [groupData, membershipData] = await Promise.all([
          fetchGroup(groupId, opts?.signal),
          fetchMemberships(groupId, opts?.signal),
        ]);
        if (isCancelled()) return;
        setGroup(groupData);
        setName(groupData.name);
        setDescription(groupData.description ?? '');
        setLocation(groupData.location ?? '');
        setVisibility(groupData.visibility);
        setDefaultGroupSize(groupData.defaultGroupSize);
        setTimezone(groupData.timezone);
        setMemberships(membershipData);
        setError(null);
        setLoadError(null);
      } catch (err) {
        if (isCancelled()) return;
        const message = getErrorMessage(err, 'Unable to load group data.');
        setError(message);
        setLoadError(message);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [groupId],
  );

  useEffect(
    () =>
      createCancelableEffect((isCancelled, signal) => {
        void loadAll({ isCancelled, signal });
      }),
    [loadAll],
  );

  const handleInvite = async () => {
    setBusy(true);
    try {
      const created = await createGroupInvite(groupId, {
        expiresInDays: 7,
        maxUses: 5,
      });
      setInvite(created);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create invite.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (membershipId: string) => {
    setBusy(true);
    try {
      await removeMembership(groupId, membershipId);
      if (membershipId === myMembership?.id) router.push('/portal/groups');
      else await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to remove member.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRole = async (membershipId: string, role: 'admin' | 'member') => {
    setBusy(true);
    try {
      await updateMembership(groupId, membershipId, { role });
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update role.'));
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (membershipId: string, status: Membership['status']) => {
    setBusy(true);
    try {
      await updateMembership(groupId, membershipId, { status });
      if (membershipId === myMembership?.id && status !== 'active') router.push('/portal/groups');
      else await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update membership status.'));
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (member: Membership) => {
    if (
      !window.confirm(
        `Transfer group ownership to ${member.user?.name || member.user?.email || member.userId}? You will become an admin.`,
      )
    )
      return;
    setBusy(true);
    try {
      await transferGroupOwnership(groupId, member.userId);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to transfer ownership.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await updateGroup(groupId, { name, description, location, visibility, defaultGroupSize, timezone });
      setEditing(false);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save group.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete ${group?.name ?? 'this group'} and its memberships, draws, matches, and group availability?`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteGroup(groupId);
      router.push('/portal/groups');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to delete group.'));
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      {loading ? <Notice>Loading group...</Notice> : null}
      {error ? <Notice role="alert">{error}</Notice> : null}

      <Card title="Group overview">
        <div className="grid gap-2 text-sm">
          <p className="font-semibold">{group?.name ?? 'Group'}</p>
          <p className="text-[rgba(20,18,21,0.7)]">{group?.description}</p>
          <p className="text-xs text-[rgba(20,18,21,0.6)]">
            Location: <span className="text-[rgba(20,18,21,0.7)]">{group?.location ?? 'Not set'}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(!editing)}>
                Edit group
              </Button>
            ) : null}
            {myMembership && !isOwner ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void handleRemove(myMembership.id);
                }}
              >
                Leave group
              </Button>
            ) : null}
            {isOwner ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void handleDelete();
                }}
              >
                Delete group
              </Button>
            ) : null}
          </div>
          {editing && isAdmin ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                void handleSave(event);
              }}
            >
              <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
                <label htmlFor="group-edit-name">
                  Group name
                  <Input
                    id="group-edit-name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label htmlFor="group-edit-description">
                  Description
                  <Input
                    id="group-edit-description"
                    maxLength={2000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label htmlFor="group-edit-location">
                  Location
                  <Input
                    id="group-edit-location"
                    maxLength={200}
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </label>
                <label htmlFor="group-edit-visibility">
                  Visibility
                  <select
                    id="group-edit-visibility"
                    className={selectStyles}
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value === 'invite_only' ? 'invite_only' : 'open')}
                  >
                    <option value="open">Open</option>
                    <option value="invite_only">Invite only</option>
                  </select>
                </label>
                <label htmlFor="group-edit-size">
                  Maximum lunch group size
                  <Input
                    id="group-edit-size"
                    required
                    type="number"
                    min={2}
                    max={8}
                    value={defaultGroupSize}
                    onChange={(event) => setDefaultGroupSize(Number(event.target.value))}
                  />
                </label>
                <label htmlFor="group-edit-timezone">
                  Timezone
                  <Input
                    id="group-edit-timezone"
                    required
                    maxLength={80}
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  />
                </label>
              </fieldset>
              <div>
                <Button variant="ghost" type="submit" disabled={busy}>
                  Save group
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </Card>

      {group && myMembership?.status === 'active' ? (
        <LunchLotteryPanel
          group={group}
          memberships={memberships}
          myMembership={myMembership}
          isAdmin={isAdmin}
          onMembershipChange={loadAll}
        />
      ) : null}

      <Card title="Invite members">
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                void handleInvite();
              }}
              disabled={busy}
            >
              Create invite
            </Button>
            {invite ? (
              <div className="text-xs text-[rgba(20,18,21,0.7)]">
                Token: <span className="font-mono">{invite.token}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[rgba(20,18,21,0.6)]">Only admins can invite new members.</p>
        )}
      </Card>

      <Card title="Members">
        <div className="grid gap-3">
          {memberships.length === 0 ? (
            <p className="text-sm text-[rgba(20,18,21,0.6)]">
              {loading ? 'Loading members...' : loadError ? 'Unable to load members.' : 'No members yet.'}
            </p>
          ) : (
            memberships.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{member.user?.name || member.user?.email || member.userId}</p>
                  <p className="text-xs text-[rgba(20,18,21,0.6)]">
                    {member.role} · {member.status}
                  </p>
                </div>
                {isAdmin && member.userId !== group?.ownerId && member.role !== 'owner' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Role for ${member.user?.name || member.user?.email || member.userId}`}
                      disabled={busy}
                      className={selectStyles}
                      value={member.role}
                      onChange={(event) => {
                        const role = event.target.value;
                        if (role === 'admin' || role === 'member') {
                          void handleRole(member.id, role);
                        }
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                    <select
                      aria-label={`Status for ${member.user?.name || member.user?.email || member.userId}`}
                      disabled={busy}
                      className={selectStyles}
                      value={member.status}
                      onChange={(event) => {
                        const status = event.target.value;
                        if (status === 'pending' || status === 'active' || status === 'suspended') {
                          void handleStatus(member.id, status);
                        }
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                    {isOwner && member.status === 'active' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void handleTransfer(member);
                        }}
                      >
                        Transfer ownership
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || member.status === 'suspended'}
                      aria-label={`Remove ${member.user?.name || member.user?.email || member.userId}`}
                      onClick={() => {
                        void handleRemove(member.id);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
