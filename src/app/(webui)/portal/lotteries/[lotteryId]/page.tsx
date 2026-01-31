import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { Card } from '@/webui/components/ui/Card';

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
      <Card title="Lottery schedule">
        <p className="text-sm text-[color:rgba(20,18,21,0.7)]">
          Lottery {params.lotteryId} is ready for schedule configuration.
        </p>
      </Card>
    </AppShell>
  );
}
