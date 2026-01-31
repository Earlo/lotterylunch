import { requireUser } from '@/server/auth/session';
import { handleRoute, jsonCreated, jsonError } from '@/server/http/responses';
import { createGroupSchema } from '@/server/schemas/groups';
import { createGroup, listGroupsForUser } from '@/server/services/groups';

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const json = await req.json();
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
