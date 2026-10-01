import { handleRoute } from '@/lib/server/http/responses';

export function GET() {
  return handleRoute(() => {
    return {
      status: 'ok',
      now: new Date().toISOString(),
      service: 'lotterylunch-api',
      version: 'v1',
    };
  });
}
