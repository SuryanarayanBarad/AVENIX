-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "consultation_fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "experience_years" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "photo_url" TEXT,
ADD COLUMN     "qualification" TEXT;

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "appointment_id" TEXT,
ADD COLUMN     "doctor_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE INDEX "appointments_doctor_id_date_idx" ON "appointments"("doctor_id", "date");

-- CreateIndex
CREATE INDEX "appointments_user_id_idx" ON "appointments"("user_id");

-- CreateIndex
CREATE INDEX "tokens_doctor_id_status_idx" ON "tokens"("doctor_id", "status");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
