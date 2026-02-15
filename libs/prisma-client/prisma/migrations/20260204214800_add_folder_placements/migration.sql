-- CreateEnum
CREATE TYPE "FolderPlacementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'FOLDER_PLACEMENT';

-- AlterTable Folder
ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "pricePerChannel" DECIMAL(20,9);

-- CreateTable FolderPlacement
CREATE TABLE IF NOT EXISTS "FolderPlacement" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelOwnerId" TEXT NOT NULL,
    "folderOwnerId" TEXT NOT NULL,
    "amount" DECIMAL(20,9) NOT NULL,
    "platformFee" DECIMAL(20,9) NOT NULL,
    "status" "FolderPlacementStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "FolderPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FolderPlacement_folderId_channelId_key" ON "FolderPlacement"("folderId", "channelId");
CREATE INDEX IF NOT EXISTS "FolderPlacement_folderId_idx" ON "FolderPlacement"("folderId");
CREATE INDEX IF NOT EXISTS "FolderPlacement_channelId_idx" ON "FolderPlacement"("channelId");
CREATE INDEX IF NOT EXISTS "FolderPlacement_channelOwnerId_idx" ON "FolderPlacement"("channelOwnerId");
CREATE INDEX IF NOT EXISTS "FolderPlacement_folderOwnerId_idx" ON "FolderPlacement"("folderOwnerId");
CREATE INDEX IF NOT EXISTS "FolderPlacement_status_idx" ON "FolderPlacement"("status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FolderPlacement_folderId_fkey'
    ) THEN
        ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_folderId_fkey"
          FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FolderPlacement_channelId_fkey'
    ) THEN
        ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_channelId_fkey"
          FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FolderPlacement_channelOwnerId_fkey'
    ) THEN
        ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_channelOwnerId_fkey"
          FOREIGN KEY ("channelOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FolderPlacement_folderOwnerId_fkey'
    ) THEN
        ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_folderOwnerId_fkey"
          FOREIGN KEY ("folderOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
