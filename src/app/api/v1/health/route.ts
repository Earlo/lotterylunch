import { handleRoute } from '@/server/http/responses';

export function GET() {
  return handleRoute(async () => {
    return {
      status: 'ok',
      now: new Date().toISOString(),
      service: 'lotterylunch-api',
      version: 'v1',
    };
  });
}
