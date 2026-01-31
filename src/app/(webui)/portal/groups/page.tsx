import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { EmptyState } from '@/webui/components/layout/EmptyState';
import { Card } from '@/webui/components/ui/Card';

export default async function GroupsPage() {
  await requirePortalSession('/portal/groups');

  return (
    <AppShell
      title="Groups"
      description="Manage group membership, invitations, and participation windows."
    >
      <div className="grid gap-6">
        <EmptyState
          title="No groups yet"
          description="Start a group to invite teammates and schedule your first run."
        />

        <Card title="Coming soon">
          <p className="text-sm text-[color:rgba(20,18,21,0.7)]">
            This view will show group cards, membership counts, and the next run
            status once data hooks are wired in.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
