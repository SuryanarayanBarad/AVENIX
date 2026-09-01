-- Throughput could not be measured: a token recorded when it joined the queue
-- but never when it left, so arrival rate was observable and service rate was
-- not. Additive and nullable; existing rows are simply unknown, and the
-- forecast falls back to a coarser same-day measure until timestamps accrue.
ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- Backfill what can be known honestly: a token already Completed or Cancelled
-- left the queue at some point, and its issue time is the only anchor we have.
-- Deliberately NOT written as a guessed completion time — left null, so the
-- forecast treats it as unmeasured rather than inventing throughput history.

CREATE INDEX IF NOT EXISTS "tokens_facility_completed_at_idx"
    ON "tokens" ("facility_id", "completed_at");
