-- One real operational lever, so "counter optimization" can have an effect a
-- patient actually experiences. Additive with a default of 1, which is the
-- behaviour every existing row already had implicitly.
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "open_counters" INTEGER NOT NULL DEFAULT 1;
