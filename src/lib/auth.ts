import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const authEnvStatus = {
  NEXTAUTH_URL: Boolean(process.env.NEXTAUTH_URL),
  AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  DATABASE_URL: Boolean(process.env.DATABASE_URL),
};

// Log once at module load to confirm env wiring without leaking secrets.
console.info('[auth] env status', authEnvStatus);

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: true,
  adapter: PrismaAdapter(prisma),
  secret: env('AUTH_SECRET'),
  providers: [
    GoogleProvider({
      clientId: env('GOOGLE_CLIENT_ID'),
      clientSecret: env('GOOGLE_CLIENT_SECRET'),
    }),
  ],
  logger: {
    error(code, ...message) {
      console.error('[auth] error', code, ...message);
    },
    warn(code, ...message) {
      console.warn('[auth] warn', code, ...message);
    },
    debug(code, ...message) {
      console.debug('[auth] debug', code, ...message);
    },
  },
  events: {
    signIn(message) {
      console.info('[auth] signIn', message);
    },
    signOut(message) {
      console.info('[auth] signOut', message);
    },
    session(message) {
      console.info('[auth] session', message);
    },
  },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
