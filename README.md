# LotteryLunch

LotteryLunch helps colleagues organize lunch groups, share availability, and connect calendars. It has a Next.js App Router portal and a versioned JSON API, backed by PostgreSQL, Prisma, and Google sign-in through Better Auth.

## Development

Use Node.js 24 LTS (`nvm use`) and npm. Node.js 26 is also supported and checked in CI. Docker Compose supplies PostgreSQL 18 and an isolated Node.js 24 development container.

1. Copy `.env.example` to `.env.local`.
2. Set `BETTER_AUTH_SECRET` to a random secret (`openssl rand -base64 32`) and configure Google OAuth credentials. The example lists the required redirect URLs.
3. Run `npm run dev` or `./up.sh`.
4. Open http://localhost:3000.

The app container installs the lockfile with `npm ci`, generates the Prisma client, applies committed migrations, and starts Next.js. Dependency and build volumes are separate from the host. Database data remains in `postgres-data/`. Development ports bind to localhost.

To run the app on the host instead:

```sh
npm ci
docker compose up -d db
npm run db:deploy
npm run dev:app
```

Next.js and the Prisma CLI both load `.env.local` and `.env`; exported variables take precedence. `SHADOW_DATABASE_URL` is optional for generation and deployment. For creating migrations, either give the database user permission to create a shadow database or configure an existing, separate shadow database.

## Checks

```sh
npm run check           # lint, formatting, route generation + types, tests, build
npm run test:migrations # disposable PostgreSQL migration tests; requires Docker
npm run format:check
```

`npm test` exercises the API client and server behavior. Migration tests use their own temporary database, check fresh installs and preservation of legacy data, and never use the application's database. CI runs checks on Node.js 24 and 26.

Next.js 16 uses Turbopack by default and the `src/proxy.ts` convention. Prisma 7 generates its TypeScript client into `src/generated/prisma/` during installation. Generated output is ignored by Git, lint, and formatting. TypeScript remains on 6 and ESLint on 9 to satisfy the current lint plugins' supported peer ranges.

The package overrides apply security fixes to `deepmerge-ts` and `mysql2` pinned by Prisma's CLI. Revisit those overrides when Prisma includes the patched versions itself.

## Database upgrades

Back up an existing database before applying migrations. The authentication reconciliation migration aligns the historical NextAuth tables with Better Auth and adds the tables already used by the API. It preserves existing identifiers, OAuth account data, and session records. Users must sign in again because NextAuth and Better Auth use different session cookies.

```sh
npm run db:deploy
```

Startup no longer marks migrations as applied automatically or runs `prisma db push` after a migration failure. If an existing database was created with `db push` and has no migration history, inspect its schema and establish an explicit baseline before deploying. A schema already modified outside the committed migrations needs a reviewed reconciliation; do not blindly mark every migration as applied.

The tested legacy upgrade starts after all migrations through `20260206194000` have completed. A populated database still on the initial May 2025 schema needs separate handling of the historical NextAuth migration's required `User.updatedAt` column before continuing.

For new schema changes, edit `prisma/schema.prisma`, run `npm run prisma:migrate -- --name descriptive_name`, review the SQL, and commit the migration. `npm run prisma:reset` deletes data and is for disposable development databases only.

## Production

Set the database URL, authentication URL and secret, and Google credentials in the deployment environment. Use Node.js 24 LTS and a supported PostgreSQL release. Run `npm ci`, `npm run db:deploy`, `npm run build`, then `npm start`. Apply migrations as a deployment step before starting the new application.

`GET /api/v1/health` reports application health. The API rate limiter is per process; deployments with multiple replicas need a shared rate limiter at the gateway. Configure your proxy to overwrite forwarded client IP headers.

Dependency updates are grouped for packages that must stay in sync. Require passing CI checks in GitHub branch protection before enabling dependency auto-merge.

## Project layout

- `src/app/(webui)` — public and portal routes.
- `src/webui` — UI components and typed API queries/mutations.
- `src/app/api` — Better Auth and `/api/v1` route handlers.
- `src/server` — validation, authorization, services, and integrations.
- `prisma` — schema and committed migration history.
- `tests` — unit, contract, and migration checks.

See [API reference](docs/api-reference.md), [API design](docs/api-design.md), and [Web UI notes](docs/webui.md). The [task list](docs/tasklist.md) is a historical roadmap; completed checkboxes may describe removed or unfinished features.
