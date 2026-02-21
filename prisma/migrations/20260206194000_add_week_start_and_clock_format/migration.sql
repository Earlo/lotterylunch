DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'WeekStartDay'
    ) THEN
        CREATE TYPE "WeekStartDay" AS ENUM ('monday', 'sunday');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'ClockFormat'
    ) THEN
        CREATE TYPE "ClockFormat" AS ENUM ('h24', 'ampm');
    END IF;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "weekStartDay" "WeekStartDay" NOT NULL DEFAULT 'monday',
ADD COLUMN IF NOT EXISTS "clockFormat" "ClockFormat" NOT NULL DEFAULT 'h24';
