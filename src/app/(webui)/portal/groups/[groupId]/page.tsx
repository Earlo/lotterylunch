import { requirePortalSession } from '@/webui/auth';
import { GroupDetailClient } from '@/webui/components/groups/GroupDetailClient';
import { AppShell } from '@/webui/components/layout/AppShell';

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
      <GroupDetailClient groupId={params.groupId} />
    </AppShell>
  );
}
