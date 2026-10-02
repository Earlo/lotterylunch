# Upgrading a populated initial schema

The historical `20250519153939_nextauth` migration adds required `User.updatedAt`
without a backfill and discards `photoUrl`. Its checksum remains unchanged because
existing databases have already applied it. A populated database with only
`20250514224159_init` applied needs this explicit recovery before normal deployment.

Stop application writes, take a private custom-format PostgreSQL backup, restore it
into a separate database, and check its schema and `_prisma_migrations` history.
The recovery accepts only the initial application tables and original User columns.
It refuses a database with later successful migrations or partially applied auth
tables. Do not use it for an existing Better Auth schema; see
[that recovery](database-recovery.md).

Test these steps on the restored copy first. Export `DATABASE_URL` for the database
being inspected, then run:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/recovery/upgrade-initial-nextauth.sql
npm exec prisma -- migrate resolve --applied 20250519153939_nextauth
npm run db:deploy
```

The SQL transaction copies `photoUrl` into `image`, backfills `updatedAt` from
`createdAt`, enforces its required constraint, and creates the original NextAuth
tables. The explicit resolve records only that historical migration, after the SQL
succeeded. It also resolves a previously recorded failure of that migration when
the database still matches the initial schema. Subsequent migrations deploy normally.

If a guard or statement fails, roll back the transaction and investigate the actual
schema. Do not mark the migration applied or edit its historical SQL to force it
through. Re-running the recovery after success is deliberately refused; normal
deployment is then the supported path.
