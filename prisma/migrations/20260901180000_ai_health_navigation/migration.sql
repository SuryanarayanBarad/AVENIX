-- AI health navigation: patient-owned reports and the suggestions made from them.
--
-- Entirely additive. No existing table is altered beyond one nullable column,
-- and no data is moved or removed.

ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE TABLE IF NOT EXISTS "medical_reports" (
    "id"              TEXT NOT NULL,
    "user_id"         TEXT NOT NULL,
    "facility_id"     TEXT,
    "title"           TEXT NOT NULL,
    "kind"            TEXT NOT NULL DEFAULT 'Other',
    "object_path"     TEXT NOT NULL,
    "mime_type"       TEXT NOT NULL,
    "size_bytes"      INTEGER NOT NULL,
    "extracted_text"  TEXT,
    "extraction_note" TEXT,
    "report_date"     TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "deleted_at"      TIMESTAMP(3),
    CONSTRAINT "medical_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_navigations" (
    "id"                   TEXT NOT NULL,
    "user_id"              TEXT NOT NULL,
    "report_id"            TEXT,
    "symptoms"             TEXT,
    "department_id"        TEXT,
    "suggested_department" TEXT,
    "reasoning"            TEXT,
    "confidence"           TEXT,
    "model_used"           TEXT,
    "failed"               BOOLEAN NOT NULL DEFAULT false,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_navigations_pkey" PRIMARY KEY ("id")
);

-- Every read of these tables is filtered by owner, so the owner column leads.
CREATE INDEX IF NOT EXISTS "medical_reports_user_id_deleted_at_idx"
    ON "medical_reports" ("user_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "ai_navigations_user_id_created_at_idx"
    ON "ai_navigations" ("user_id", "created_at");

ALTER TABLE "medical_reports"
    ADD CONSTRAINT "medical_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medical_reports"
    ADD CONSTRAINT "medical_reports_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_navigations"
    ADD CONSTRAINT "ai_navigations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_navigations"
    ADD CONSTRAINT "ai_navigations_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "medical_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_navigations"
    ADD CONSTRAINT "ai_navigations_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
