-- Retain all existing artifacts. Google payloads identify their creator through
-- the connection; only the earliest artifact becomes the reusable action when
-- earlier versions created duplicates. Legacy ICS creators are unknown.
ALTER TABLE "CalendarArtifact" ADD COLUMN "userId" TEXT;

WITH "ownedArtifacts" AS (
  SELECT artifact."id", connection."userId",
         row_number() OVER (
           PARTITION BY artifact."matchId", connection."userId", artifact."type"
           ORDER BY artifact."createdAt", artifact."id"
         ) AS position
  FROM "CalendarArtifact" artifact
  JOIN "CalendarConnection" connection
    ON connection."id"::text = artifact."payload"->>'connectionId'
  WHERE artifact."type" = 'google'
)
UPDATE "CalendarArtifact" artifact
SET "userId" = owned."userId"
FROM "ownedArtifacts" owned
WHERE artifact."id" = owned."id" AND owned.position = 1;

CREATE UNIQUE INDEX "CalendarArtifact_matchId_userId_type_key"
  ON "CalendarArtifact"("matchId", "userId", "type");
