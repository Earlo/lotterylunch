DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'ShortNoticePreference'
    ) THEN
        CREATE TYPE "ShortNoticePreference" AS ENUM ('strict', 'standard', 'flexible');
    END IF;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "shortNoticePreference" "ShortNoticePreference";

ALTER TABLE "Group"
ADD COLUMN IF NOT EXISTS "location" TEXT;
