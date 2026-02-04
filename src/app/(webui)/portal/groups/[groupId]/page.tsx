import { requirePortalSession } from '@/webui/auth';
import { GroupDetailClient } from '@/webui/components/groups/GroupDetailClient';
import { AppShell } from '@/webui/components/layout/AppShell';

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const resolved = await params;
  await requirePortalSession(`/portal/groups/${resolved.groupId}`);

  return (
    <AppShell
      title="Group detail"
      description="Membership, invitations, and upcoming runs will appear here."
    >
      <GroupDetailClient groupId={resolved.groupId} />
    </AppShell>
  );
}
