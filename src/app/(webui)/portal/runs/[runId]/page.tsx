import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { RunDetailClient } from '@/webui/components/runs/RunDetailClient';

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
      <RunDetailClient runId={params.runId} />
    </AppShell>
  );
}
