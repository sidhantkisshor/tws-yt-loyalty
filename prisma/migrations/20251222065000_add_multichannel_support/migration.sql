/*
  Warnings:

  - You are about to drop the column `viewerId` on the `ViewerAccount` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ViewerAccount" DROP CONSTRAINT "ViewerAccount_viewerId_fkey";

-- DropIndex
DROP INDEX "ViewerAccount_viewerId_key";

-- AlterTable
ALTER TABLE "Viewer" ADD COLUMN     "viewerAccountId" TEXT;

-- AlterTable
ALTER TABLE "ViewerAccount" DROP COLUMN "viewerId";

-- AddForeignKey
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_viewerAccountId_fkey" FOREIGN KEY ("viewerAccountId") REFERENCES "ViewerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
