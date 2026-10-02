-- Existing memberships remain opted out until each member explicitly participates.
ALTER TABLE "Membership" ADD COLUMN "participating" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LunchRun" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "executedById" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "participantIds" JSONB NOT NULL,
    "unmatchedUserIds" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LunchRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Match" ADD COLUMN "scheduledUntil" TIMESTAMP(3), ADD COLUMN "lunchRunId" UUID;

CREATE INDEX "LunchRun_groupId_createdAt_idx" ON "LunchRun"("groupId", "createdAt");
CREATE INDEX "Match_lunchRunId_idx" ON "Match"("lunchRunId");
CREATE INDEX "Match_groupId_scheduledFor_idx" ON "Match"("groupId", "scheduledFor");

ALTER TABLE "LunchRun" ADD CONSTRAINT "LunchRun_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LunchRun" ADD CONSTRAINT "LunchRun_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_lunchRunId_fkey" FOREIGN KEY ("lunchRunId") REFERENCES "LunchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
