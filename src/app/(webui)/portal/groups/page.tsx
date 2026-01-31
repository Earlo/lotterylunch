import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { GroupsClient } from '@/webui/components/groups/GroupsClient';

export default async function GroupsPage() {
  await requirePortalSession('/portal/groups');

  return (
    <AppShell
      title="Groups"
      description="Manage group membership, invitations, and participation windows."
    >
      <GroupsClient />
    </AppShell>
  );
}
