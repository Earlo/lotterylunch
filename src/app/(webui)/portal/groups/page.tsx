import { requirePortalSession } from '@/webui/auth';
import { GroupsClient } from '@/webui/components/groups/GroupsClient';
import { AppShell } from '@/webui/components/layout/AppShell';

export default async function GroupsPage() {
  await requirePortalSession('/portal/groups');

  return (
    <AppShell
      title="Groups"
      description="Manage group membership, invitations, and locations."
    >
      <GroupsClient />
    </AppShell>
  );
}
