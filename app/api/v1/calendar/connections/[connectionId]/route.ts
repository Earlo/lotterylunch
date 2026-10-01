import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { calendarConnectionIdParams } from '@/lib/server/schemas/calendar';
import { deleteCalendarConnection } from '@/lib/server/services/calendar';

type Params = {
  params: Promise<{ connectionId: string }>;
};

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { connectionId } = calendarConnectionIdParams.parse(resolved);
    return deleteCalendarConnection(userId, connectionId);
  });
}
