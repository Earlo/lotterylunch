import { GroupDetailClient } from '@/components/groups/GroupDetailClient';
import { AppShell } from '@/components/layout/AppShell';
import { requirePortalSession } from '@/lib/webui/auth';

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const resolved = await params;
  await requirePortalSession(`/portal/groups/${resolved.groupId}`);

  return (
    <AppShell title="Group detail" description="Manage membership, join the lunch lottery, and view your pairings.">
      <GroupDetailClient key={resolved.groupId} groupId={resolved.groupId} />
    </AppShell>
  );
}
