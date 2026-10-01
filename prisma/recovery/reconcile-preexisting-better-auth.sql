-- One-time repair for the Better Auth schema created by the old startup's
-- `prisma db push`. Inspect the schema and take a backup before using this file.
-- This is intentionally outside migration history: the normal reconciliation
-- still upgrades the historical Auth.js schema on fresh/legacy databases.
-- Existing verification booleans, account/session IDs and token data stay intact.
BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Account"
    ADD COLUMN IF NOT EXISTS "type" TEXT,
    ADD COLUMN IF NOT EXISTS "token_type" TEXT,
    ADD COLUMN IF NOT EXISTS "session_state" TEXT;

CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");

COMMIT;
