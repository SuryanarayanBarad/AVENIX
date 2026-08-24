-- Records why an appointment moved to its current status. Its main use is the
-- doctor's denial reason, which the patient sees in place of a bare "Declined".
ALTER TABLE "appointments" ADD COLUMN "status_reason" TEXT;
