# Recovering the preexisting Better Auth database

The old development startup marked migrations as applied and ran `prisma db push`.
Such a database can already have Better Auth tables while its migration history
still describes Auth.js. There are two possible symptoms:

- The reconciliation migration fails because its types and modern columns already
  exist; subsequent deploys report `P3009`.
- Reconciliation is recorded as applied, but its SQL was never executed. Deploy
  reports no pending migrations, while Google sign-in fails with `P2022` because
  `Account.type` is missing. `User.emailVerifiedAt`, the other legacy account
  columns, and authentication indexes can also be missing.

`prisma migrate resolve --applied` only updates migration history; it does not
execute the migration SQL.

When reconciliation is already recorded as applied, back up the database and run
`./up.sh` with the updated code. The follow-up migration
`20261001010000_restore_missing_auth_columns` adds only missing columns and indexes.
It runs after PostgreSQL is healthy and preserves existing records and legacy
tables. On databases already matching the managed schema, it changes nothing.
If the app container is already running, use `docker compose restart app` to rerun
startup deployment, or run `npm run db:deploy` with the host setup below.

For host CLI commands, first start PostgreSQL with
`docker compose up -d --wait db` and ensure `.env.local` uses the published
`localhost:5432` connection. Running resolve or deploy before PostgreSQL starts
causes `P1001`. The app container uses the Compose hostname `db` automatically.

The October 2026 recovery adds only four nullable columns and three indexes using
[reconcile-preexisting-better-auth.sql](../prisma/recovery/reconcile-preexisting-better-auth.sql).
It preserves verification booleans, account/session IDs, OAuth tokens, verification
records, and all existing tables. `emailVerifiedAt` remains null when the original
verification timestamp was already removed by `db push`.

This SQL is for that inspected preexisting schema. Fresh installations and
databases built from the historical migrations use normal `prisma migrate deploy`.
The manual recovery is for an unresolved reconciliation failure. A later migration
cannot bypass that failed migration.

Before repairing another database, save a private `pg_dump --format=custom` backup
and restore it into a separate PostgreSQL instance. Check `prisma migrate diff`
against `prisma/schema.prisma` and confirm that the only missing managed objects
are `User.emailVerifiedAt`, `Account.type`, `Account.token_type`,
`Account.session_state`, and the three indexes in the recovery SQL. Apply the SQL
to the copy and verify existing records and the remaining schema differences.

For the Compose development database, apply the inspected SQL with:

```sh
docker compose up -d --wait db
docker compose exec -T db psql -U lotterylunch -d lotterylunch -v ON_ERROR_STOP=1 \
  < prisma/recovery/reconcile-preexisting-better-auth.sql
```

After applying the SQL to the original database and verifying it, resolve only the
failed reconciliation migration and deploy. These host commands require installed
dependencies and a `.env.local` database URL pointing to `localhost:5432`:

```sh
npm exec prisma -- migrate resolve --applied 20261001000000_reconcile_better_auth_and_api_schema
npm run db:deploy
./up.sh
```

The inspected local database also retains obsolete `Lottery`, `LotteryRun`, and
`Participation` tables, `Match.runId`, their relationships/enums, and the user
columns `lotteryFrequency`, `lunchTime`, and `preferredDays`. Prisma's full diff
still proposes removing these extras; the recovery leaves them intact. Do not
execute that generated diff as the repair. Any later schema cleanup or migration
development against this database must account for these retained objects.

The application now deletes a group's retained legacy lotteries, runs,
participations, and linked matches with its managed descendants in one
transaction. It detects absent legacy tables on fresh installations and preserves
the tables and other groups' records. A disposable upgraded-schema regression
checks cleanup and rollback. This behavior does not replace backup or schema
reconciliation before deployment.

The regression integration tests cover both migration-history states. They verify
that normal deployment repairs an already-recorded reconciliation and restores
runtime account queries, and that a failed reconciliation can be repaired and
resolved. Both cases preserve existing authentication records; repeated repair
and deployment succeed without data changes.
