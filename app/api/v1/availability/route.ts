import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { availabilityQuerySchema, upsertAvailabilitySchema } from '@/lib/server/schemas/availability';
import { listAvailability, upsertAvailability } from '@/lib/server/services/availability';

export async function GET(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const url = new URL(req.url);
    const query = availabilityQuerySchema.parse({
      groupId: url.searchParams.get('groupId') ?? undefined,
    });
    return listAvailability(userId, query.groupId);
  });
}

export async function PUT(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body: unknown = await req.json();
    const input = upsertAvailabilitySchema.parse(body);
    return upsertAvailability(userId, input);
  });
}
