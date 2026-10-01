# Recovering the preexisting Better Auth database

The old development startup marked migrations as applied and ran `prisma db push`.
Such a database can already have Better Auth tables while its migration history
still describes Auth.js. The reconciliation migration then fails because its
types and modern columns already exist; subsequent deploys report `P3009`.

The October 2026 recovery adds only four nullable columns and three indexes using
[reconcile-preexisting-better-auth.sql](../prisma/recovery/reconcile-preexisting-better-auth.sql).
It preserves verification booleans, account/session IDs, OAuth tokens, verification
records, and all existing tables. `emailVerifiedAt` remains null when the original
verification timestamp was already removed by `db push`.

This SQL is for that inspected preexisting schema. Fresh installations and
databases built from the historical migrations use normal `prisma migrate deploy`.
The recovery is deliberately separate from startup and committed migration history.

Before repairing another database, save a private `pg_dump --format=custom` backup
and restore it into a separate PostgreSQL instance. Check `prisma migrate diff`
against `prisma/schema.prisma` and confirm that the only missing managed objects
are `User.emailVerifiedAt`, `Account.type`, `Account.token_type`,
`Account.session_state`, and the three indexes in the recovery SQL. Apply the SQL
to the copy and verify existing records and the remaining schema differences.

After the same SQL has been applied to the original database and verified, resolve
only the reconciliation migration and deploy:

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

The regression integration test recreates the preexisting schema, verifies failed
deployment leaves its data unchanged, applies the repair twice, resolves only the
failed migration, and confirms subsequent deployment succeeds.
