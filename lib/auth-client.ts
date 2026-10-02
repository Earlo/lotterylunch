import { createAuthClient } from 'better-auth/react';

// Better Auth uses the browser's origin when no base URL is supplied.
export const authClient = createAuthClient(
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ? { baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL } : {},
);
