import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  availabilityQuerySchema,
  upsertAvailabilitySchema,
} from '@/server/schemas/availability';
import {
  listAvailability,
  upsertAvailability,
} from '@/server/services/availability';

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
    const body = await req.json();
    const input = upsertAvailabilitySchema.parse(body);
    return upsertAvailability(userId, input);
  });
}
