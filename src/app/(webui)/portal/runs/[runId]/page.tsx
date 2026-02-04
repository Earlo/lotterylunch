import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { RunDetailClient } from '@/webui/components/runs/RunDetailClient';

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const resolved = await params;
  await requirePortalSession(`/portal/runs/${resolved.runId}`);

  return (
    <AppShell
      title="Run detail"
      description="Run status, matches, and calendar artifacts will appear here."
    >
      <RunDetailClient runId={resolved.runId} />
    </AppShell>
  );
}
