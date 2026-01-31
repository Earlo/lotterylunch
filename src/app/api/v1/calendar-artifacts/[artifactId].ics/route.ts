import { handleRoute } from '@/server/http/responses';
import { buildIcsEvent } from '@/server/integrations/calendar/ics';
import { calendarArtifactIdParams } from '@/server/schemas/calendar';
import { getCalendarArtifact } from '@/server/services/calendar';

type Params = {
  params: Promise<{ artifactId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const resolved = await params;
  const { artifactId } = calendarArtifactIdParams.parse(resolved);

  return handleRoute(async () => {
    const artifact = await getCalendarArtifact(artifactId);
    const payload = artifact.payload as Record<string, unknown>;
    const ics = buildIcsEvent({
      uid: artifact.id,
      title: String(payload.title ?? 'Lottery Lunch'),
      startsAt: String(payload.startsAt),
      endsAt: String(payload.endsAt),
      timezone: payload.timezone ? String(payload.timezone) : undefined,
      location: payload.location ? String(payload.location) : undefined,
      meetingUrl: payload.meetingUrl ? String(payload.meetingUrl) : undefined,
      notes: payload.notes ? String(payload.notes) : undefined,
    });

    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="lotterylunch-${artifactId}.ics"`,
      },
    });
  });
}
