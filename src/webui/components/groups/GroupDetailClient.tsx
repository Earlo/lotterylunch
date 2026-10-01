'use client';

import { authClient } from '@/lib/auth-client';
import { getErrorMessage } from '@/webui/api/client';
import type { GroupDetail, GroupInvite, Membership } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Card } from '@/webui/components/ui/Card';
import { Notice } from '@/webui/components/ui/Notice';
import { selectBaseStyles } from '@/webui/components/ui/formStyles';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { createGroupInvite } from '@/webui/mutations/invites';
import {
  removeMembership,
  updateMembership,
} from '@/webui/mutations/memberships';
import { fetchGroup } from '@/webui/queries/groups';
import { fetchMemberships } from '@/webui/queries/memberships';
import { useState } from 'react';

export function GroupDetailClient({ groupId }: { groupId: string }) {
  const { data: session } = authClient.useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const myMembership = memberships.find(
    (member) => member.userId === session?.user?.id,
  );
  const isAdmin =
    myMembership?.status === 'active' &&
    (myMembership.role === 'owner' || myMembership.role === 'admin');
  const selectStyles = `${selectBaseStyles} px-3 py-2 text-xs`;

  const loadAll = async (opts?: {
    isCancelled?: () => boolean;
    signal?: AbortSignal;
  }) => {
    const isCancelled = opts?.isCancelled ?? (() => false);
    try {
      const [groupData, membershipData] = await Promise.all([
        fetchGroup(groupId, opts?.signal),
        fetchMemberships(groupId, opts?.signal),
      ]);
      if (isCancelled()) return;
      setGroup(groupData);
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
  };

  useCancelableEffect(
    (isCancelled, signal) => {
      void loadAll({ isCancelled, signal });
    },
    [groupId],
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
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to remove member.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRole = async (membershipId: string, role: Membership['role']) => {
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

  return (
    <div className="grid gap-6">
      {loading ? <Notice>Loading group...</Notice> : null}
      {error ? <Notice role="alert">{error}</Notice> : null}

      <Card title="Group overview">
        <div className="grid gap-2 text-sm">
          <p className="font-semibold">{group?.name ?? 'Group'}</p>
          <p className="text-[rgba(20,18,21,0.7)]">{group?.description}</p>
          <p className="text-xs text-[rgba(20,18,21,0.6)]">
            Location:{' '}
            <span className="text-[rgba(20,18,21,0.7)]">
              {group?.location ?? 'Not set'}
            </span>
          </p>
        </div>
      </Card>

      <Card title="Invite members">
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={handleInvite} disabled={busy}>
              Create invite
            </Button>
            {invite ? (
              <div className="text-xs text-[rgba(20,18,21,0.7)]">
                Token: <span className="font-mono">{invite.token}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[rgba(20,18,21,0.6)]">
            Only admins can invite new members.
          </p>
        )}
      </Card>

      <Card title="Members">
        <div className="grid gap-3">
          {memberships.length === 0 ? (
            <p className="text-sm text-[rgba(20,18,21,0.6)]">
              {loading
                ? 'Loading members...'
                : loadError
                  ? 'Unable to load members.'
                  : 'No members yet.'}
            </p>
          ) : (
            memberships.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {member.user?.name || member.user?.email || member.userId}
                  </p>
                  <p className="text-xs text-[rgba(20,18,21,0.6)]">
                    {member.role}
                  </p>
                </div>
                {isAdmin ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Role for ${member.user?.name || member.user?.email || member.userId}`}
                      disabled={busy}
                      className={selectStyles}
                      value={member.role}
                      onChange={(event) =>
                        handleRole(
                          member.id,
                          event.target.value as Membership['role'],
                        )
                      }
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Remove ${member.user?.name || member.user?.email || member.userId}`}
                      onClick={() => handleRemove(member.id)}
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
