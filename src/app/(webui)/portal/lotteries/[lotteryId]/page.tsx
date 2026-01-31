import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { LotteryDetailClient } from '@/webui/components/lotteries/LotteryDetailClient';

export default async function LotteryDetailPage({
  params,
}: {
  params: { lotteryId: string };
}) {
  await requirePortalSession(`/portal/lotteries/${params.lotteryId}`);

  return (
    <AppShell
      title="Lottery overview"
      description="Scheduling rules and participation controls for this lottery."
    >
      <LotteryDetailClient lotteryId={params.lotteryId} />
    </AppShell>
  );
}
