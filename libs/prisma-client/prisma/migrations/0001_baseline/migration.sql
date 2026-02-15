-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FolderStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('PENDING', 'SCHEDULED', 'POSTED', 'RELEASED', 'DISPUTED', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'DRAFT', 'AWAITING_DEPOSIT', 'FUNDED', 'CONTENT_PENDING', 'CONTENT_SUBMITTED', 'CONTENT_APPROVED', 'AWAITING_VERIFICATION', 'VERIFIED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'ESCROW_LOCK', 'ESCROW_RELEASE', 'ESCROW_REFUND', 'FEE', 'BOOST_CHANNEL', 'BOOST_FOLDER', 'FOLDER_PLACEMENT', 'APPEAL_REVERSAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('TEXT', 'PHOTO', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('CONTENT_NOT_POSTED', 'WRONG_CONTENT', 'EARLY_DELETION', 'FAKE_STATISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "ChannelAdminRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FolderPlacementStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppealType" AS ENUM ('DEAL_DISPUTE_RESOLUTION', 'CHANNEL_REJECTION', 'FOLDER_REJECTION', 'PLACEMENT_REJECTION');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'UPHELD', 'REVERSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "photoUrl" TEXT,
    "walletAddress" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "balanceTon" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "frozenTon" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "appealFrozenTon" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "avatarKey" TEXT,
    "avatarUpdatedAt" TIMESTAMP(3),
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "pricePerPost" DECIMAL(20,9) NOT NULL,
    "formatPrices" JSONB,
    "categories" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "ChannelStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "boostAmount" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "boostUntil" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subscriberGrowthWeek" INTEGER NOT NULL DEFAULT 0,
    "subscriberGrowthMonth" INTEGER NOT NULL DEFAULT 0,
    "audienceGeo" JSONB,
    "peakHours" JSONB,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "hasVerifiedStats" BOOLEAN NOT NULL DEFAULT false,
    "languageStats" JSONB,
    "premiumStats" JSONB,
    "viewSourceStats" JSONB,
    "viewsHistory" JSONB,
    "followersHistory" JSONB,
    "lastStatsUpdate" TIMESTAMP(3),
    "telegramGrowthStats" JSONB,
    "channelCreatedAt" TIMESTAMP(3),
    "completedDealsCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgResponseTime" INTEGER,
    "adFormats" TEXT[],
    "postDuration" TEXT NOT NULL DEFAULT '24H',
    "restrictions" TEXT[],
    "allowsNativeAds" BOOLEAN NOT NULL DEFAULT true,
    "rejectedByAdminId" TEXT,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalBudget" DECIMAL(20,9) NOT NULL,
    "spentBudget" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "categories" TEXT[],
    "targetLanguages" TEXT[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "advertiserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "briefText" TEXT,
    "requirements" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "minSubscribers" INTEGER,
    "maxBudgetPerDeal" DECIMAL(20,9),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "folderLink" TEXT NOT NULL,
    "folderHash" TEXT,
    "categories" TEXT[],
    "status" "FolderStatus" NOT NULL DEFAULT 'PENDING',
    "boostAmount" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "boostUntil" TIMESTAMP(3),
    "pricePerChannel" DECIMAL(20,9),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "collectionDeadline" TIMESTAMP(3),
    "maxChannels" INTEGER,
    "minSubscribers" INTEGER,
    "syncedChannels" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "rejectedByAdminId" TEXT,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(20,9) NOT NULL,
    "platformFee" DECIMAL(20,9) NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "contentType" "ContentType" NOT NULL DEFAULT 'TEXT',
    "contentText" TEXT,
    "contentMediaUrls" TEXT[],
    "postUrl" TEXT,
    "postMessageId" INTEGER,
    "scheduledPostTime" TIMESTAMP(3),
    "actualPostTime" TIMESTAMP(3),
    "minViewsRequired" INTEGER,
    "viewsAtVerification" INTEGER,
    "verificationDeadline" TIMESTAMP(3),
    "disputeReason" "DisputeReason",
    "disputeDescription" TEXT,
    "campaignId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "channelOwnerId" TEXT NOT NULL,
    "briefText" TEXT,
    "briefMediaUrls" TEXT[],
    "draftContentText" TEXT,
    "draftContentMediaUrls" TEXT[],
    "contentRevisionNote" TEXT,
    "contentRevisionCount" INTEGER NOT NULL DEFAULT 0,
    "adFormat" TEXT,
    "resolvedByAdminId" TEXT,
    "appealDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStatusHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStatus" "DealStatus",
    "toStatus" "DealStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "tonTxHash" TEXT,
    "amount" DECIMAL(20,9) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "dealId" TEXT,
    "folderPlacementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAddress" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelStats" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subscriberCount" INTEGER NOT NULL,
    "avgViews" INTEGER NOT NULL,
    "postsCount" INTEGER NOT NULL,
    "engagement" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelReview" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "dealId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderPlacement" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelOwnerId" TEXT NOT NULL,
    "folderOwnerId" TEXT NOT NULL,
    "amount" DECIMAL(20,9) NOT NULL,
    "platformFee" DECIMAL(20,9) NOT NULL,
    "status" "FolderPlacementStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "rejectedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "escrowReleaseAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FolderPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "type" "AppealType" NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "appellantId" TEXT NOT NULL,
    "originalAdminId" TEXT,
    "reviewerAdminId" TEXT,
    "reason" TEXT NOT NULL,
    "adminNotes" TEXT,
    "dealId" TEXT,
    "channelId" TEXT,
    "folderId" TEXT,
    "folderPlacementId" TEXT,
    "frozenAmount" DECIMAL(20,9),
    "originalResolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelAdmin" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChannelAdminRole" NOT NULL DEFAULT 'ADMIN',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealMessage" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_telegramId_key" ON "Channel"("telegramId");

-- CreateIndex
CREATE INDEX "Channel_telegramId_idx" ON "Channel"("telegramId");

-- CreateIndex
CREATE INDEX "Channel_status_idx" ON "Channel"("status");

-- CreateIndex
CREATE INDEX "Channel_ownerId_idx" ON "Channel"("ownerId");

-- CreateIndex
CREATE INDEX "Channel_categories_idx" ON "Channel"("categories");

-- CreateIndex
CREATE INDEX "Channel_language_idx" ON "Channel"("language");

-- CreateIndex
CREATE INDEX "Channel_subscriberCount_idx" ON "Channel"("subscriberCount");

-- CreateIndex
CREATE INDEX "Channel_pricePerPost_idx" ON "Channel"("pricePerPost");

-- CreateIndex
CREATE INDEX "Channel_boostAmount_idx" ON "Channel"("boostAmount");

-- CreateIndex
CREATE INDEX "Channel_rating_idx" ON "Channel"("rating");

-- CreateIndex
CREATE INDEX "Channel_completedDealsCount_idx" ON "Channel"("completedDealsCount");

-- CreateIndex
CREATE INDEX "Campaign_advertiserId_idx" ON "Campaign"("advertiserId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_isPublic_status_idx" ON "Campaign"("isPublic", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_folderLink_key" ON "Folder"("folderLink");

-- CreateIndex
CREATE INDEX "Folder_ownerId_idx" ON "Folder"("ownerId");

-- CreateIndex
CREATE INDEX "Folder_status_idx" ON "Folder"("status");

-- CreateIndex
CREATE INDEX "Folder_boostAmount_idx" ON "Folder"("boostAmount");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_campaignId_idx" ON "Deal"("campaignId");

-- CreateIndex
CREATE INDEX "Deal_channelId_idx" ON "Deal"("channelId");

-- CreateIndex
CREATE INDEX "Deal_advertiserId_idx" ON "Deal"("advertiserId");

-- CreateIndex
CREATE INDEX "Deal_channelOwnerId_idx" ON "Deal"("channelOwnerId");

-- CreateIndex
CREATE INDEX "Deal_scheduledPostTime_idx" ON "Deal"("scheduledPostTime");

-- CreateIndex
CREATE INDEX "Deal_verificationDeadline_idx" ON "Deal"("verificationDeadline");

-- CreateIndex
CREATE INDEX "Deal_appealDeadline_idx" ON "Deal"("appealDeadline");

-- CreateIndex
CREATE INDEX "DealStatusHistory_dealId_idx" ON "DealStatusHistory"("dealId");

-- CreateIndex
CREATE INDEX "DealStatusHistory_createdAt_idx" ON "DealStatusHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_tonTxHash_key" ON "Transaction"("tonTxHash");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_dealId_idx" ON "Transaction"("dealId");

-- CreateIndex
CREATE INDEX "Transaction_folderPlacementId_idx" ON "Transaction"("folderPlacementId");

-- CreateIndex
CREATE INDEX "Transaction_tonTxHash_idx" ON "Transaction"("tonTxHash");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_memo_key" ON "DepositAddress"("memo");

-- CreateIndex
CREATE INDEX "DepositAddress_userId_idx" ON "DepositAddress"("userId");

-- CreateIndex
CREATE INDEX "DepositAddress_memo_idx" ON "DepositAddress"("memo");

-- CreateIndex
CREATE INDEX "DepositAddress_isActive_idx" ON "DepositAddress"("isActive");

-- CreateIndex
CREATE INDEX "DepositAddress_expiresAt_idx" ON "DepositAddress"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ChannelStats_channelId_idx" ON "ChannelStats"("channelId");

-- CreateIndex
CREATE INDEX "ChannelStats_date_idx" ON "ChannelStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelStats_channelId_date_key" ON "ChannelStats"("channelId", "date");

-- CreateIndex
CREATE INDEX "ChannelReview_channelId_idx" ON "ChannelReview"("channelId");

-- CreateIndex
CREATE INDEX "ChannelReview_reviewerId_idx" ON "ChannelReview"("reviewerId");

-- CreateIndex
CREATE INDEX "ChannelReview_rating_idx" ON "ChannelReview"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReview_channelId_reviewerId_dealId_key" ON "ChannelReview"("channelId", "reviewerId", "dealId");

-- CreateIndex
CREATE INDEX "FolderPlacement_folderId_idx" ON "FolderPlacement"("folderId");

-- CreateIndex
CREATE INDEX "FolderPlacement_channelId_idx" ON "FolderPlacement"("channelId");

-- CreateIndex
CREATE INDEX "FolderPlacement_channelOwnerId_idx" ON "FolderPlacement"("channelOwnerId");

-- CreateIndex
CREATE INDEX "FolderPlacement_folderOwnerId_idx" ON "FolderPlacement"("folderOwnerId");

-- CreateIndex
CREATE INDEX "FolderPlacement_status_idx" ON "FolderPlacement"("status");

-- CreateIndex
CREATE INDEX "FolderPlacement_escrowReleaseAt_idx" ON "FolderPlacement"("escrowReleaseAt");

-- CreateIndex
CREATE UNIQUE INDEX "FolderPlacement_folderId_channelId_key" ON "FolderPlacement"("folderId", "channelId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Appeal_appellantId_idx" ON "Appeal"("appellantId");

-- CreateIndex
CREATE INDEX "Appeal_status_idx" ON "Appeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_dealId_type_key" ON "Appeal"("dealId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_channelId_type_key" ON "Appeal"("channelId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_folderId_type_key" ON "Appeal"("folderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_folderPlacementId_type_key" ON "Appeal"("folderPlacementId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "ChannelAdmin_channelId_idx" ON "ChannelAdmin"("channelId");

-- CreateIndex
CREATE INDEX "ChannelAdmin_userId_idx" ON "ChannelAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAdmin_channelId_userId_key" ON "ChannelAdmin"("channelId", "userId");

-- CreateIndex
CREATE INDEX "DealMessage_dealId_createdAt_idx" ON "DealMessage"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "DealMessage_senderId_idx" ON "DealMessage"("senderId");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_channelOwnerId_fkey" FOREIGN KEY ("channelOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusHistory" ADD CONSTRAINT "DealStatusHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_folderPlacementId_fkey" FOREIGN KEY ("folderPlacementId") REFERENCES "FolderPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelStats" ADD CONSTRAINT "ChannelStats_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReview" ADD CONSTRAINT "ChannelReview_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_channelOwnerId_fkey" FOREIGN KEY ("channelOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderPlacement" ADD CONSTRAINT "FolderPlacement_folderOwnerId_fkey" FOREIGN KEY ("folderOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_appellantId_fkey" FOREIGN KEY ("appellantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_folderPlacementId_fkey" FOREIGN KEY ("folderPlacementId") REFERENCES "FolderPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAdmin" ADD CONSTRAINT "ChannelAdmin_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAdmin" ADD CONSTRAINT "ChannelAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

