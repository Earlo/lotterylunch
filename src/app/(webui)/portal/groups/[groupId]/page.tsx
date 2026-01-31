import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { Card } from '@/webui/components/ui/Card';

export default async function GroupDetailPage({
  params,
}: {
  params: { groupId: string };
}) {
  await requirePortalSession(`/portal/groups/${params.groupId}`);

  return (
    <AppShell
      title="Group detail"
      description="Membership, invitations, and upcoming runs will appear here."
    >
      <Card title="Group status">
        <p className="text-sm text-[color:rgba(20,18,21,0.7)]">
          Group {params.groupId} is connected. Wire the API client to show
          membership and scheduling controls.
        </p>
      </Card>
    </AppShell>
  );
}
