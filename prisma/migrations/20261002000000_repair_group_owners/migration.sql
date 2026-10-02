-- Repair memberships damaged by generic owner promotion/invitation writes.
-- Group.ownerId is the authority; valid existing memberships are untouched.
BEGIN;

UPDATE "Membership" AS membership
SET "role" = CASE WHEN membership."role" = 'owner' THEN 'member'::"Role" ELSE membership."role" END,
    "groupRole" = CASE WHEN membership."role" = 'owner' THEN 'member'::"GroupRole" ELSE membership."role"::TEXT::"GroupRole" END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Group" AS lunch_group
WHERE membership."groupId" = lunch_group."id"
  AND membership."userId" <> lunch_group."ownerId"
  AND (membership."role" = 'owner' OR membership."groupRole" = 'owner');

INSERT INTO "Membership" (
    "id", "userId", "groupId", "role", "groupRole", "status", "joinedAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "ownerId", "id", 'owner', 'owner', 'active', "createdAt", "createdAt", CURRENT_TIMESTAMP
FROM "Group"
ON CONFLICT ("userId", "groupId") DO UPDATE
SET "role" = 'owner', "groupRole" = 'owner', "status" = 'active', "updatedAt" = CURRENT_TIMESTAMP
WHERE "Membership"."role" <> 'owner'
   OR "Membership"."groupRole" <> 'owner'
   OR "Membership"."status" <> 'active';

COMMIT;
