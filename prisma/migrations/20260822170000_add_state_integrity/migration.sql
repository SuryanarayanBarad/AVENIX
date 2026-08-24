-- ---------------------------------------------------------------------------
-- State integrity for appointments and queue tokens
-- ---------------------------------------------------------------------------
-- 1. Repair duplicate codes that predate the uniqueness guarantee, and push
--    each facility's counter past every code already in use. Seed data used
--    DR-3001+ while the counter sat at 2884, so the two ranges would have
--    collided as soon as the counter caught up.
-- 2. Enforce one code per facility, and one active queue token per person.
-- 3. New bookings start as Pending so the doctor approve/deny step is real.

-- --- 1a. Repair duplicate appointment codes -------------------------------
DO $$
DECLARE
  fac RECORD;
  dup RECORD;
  next_num INTEGER;
BEGIN
  FOR fac IN SELECT id, next_appointment_number FROM facilities LOOP
    SELECT GREATEST(
      fac.next_appointment_number,
      COALESCE((
        SELECT MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)) + 1
        FROM appointments
        WHERE facility_id = fac.id AND code ~ '[0-9]+$'
      ), 1)
    ) INTO next_num;

    -- Keep the earliest row of each duplicate group; renumber the rest.
    FOR dup IN
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
        FROM appointments
        WHERE facility_id = fac.id
      ) ranked
      WHERE rn > 1
    LOOP
      UPDATE appointments SET code = 'DR-' || next_num WHERE id = dup.id;
      next_num := next_num + 1;
    END LOOP;

    UPDATE facilities SET next_appointment_number = next_num WHERE id = fac.id;
  END LOOP;
END $$;

-- --- 1b. Same repair for walk-in token codes ------------------------------
DO $$
DECLARE
  fac RECORD;
  dup RECORD;
  next_num INTEGER;
BEGIN
  FOR fac IN SELECT id, next_walkin_number FROM facilities LOOP
    SELECT GREATEST(
      fac.next_walkin_number,
      COALESCE((
        SELECT MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)) + 1
        FROM tokens
        WHERE facility_id = fac.id AND code ~ '[0-9]+$'
      ), 1)
    ) INTO next_num;

    FOR dup IN
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY code ORDER BY issued_at, id) AS rn
        FROM tokens
        WHERE facility_id = fac.id
      ) ranked
      WHERE rn > 1
    LOOP
      UPDATE tokens SET code = 'A-' || next_num WHERE id = dup.id;
      next_num := next_num + 1;
    END LOOP;

    UPDATE facilities SET next_walkin_number = next_num WHERE id = fac.id;
  END LOOP;
END $$;

-- --- 1c. Retire all but the newest active token per person ----------------
-- Nothing should hold two live queue positions; older ones are cancelled so
-- the partial unique index below can be created safely.
UPDATE tokens SET status = 'Cancelled'
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY issued_at DESC, id) AS rn
    FROM tokens
    WHERE user_id IS NOT NULL
      AND deleted_at IS NULL
      AND status IN ('Waiting', 'Approaching', 'Serving')
  ) ranked
  WHERE rn > 1
);

-- --- 2. Schema changes -----------------------------------------------------
-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'Pending';

-- CreateIndex
CREATE INDEX "appointments_doctor_id_status_idx" ON "appointments"("doctor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_facility_id_code_key" ON "appointments"("facility_id", "code");

-- CreateIndex
CREATE INDEX "tokens_user_id_status_idx" ON "tokens"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_facility_id_code_key" ON "tokens"("facility_id", "code");

-- --- 3. One active queue token per signed-in person ------------------------
-- Prisma cannot express a partial unique index, so it is written by hand.
-- This is the structural guarantee behind "a patient is never in two queues"
-- and behind refresh-safe token creation.
CREATE UNIQUE INDEX "tokens_one_active_per_user"
  ON "tokens" ("user_id")
  WHERE "user_id" IS NOT NULL
    AND "deleted_at" IS NULL
    AND "status" IN ('Waiting', 'Approaching', 'Serving');
