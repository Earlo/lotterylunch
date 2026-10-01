import { requireUser } from '@/lib/server/auth/session';
import { handleRoute, jsonCreated, jsonError } from '@/lib/server/http/responses';
import { createGroupSchema } from '@/lib/server/schemas/groups';
import { createGroup, listGroupsForUser } from '@/lib/server/services/groups';

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const json: unknown = await req.json();
    const input = createGroupSchema.parse(json);

    const group = await createGroup(userId, input);
    return jsonCreated(group);
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return listGroupsForUser(userId);
  });
}
