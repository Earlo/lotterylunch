import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { buildIcsEvent, lunchIcsUid } from '@/lib/server/integrations/calendar/ics';
import { calendarArtifactDownloadParams, createCalendarArtifactSchema } from '@/lib/server/schemas/calendar';
import { getCalendarArtifact } from '@/lib/server/services/calendar';

type Params = {
  params: Promise<{ artifactId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { artifactId } = calendarArtifactDownloadParams.parse(resolved);
    const artifact = await getCalendarArtifact(artifactId, userId);
    const payload = createCalendarArtifactSchema.parse(artifact.payload);
    const ics = buildIcsEvent({
      ...payload,
      uid: lunchIcsUid(artifact.matchId),
    });

    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="lotterylunch-${artifactId}.ics"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
