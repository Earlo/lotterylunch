import { prisma } from '@/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { updateUserProfileSchema } from '@/server/schemas/users';

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        image: true,
        area: true,
        shortNoticePreference: true,
        weekStartDay: true,
        clockFormat: true,
      },
    });
  });
}

export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body = await req.json();
    const input = updateUserProfileSchema.parse(body);

    return prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        timezone: input.timezone,
        image: input.image,
        area: input.area,
        shortNoticePreference: input.shortNoticePreference,
        weekStartDay: input.weekStartDay,
        clockFormat: input.clockFormat,
      },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        image: true,
        area: true,
        shortNoticePreference: true,
        weekStartDay: true,
        clockFormat: true,
      },
    });
  });
}
