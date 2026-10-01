import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';

import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export const auth = betterAuth({
  baseURL: env('BETTER_AUTH_URL'),
  secret: env('BETTER_AUTH_SECRET'),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  socialProviders: {
    google: {
      clientId: env('GOOGLE_CLIENT_ID'),
      clientSecret: env('GOOGLE_CLIENT_SECRET'),
    },
  },
});
