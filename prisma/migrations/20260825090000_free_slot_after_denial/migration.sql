-- ---------------------------------------------------------------------------
-- A denied or missed appointment must give its slot back
-- ---------------------------------------------------------------------------
--
-- appointments_doctor_id_date_time_key was unconditional, so once a doctor
-- declined a request the row kept holding that doctor/date/time forever. The
-- patient could not rebook the slot, and nobody else could book it either --
-- every denial permanently removed a slot from the clinic's day.
--
-- Prisma cannot express a partial unique index, so it is written by hand, the
-- same way tokens_one_active_per_user is.
--
-- Completed still occupies its slot: that appointment genuinely happened at
-- that time. Only the outcomes that mean "this is not going to happen" release
-- it: Cancelled, Denied, Missed.

DROP INDEX IF EXISTS "appointments_doctor_id_date_time_key";

CREATE UNIQUE INDEX "appointments_one_live_per_slot"
  ON "appointments" ("doctor_id", "date", "time")
  WHERE "deleted_at" IS NULL
    AND "status" NOT IN ('Cancelled', 'Denied', 'Missed');
