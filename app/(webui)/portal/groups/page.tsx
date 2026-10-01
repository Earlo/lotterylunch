import { GroupsClient } from '@/components/groups/GroupsClient';
import { AppShell } from '@/components/layout/AppShell';
import { requirePortalSession } from '@/lib/webui/auth';

export default async function GroupsPage() {
  await requirePortalSession('/portal/groups');

  return (
    <AppShell title="Groups" description="Manage group membership, invitations, and locations.">
      <GroupsClient />
    </AppShell>
  );
}
