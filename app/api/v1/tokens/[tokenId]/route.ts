import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { tokenIdParamsSchema } from '@/lib/server/schemas/tokens';
import { revokeApiToken } from '@/lib/server/services/tokens';

type Params = {
  params: Promise<{ tokenId: string }>;
};

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { tokenId } = tokenIdParamsSchema.parse(resolved);
    return revokeApiToken(userId, tokenId);
  });
}
