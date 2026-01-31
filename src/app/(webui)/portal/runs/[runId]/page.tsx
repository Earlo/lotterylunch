import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { Card } from '@/webui/components/ui/Card';

export default async function RunDetailPage({
  params,
}: {
  params: { runId: string };
}) {
  await requirePortalSession(`/portal/runs/${params.runId}`);

  return (
    <AppShell
      title="Run detail"
      description="Run status, matches, and calendar artifacts will appear here."
    >
      <Card title="Run status">
        <p className="text-sm text-[color:rgba(20,18,21,0.7)]">
          Run {params.runId} is ready for matching and notifications.
        </p>
      </Card>
    </AppShell>
  );
}
