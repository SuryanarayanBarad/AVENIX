/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `doctors` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'Pending';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Approved';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Denied';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Missed';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'appointment_requested';
ALTER TYPE "NotificationType" ADD VALUE 'appointment_approved';
ALTER TYPE "NotificationType" ADD VALUE 'appointment_denied';
ALTER TYPE "NotificationType" ADD VALUE 'appointment_reminder';
ALTER TYPE "NotificationType" ADD VALUE 'patient_waiting';

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "recipient_email" TEXT,
ALTER COLUMN "previous_time" DROP NOT NULL,
ALTER COLUMN "new_time" DROP NOT NULL,
ALTER COLUMN "recipient_phone_masked" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
