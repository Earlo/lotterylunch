-- Reconcile the checked-in Auth.js migration history with the application's
-- Better Auth and API models. Preserve identifiers, relationships, OAuth tokens,
-- verification timestamps, and legacy metadata rather than recreating tables.
-- This migration intentionally does not change the earlier migration files.
BEGIN;

CREATE TYPE "GroupVisibility" AS ENUM ('open', 'invite_only');
CREATE TYPE "GroupRole" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "MatchStatus" AS ENUM ('proposed', 'confirmed', 'canceled');

-- Better Auth generates string IDs. Existing UUID values retain exactly the
-- same text representation, including in every referencing table.
ALTER TABLE "Group" DROP CONSTRAINT "Group_ownerId_fkey";
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";
ALTER TABLE "CalendarConnection" DROP CONSTRAINT "CalendarConnection_userId_fkey";
ALTER TABLE "AvailabilitySlot" DROP CONSTRAINT "AvailabilitySlot_userId_fkey";
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";
ALTER TABLE "Authenticator" DROP CONSTRAINT "Authenticator_userId_fkey";

ALTER TABLE "User" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
ALTER TABLE "Group" ALTER COLUMN "ownerId" TYPE TEXT USING "ownerId"::text;
ALTER TABLE "Membership" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text;
ALTER TABLE "CalendarConnection" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text;
ALTER TABLE "AvailabilitySlot" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text;
ALTER TABLE "Account" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text;
ALTER TABLE "Session" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text;
ALTER TABLE "Authenticator" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text;

ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" RENAME COLUMN "emailVerified" TO "emailVerifiedAt";
ALTER TABLE "User"
    ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "area" TEXT;
UPDATE "User" SET "emailVerified" = "emailVerifiedAt" IS NOT NULL;

ALTER TABLE "Group"
    ADD COLUMN "groupVisibility" "GroupVisibility" NOT NULL DEFAULT 'open',
    ADD COLUMN "defaultGroupSize" INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
    ADD COLUMN "createdById" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Group" SET
    "groupVisibility" = "visibility"::text::"GroupVisibility",
    "updatedAt" = "createdAt";
ALTER TABLE "Group" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Membership"
    ADD COLUMN "groupRole" "GroupRole" NOT NULL DEFAULT 'member',
    ADD COLUMN "createdAt" TIMESTAMP(3),
    ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Membership" SET
    "groupRole" = "role"::text::"GroupRole",
    "createdAt" = "joinedAt",
    "updatedAt" = "joinedAt";
ALTER TABLE "Membership"
    ALTER COLUMN "createdAt" SET NOT NULL,
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Match"
    ALTER COLUMN "scheduledFor" DROP NOT NULL,
    ALTER COLUMN "algorithmVersion" DROP NOT NULL,
    ADD COLUMN "status" "MatchStatus" NOT NULL DEFAULT 'proposed',
    ADD COLUMN "memberIds" JSONB,
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Match" SET
    "status" = CASE "state"
        WHEN 'scheduled' THEN 'confirmed'::"MatchStatus"
        WHEN 'cancelled' THEN 'canceled'::"MatchStatus"
        ELSE 'proposed'::"MatchStatus"
    END,
    "updatedAt" = "createdAt";
ALTER TABLE "Match" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Account" RENAME COLUMN "provider" TO "providerId";
ALTER TABLE "Account" RENAME COLUMN "providerAccountId" TO "accountId";
ALTER TABLE "Account" RENAME COLUMN "access_token" TO "accessToken";
ALTER TABLE "Account" RENAME COLUMN "refresh_token" TO "refreshToken";
ALTER TABLE "Account" RENAME COLUMN "id_token" TO "idToken";
ALTER TABLE "Account" RENAME COLUMN "expires_at" TO "accessTokenExpiresAt";
-- Auth.js stores expiry as Unix seconds; Better Auth expects a timestamp.
ALTER TABLE "Account"
    ALTER COLUMN "accessTokenExpiresAt" TYPE TIMESTAMP(3)
        USING to_timestamp("accessTokenExpiresAt") AT TIME ZONE 'UTC',
    ALTER COLUMN "type" DROP NOT NULL,
    ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3),
    ADD COLUMN "password" TEXT;
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");
ALTER TABLE "Account" ALTER COLUMN "id" DROP DEFAULT;
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

ALTER TABLE "Session" RENAME COLUMN "sessionToken" TO "token";
ALTER TABLE "Session" RENAME COLUMN "expires" TO "expiresAt";
ALTER TABLE "Session"
    ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "ipAddress" TEXT,
    ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");
ALTER TABLE "Session" ALTER COLUMN "id" DROP DEFAULT;
ALTER INDEX "Session_sessionToken_key" RENAME TO "Session_token_key";
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- Keep VerificationToken and Authenticator intact for compatibility and retain
-- the old verification records in the new Better Auth table as well.
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
INSERT INTO "verification" ("id", "identifier", "value", "expiresAt", "updatedAt")
SELECT gen_random_uuid()::text, "identifier", "token", "expires", CURRENT_TIMESTAMP
FROM "VerificationToken";
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

CREATE TABLE "GroupInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "groupId" UUID NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupInvite_token_key" ON "GroupInvite"("token");
CREATE INDEX "GroupInvite_groupId_idx" ON "GroupInvite"("groupId");
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookEndpoint_userId_idx" ON "WebhookEndpoint"("userId");
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CalendarArtifact" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarArtifact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarArtifact_matchId_idx" ON "CalendarArtifact"("matchId");
ALTER TABLE "CalendarArtifact" ADD CONSTRAINT "CalendarArtifact_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
