# LotteryLunch

LotteryLunch helps colleagues organize lunch groups, opt into lunch draws, and find shared availability. Organizers execute a draw from the group page; the app persists pairings and offers private ICS exports or manual Google Calendar actions. It has a Next.js App Router portal and a versioned JSON API, backed by PostgreSQL, Prisma, and Google sign-in through Better Auth.

To organize a lunch: create/join a group, save lunch availability in Settings, choose Join lottery on the group page, then have an owner/admin run a draw for a future window. Results appear on that page. Weekly templates follow the profile timezone; existing app bookings are respected across groups. There is no background scheduler or automatic invitation/reminder delivery. Outlook, Apple, ICS subscription feeds, and outgoing webhooks are unavailable.

Notice preferences affect every draw: Advance notice only requires 24 hours, Same-day OK requires one hour (also the default), and Last-minute OK allows any future time. Weekly availability may span at most seven days. Draws prioritize members with fewer usable times and compare bounded alternatives; unusually complex requests are rejected with advice to shorten the window or simplify availability. Calendar actions are reusable per lunch and account, and ICS exports have stable lunch identities. Saved draws cannot currently be canceled or rescheduled; organizers should check the dates before running a draw.

## Development

Use Node.js 24 LTS (`nvm use`) and npm. Node.js 26 is also supported and checked in CI. Docker Compose supplies PostgreSQL 18 and an isolated Node.js 24 development container.

1. Copy `.env.example` to `.env.local`.
2. Set `BETTER_AUTH_SECRET` to a random secret (`openssl rand -base64 32`) and configure Google OAuth credentials. The example lists the required redirect URLs.
3. Run `npm run dev` or `./up.sh`.
4. Open http://localhost:3000.

