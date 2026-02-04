import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { LotteryDetailClient } from '@/webui/components/lotteries/LotteryDetailClient';

export default async function LotteryDetailPage({
  params,
}: {
  params: Promise<{ lotteryId: string }>;
}) {
  const resolved = await params;
  await requirePortalSession(`/portal/lotteries/${resolved.lotteryId}`);

  return (
    <AppShell
      title="Lottery overview"
      description="Scheduling rules and participation controls for this lottery."
    >
      <LotteryDetailClient lotteryId={resolved.lotteryId} />
    </AppShell>
  );
}
