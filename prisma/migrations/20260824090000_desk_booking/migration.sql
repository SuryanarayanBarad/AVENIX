-- Desk booking for patients without a phone.
--
-- Additive only: `phone` is relaxed from NOT NULL to nullable, and a flag
-- records that an appointment was created at the desk by authenticated staff.
-- No existing row is altered, moved, or deleted.
ALTER TABLE "appointments" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "appointments" ADD COLUMN "booked_at_desk" BOOLEAN NOT NULL DEFAULT false;
