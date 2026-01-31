import Link from 'next/link';

import { AppShell } from '@/webui/components/layout/AppShell';
import { EmptyState } from '@/webui/components/layout/EmptyState';
import { ClientAuthGate } from '@/webui/components/auth/ClientAuthGate';
import { Card } from '@/webui/components/ui/Card';
import { Button } from '@/webui/components/ui/Button';
import { requirePortalSession } from '@/webui/auth';

export default async function PortalPage() {
  await requirePortalSession('/portal');

  return (
    <AppShell
      title="Welcome back"
      description="Your portal overview, membership status, and next runs will live here."
    >
      <div className="grid gap-6">
        <EmptyState
          title="Nothing scheduled yet"
          description="Create or join a group to start scheduling lottery runs and seeing matches."
          action={
            <Button variant="accent" as={Link} href="/portal/groups">
              Go to groups
            </Button>
          }
        />
        <ClientAuthGate>
          <Card title="Session confirmed">
            <p className="text-sm text-[color:rgba(20,18,21,0.7)]">
              You are signed in and ready to configure your next run.
            </p>
          </Card>
        </ClientAuthGate>
      </div>
    </AppShell>
  );
}
