-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('DIGITAL', 'PHYSICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'SHIPPED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'WATCH_TIME';

-- AlterTable
ALTER TABLE "RewardConfig" ADD COLUMN     "requiresShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewardType" "RewardType" NOT NULL DEFAULT 'DIGITAL',
ADD COLUMN     "stockQuantity" INTEGER;

-- AlterTable
ALTER TABLE "RewardRedemption" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingCountry" TEXT,
ADD COLUMN     "shippingName" TEXT,
ADD COLUMN     "shippingPhone" TEXT,
ADD COLUMN     "shippingState" TEXT,
ADD COLUMN     "shippingZip" TEXT,
ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "StreamAttendance" ADD COLUMN     "estimatedWatchTimeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "watchTimePoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Viewer" ADD COLUMN     "totalWatchTimeMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ViewerAccount" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViewerAccount_viewerId_key" ON "ViewerAccount"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewerAccount_googleId_key" ON "ViewerAccount"("googleId");

-- CreateIndex
CREATE INDEX "ViewerAccount_googleId_idx" ON "ViewerAccount"("googleId");

-- CreateIndex
CREATE INDEX "ViewerAccount_email_idx" ON "ViewerAccount"("email");

-- CreateIndex
CREATE INDEX "RewardRedemption_deliveryStatus_idx" ON "RewardRedemption"("deliveryStatus");

-- AddForeignKey
ALTER TABLE "ViewerAccount" ADD CONSTRAINT "ViewerAccount_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
