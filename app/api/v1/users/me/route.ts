import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { updateUserProfileSchema } from '@/lib/server/schemas/users';

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
    const body: unknown = await req.json();
    const input = updateUserProfileSchema.parse(body);

    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.image !== undefined && { image: input.image }),
        ...(input.area !== undefined && { area: input.area }),
        ...(input.shortNoticePreference !== undefined && {
          shortNoticePreference: input.shortNoticePreference,
        }),
        ...(input.weekStartDay !== undefined && { weekStartDay: input.weekStartDay }),
        ...(input.clockFormat !== undefined && { clockFormat: input.clockFormat }),
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
