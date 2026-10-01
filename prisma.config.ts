import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'prisma/config';

// Use the same .env.local/.env precedence as the Next.js application.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generation does not need a database; database commands validate this URL.
    ...(process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : {}),
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