The app container installs the lockfile with `npm ci`, generates the Prisma client, applies committed migrations, and starts Next.js. `npm run dev` exports your user and group IDs so generated files remain writable on the host. A separate initialization service sets ownership of the dependency and build volumes and the generated Prisma directory, including files left by earlier containers. Database data remains in `postgres-data/`. Development ports bind to localhost.

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
npm run check           # formatting, lint, route generation + types, tests
npm run build           # production build
npm run test:migrations # isolated PostgreSQL migration + service regressions
npm run test:browser    # isolated multi-user journey; requires a production build and Chrome
npm run test:production # production Docker image, readiness, backup/restore
npm run format:check
npm run lint:fix
```

`npm test` exercises the API client, matching, and security behavior. Integration tests use local PostgreSQL server binaries (`POSTGRES_BIN` if needed) or Docker to create disposable databases. They check upgrades, authorization, invite concurrency, replacement rollback, dependent deletion, the complete pairing journey, and readiness outages. They never use the application's database. CI runs checks on Node.js 24 and 26.

The browser check uses fake users and signed sessions in a disposable database, a random localhost origin, and a temporary Chrome profile. It covers group management, participation, availability, profile clearing, preferences, drawing lunches, and private calendar downloads. It also checks a browser time zone different from the profile time zone. Set `CHROME_BIN` if Chrome is not on the usual paths, and build with `NEXT_PUBLIC_BETTER_AUTH_URL` unset so the test can verify same-origin authentication. Real Google consent remains a deployment check.

The layout and tooling follow the sibling `kotisivut` project. Next.js 16 uses Turbopack by default, root `proxy.ts`, React Compiler, typed routes, and typed environment variables. TypeScript 7 checks optional properties, indexed access, and unused code strictly. Oxlint checks TypeScript, Next.js, accessibility, and React Compiler rules; Tailwind lint checks canonical classes. The React Hooks rule package is loaded as an Oxlint plugin. Prettier sorts imports, package fields, and Tailwind classes.

Prisma 7 generates its TypeScript client into `generated/prisma/` during installation. The entire `generated/` directory is ignored by Git, lint, and formatting. API queries and mutations validate responses with Zod before returning their inferred DTO types. Authentication and database services remain request-scoped; component caching is not enabled.

The package overrides update `deepmerge-ts` and `mysql2` pinned by Prisma's CLI and `postcss` pinned by the Tailwind language service. Revisit those overrides when the upstream packages include the updated versions themselves.

## Database upgrades

Back up an existing database before applying migrations. The authentication reconciliation migration aligns the historical NextAuth tables with Better Auth and adds the tables already used by the API. It preserves existing identifiers, OAuth account data, and session records. Users must sign in again because NextAuth and Better Auth use different session cookies.

```sh
npm run db:deploy
```

Startup no longer marks migrations as applied automatically or runs `prisma db push` after a migration failure. If an existing database was created with `db push` and has no migration history, inspect its schema and establish an explicit baseline before deploying. A schema already modified outside the committed migrations needs a reviewed reconciliation; do not blindly mark every migration as applied.

The older startup could also record historical migrations and then push the Better Auth schema directly. If reconciliation is already recorded as applied, the follow-up migration restores missing authentication columns and indexes during normal deployment. This fixes Google sign-in errors such as `Account.type` missing despite no pending reconciliation migration. If reconciliation instead fails with `P3009`, follow the [preexisting schema recovery](docs/database-recovery.md) before deploying. Both repairs preserve existing data and legacy tables.

Normal legacy upgrade starts after migrations through `20260206194000`. A populated database still on the initial May 2025 schema must follow the [initial-schema recovery](docs/initial-schema-upgrade.md), which backfills `User.updatedAt` and preserves photos without changing historical checksums.

The new lunch workflow migration adds `Membership.participating` (existing members start opted out), `LunchRun`, and match scheduling fields. It leaves old unmanaged `LotteryRun` tables and `Match.runId` intact. Review any such retained legacy objects before further schema cleanup.

The owner repair migration restores active owner memberships from `Group.ownerId`, including memberships overwritten by the former invitation bug, and removes stray ownership roles from other users. Existing valid memberships are preserved. Review these repairs on your restored backup before deploying.

The calendar artifact migration adds per-user action ownership and uniqueness. It preserves all existing artifacts and reuses the earliest Google artifact whose creator can be identified from its calendar connection. Legacy ICS artifacts and duplicate historical actions remain accessible under the existing authorization rules. Existing duplicate events in external calendars are not removed automatically. Group deletion cleans the group's retained legacy lottery hierarchy transactionally without dropping those tables.

For new schema changes, edit `prisma/schema.prisma`, run `npm run prisma:migrate -- --name descriptive_name`, review the SQL, and commit the migration. `npm run prisma:reset` deletes data and is for disposable development databases only.

## Production

Set the database URL, authentication URL and secret, and Google credentials in the deployment environment. Use Node.js 24 LTS and a supported PostgreSQL release. Run `npm ci`, `npm run db:deploy`, `npm run build`, then `npm start`. Apply migrations as a deployment step before starting the new application.

`BETTER_AUTH_URL` must be the public HTTPS origin. Browser authentication defaults to the current origin. Only a deployment with a separate authentication host needs `NEXT_PUBLIC_BETTER_AUTH_URL`, supplied before building. `.env.prod` is not automatically loaded; export variables or use supported Next environment filenames.

`Dockerfile` builds a production standalone server. `docker-compose.prod.yml` runs a migration job before the app, uses an externally managed production PostgreSQL database, and binds the app to localhost for an HTTPS reverse proxy. Supply deployment variables explicitly:

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Compose's explicit `--env-file` loads that file; the application does not discover it. The ordinary `docker-compose.yml` starts `next dev` and is development infrastructure. Production configuration still needs the host's HTTPS ingress, database credentials, registered Google redirect URLs, backups, and monitoring. Rehearse upgrades and backup restoration on a separate database before deploying to the target.

Run `npm run test:production` to rehearse the production image locally with Docker Compose. The check uses placeholder credentials, a disposable PostgreSQL container, and a randomly assigned localhost port. It verifies migrations, static assets, readiness, a custom-format backup restored to a separate database, startup against the restored data, and readiness during a database outage. It removes its own containers, images, network, and temporary backup when finished. The script requires a Compose version supporting `!override` and ignores project environment files.

`GET /api/v1/health` is process liveness. `GET /api/v1/ready` queries the database and returns 503 when unavailable; use it for readiness. The API limiter is per process, so multiple replicas require shared rate limiting at the gateway. Configure ingress to overwrite forwarded client IP headers. Verify real Google sign-in/Calendar consent and multi-user browser journeys on the deployment origin.

Dependency updates are grouped for packages that must stay in sync. Require passing CI checks in GitHub branch protection before enabling dependency auto-merge.

## Project layout

- `app/(webui)` — public and portal routes.
- `app/api` — Better Auth and `/api/v1` route handlers.
- `components` — shared UI, groups, authentication, and settings.
- `hooks` — React hooks.
- `lib/webui` — validated API queries/mutations and browser helpers.
- `lib/server` — validation, authorization, services, and integrations.
- `lib` — shared helpers, authentication, environment, and Prisma setup.
- `styles` — global styles and Tailwind theme.
- `prisma` — schema and committed migration history.
- `tests` — unit, contract, and migration checks.

See [API reference](docs/api-reference.md), the [historical design proposal](docs/api-design.md), [Web UI notes](docs/webui.md), and the current [release checklist](docs/tasklist.md).
