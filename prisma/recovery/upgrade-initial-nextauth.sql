-- One-time, inspected upgrade for a populated database with only the initial
-- 20250514224159_init migration applied. See docs/initial-schema-upgrade.md.
-- Historical migration files and their checksums remain unchanged.
BEGIN;
SET LOCAL search_path = public;

DO $$
BEGIN
    IF to_regclass('public."_prisma_migrations"') IS NULL
       OR to_regclass('public."User"') IS NULL THEN
        RAISE EXCEPTION 'Initial-schema recovery requires the recorded initial migration and public.User';
    END IF;
END $$;

LOCK TABLE "_prisma_migrations" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    user_columns TEXT[];
    application_tables TEXT[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = '20250514224159_init'
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Initial-schema recovery requires 20250514224159_init to be successfully applied';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name <> '20250514224159_init'
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Initial-schema recovery refuses a database with successfully applied later migrations';
    END IF;

    SELECT array_agg(table_name::TEXT ORDER BY table_name::TEXT)
    INTO application_tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    IF application_tables IS DISTINCT FROM ARRAY[
        'AvailabilitySlot', 'CalendarConnection', 'Group', 'LunchEvent',
        'Match', 'Membership', 'User', '_prisma_migrations'
    ]::TEXT[] THEN
        RAISE EXCEPTION 'Initial-schema recovery requires only the initial application tables; found %', application_tables;
    END IF;

    SELECT array_agg(column_name || ':' || udt_name || ':' || is_nullable ORDER BY column_name)
    INTO user_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User';
    IF user_columns IS DISTINCT FROM ARRAY[
        'authProvider:text:NO', 'createdAt:timestamp:NO', 'email:text:NO',
        'id:uuid:NO', 'name:text:YES', 'photoUrl:text:YES', 'timezone:text:NO'
    ]::TEXT[] OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'User'
          AND column_name = 'createdAt' AND datetime_precision = 3
    ) THEN
        RAISE EXCEPTION 'Initial-schema recovery requires the unchanged initial User columns; found %', user_columns;
    END IF;
END $$;

-- Add nullable columns first so the populated initial table remains valid.
ALTER TABLE "User"
    ADD COLUMN "emailVerified" TIMESTAMP(3),
    ADD COLUMN "image" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "User" SET "image" = "photoUrl", "updatedAt" = "createdAt";
ALTER TABLE "User"
    ALTER COLUMN "updatedAt" SET NOT NULL,
    DROP COLUMN "photoUrl";

-- The remaining DDL is the original 20250519153939_nextauth migration.
-- CreateTable
CREATE TABLE "Account" (
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
