import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { calendarConnectionIdParams } from '@/server/schemas/calendar';
import { deleteCalendarConnection } from '@/server/services/calendar';

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
