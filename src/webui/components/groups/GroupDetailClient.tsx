'use client';

import type { ApiError } from '@/webui/api/client';
import type {
  GroupDetail,
  GroupInvite,
  Lottery,
  Membership,
} from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Card } from '@/webui/components/ui/Card';
import { Input } from '@/webui/components/ui/Input';
import { Notice } from '@/webui/components/ui/Notice';
import { createGroupInvite } from '@/webui/mutations/invites';
import { createLottery } from '@/webui/mutations/lotteries';
import {
  removeMembership,
  updateMembership,
} from '@/webui/mutations/memberships';
import { fetchGroup } from '@/webui/queries/groups';
import { fetchGroupLotteries } from '@/webui/queries/lotteries';
import { fetchMemberships } from '@/webui/queries/memberships';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const selectStyles =
  'w-full rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.2)] bg-white/80 px-3 py-2 text-xs text-[color:var(--ink)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--haze)]';

export function GroupDetailClient({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [lotteries, setLotteries] = useState<Lottery[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lotteryName, setLotteryName] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>(
    'weekly',
  );

  const loadAll = async () => {
    try {
      const [groupData, membershipData, lotteriesData] = await Promise.all([
        fetchGroup(groupId),
        fetchMemberships(groupId),
        fetchGroupLotteries(groupId),
      ]);
      setGroup(groupData);
      setMemberships(membershipData);
      setLotteries(lotteriesData);
      setError(null);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to load group data.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchGroup(groupId),
      fetchMemberships(groupId),
      fetchGroupLotteries(groupId),
    ])
      .then(([groupData, membershipData, lotteriesData]) => {
        if (cancelled) return;
        setGroup(groupData);
        setMemberships(membershipData);
        setLotteries(lotteriesData);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load group data.');
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const handleInvite = async () => {
    try {
      const created = await createGroupInvite(groupId, {
        expiresInDays: 7,
        maxUses: 5,
      });
      setInvite(created);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to create invite.');
    }
  };

  const handleRemove = async (membershipId: string) => {
    try {
      await removeMembership(groupId, membershipId);
      await loadAll();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to remove member.');
    }
  };

  const handleRole = async (membershipId: string, role: Membership['role']) => {
    try {
      await updateMembership(groupId, membershipId, { role });
      await loadAll();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to update role.');
    }
  };

  const handleCreateLottery = async () => {
    if (!lotteryName.trim()) return;
    try {
      await createLottery(groupId, {
        name: lotteryName.trim(),
        scheduleJson: { frequency },
      });
      setLotteryName('');
      await loadAll();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to create lottery.');
    }
  };

  return (
    <div className="grid gap-6">
      {error ? <Notice>{error}</Notice> : null}

      <Card title="Group overview">
        <div className="grid gap-2 text-sm">
          <p className="font-semibold">{group?.name ?? 'Group'}</p>
          <p className="text-[rgba(20,18,21,0.7)]">{group?.description}</p>
          <p className="text-xs text-[rgba(20,18,21,0.6)]">
            Visibility: {group?.visibility ?? 'open'} · ID: {groupId}
          </p>
        </div>
      </Card>

      <Card title="Invite members">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={handleInvite}>
            Create invite
          </Button>
          {invite ? (
            <div className="text-xs text-[rgba(20,18,21,0.7)]">
              Token: <span className="font-mono">{invite.token}</span>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Members">
        <div className="grid gap-3">
          {memberships.length === 0 ? (
            <p className="text-sm text-[rgba(20,18,21,0.6)]">No members yet.</p>
          ) : (
            memberships.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{member.userId}</p>
                  <p className="text-xs text-[rgba(20,18,21,0.6)]">
                    {member.role} · {member.status}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
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
                    onClick={() => handleRemove(member.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Lotteries">
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="Lottery name"
              value={lotteryName}
              onChange={(event) => setLotteryName(event.target.value)}
            />
            <select
              className={selectStyles}
              value={frequency}
              onChange={(event) =>
                setFrequency(
                  event.target.value as 'weekly' | 'biweekly' | 'monthly',
                )
              }
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every other week</option>
              <option value="monthly">Monthly</option>
            </select>
            <Button variant="accent" onClick={handleCreateLottery}>
              Create
            </Button>
          </div>

          <div className="grid gap-2">
            {lotteries.length === 0 ? (
              <p className="text-sm text-[rgba(20,18,21,0.6)]">
                No lotteries yet.
              </p>
            ) : (
              lotteries.map((lottery) => (
                <Link
                  key={lottery.id}
                  href={`/portal/lotteries/${lottery.id}`}
                  className="rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 px-4 py-3 text-sm font-semibold"
                >
                  {lottery.name}
                </Link>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
