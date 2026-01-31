import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

const authEnvStatus = {
  BETTER_AUTH_URL: Boolean(process.env.BETTER_AUTH_URL),
  BETTER_AUTH_SECRET: Boolean(process.env.BETTER_AUTH_SECRET),
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  DATABASE_URL: Boolean(process.env.DATABASE_URL),
};

// Log once at module load to confirm env wiring without leaking secrets.
console.info('[auth] env status', authEnvStatus);

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
