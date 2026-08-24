-- Indexes for the read patterns the dashboards actually run.
-- CREATE INDEX only: no table is rewritten and no data is touched.
CREATE INDEX IF NOT EXISTS "appointments_facility_id_date_status_idx"
  ON "appointments" ("facility_id", "date", "status");

CREATE INDEX IF NOT EXISTS "doctor_availability_date_idx"
  ON "doctor_availability" ("date");

CREATE INDEX IF NOT EXISTS "audit_logs_action_occurred_at_idx"
  ON "audit_logs" ("action", "occurred_at");
