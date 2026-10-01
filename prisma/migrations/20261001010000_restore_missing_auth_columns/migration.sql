-- Older development databases could record the reconciliation as applied
-- without running its SQL. Restore the missing additive objects so normal
-- deployment also repairs that history without changing existing records.
-- Fresh, legacy-upgraded, and manually repaired databases already have these
-- objects; IF NOT EXISTS makes this migration a no-op for them.
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
