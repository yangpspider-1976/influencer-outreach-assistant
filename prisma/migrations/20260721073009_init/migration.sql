-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('ADMIN', 'CAMPAIGN_MANAGER', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "ProfileValidity" AS ENUM ('UNKNOWN', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('NOT_CONTACTED', 'READY', 'SENT', 'FOLLOW_UP_DUE', 'REPLIED', 'INTERESTED', 'NEGOTIATING', 'CONFIRMED', 'DECLINED', 'NO_RESPONSE', 'INVALID', 'DUPLICATE', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('NONE', 'REPLIED', 'INTERESTED', 'NEGOTIATING', 'CONFIRMED', 'DECLINED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttemptType" AS ENUM ('FIRST_CONTACT', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('SENT', 'SKIPPED', 'INVALID', 'DUPLICATE', 'DO_NOT_CONTACT', 'SAVED_FOR_LATER');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'REJECTED', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissionSet" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "visitStart" TIMESTAMP(3) NOT NULL,
    "visitEnd" TIMESTAMP(3) NOT NULL,
    "deliverables" TEXT NOT NULL,
    "deliverablesShort" TEXT NOT NULL DEFAULT '',
    "compensation" TEXT NOT NULL,
    "applicationDeadline" TIMESTAMP(3),
    "targetCategory" TEXT NOT NULL DEFAULT '',
    "targetLocation" TEXT NOT NULL DEFAULT '',
    "briefUrl" TEXT,
    "briefFileKey" TEXT,
    "briefFileName" TEXT,
    "briefLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT NOT NULL DEFAULT '',
    "followUpOffsetDays" INTEGER[] DEFAULT ARRAY[3, 7]::INTEGER[],
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencers" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "category" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "followerCountRaw" TEXT,
    "followerCountNumeric" INTEGER,
    "email" TEXT,
    "phone" TEXT,
    "rate" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "dncFlag" BOOLEAN NOT NULL DEFAULT false,
    "dncReason" TEXT,
    "dncSetById" TEXT,
    "dncSetAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "usernameHint" TEXT,
    "preferredFlag" BOOLEAN NOT NULL DEFAULT false,
    "validityStatus" "ProfileValidity" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_tags" (
    "influencerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "influencer_tags_pkey" PRIMARY KEY ("influencerId","tagId")
);

-- CreateTable
CREATE TABLE "campaign_influencers" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "outreachStatus" "OutreachStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'NONE',
    "dueAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "quotedRate" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "draftMessage" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "queueOpenedAt" TIMESTAMP(3),
    "lastCopiedAt" TIMESTAMP(3),
    "lastProfileOpenAt" TIMESTAMP(3),
    "dncOverrideById" TEXT,
    "dncOverrideAt" TIMESTAMP(3),
    "dncOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_influencers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ANY',
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "lockedTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "versionNote" TEXT NOT NULL DEFAULT '',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_attempts" (
    "id" TEXT NOT NULL,
    "campaignInfluencerId" TEXT NOT NULL,
    "type" "AttemptType" NOT NULL DEFAULT 'FIRST_CONTACT',
    "channel" "Platform",
    "templateVersionId" TEXT,
    "preparedText" TEXT NOT NULL,
    "confirmedSentText" TEXT,
    "outcome" "AttemptOutcome" NOT NULL,
    "skipReasonId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "manualSendAffirmed" BOOLEAN NOT NULL DEFAULT false,
    "unresolvedAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "sentConfirmedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skip_reasons" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skip_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_tasks" (
    "id" TEXT NOT NULL,
    "campaignInfluencerId" TEXT NOT NULL,
    "attemptId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storedFileKey" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "sheetName" TEXT,
    "availableSheets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "headers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mapping" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "linkedExisting" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "uploadedById" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "influencerId" TEXT,
    "campaignInfluencerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL DEFAULT 'CSV',
    "filters" JSONB NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "storedFileKey" TEXT,
    "fileName" TEXT,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "campaignId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_name_key" ON "clients"("name");

-- CreateIndex
CREATE INDEX "campaigns_clientId_idx" ON "campaigns"("clientId");

-- CreateIndex
CREATE INDEX "campaigns_ownerId_idx" ON "campaigns"("ownerId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "influencers_displayName_idx" ON "influencers"("displayName");

-- CreateIndex
CREATE INDEX "influencers_dncFlag_idx" ON "influencers"("dncFlag");

-- CreateIndex
CREATE INDEX "social_profiles_influencerId_idx" ON "social_profiles"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_platform_normalizedUrl_key" ON "social_profiles"("platform", "normalizedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "campaign_influencers_campaignId_outreachStatus_idx" ON "campaign_influencers"("campaignId", "outreachStatus");

-- CreateIndex
CREATE INDEX "campaign_influencers_assigneeId_outreachStatus_idx" ON "campaign_influencers"("assigneeId", "outreachStatus");

-- CreateIndex
CREATE INDEX "campaign_influencers_dueAt_idx" ON "campaign_influencers"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_influencers_campaignId_influencerId_key" ON "campaign_influencers"("campaignId", "influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_currentVersionId_key" ON "message_templates"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_templateId_version_key" ON "template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "outreach_attempts_campaignInfluencerId_idx" ON "outreach_attempts"("campaignInfluencerId");

-- CreateIndex
CREATE INDEX "outreach_attempts_createdById_createdAt_idx" ON "outreach_attempts"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "skip_reasons_label_key" ON "skip_reasons"("label");

-- CreateIndex
CREATE INDEX "follow_up_tasks_status_dueAt_idx" ON "follow_up_tasks"("status", "dueAt");

-- CreateIndex
CREATE INDEX "follow_up_tasks_assignedToId_status_idx" ON "follow_up_tasks"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "imports_campaignId_idx" ON "imports"("campaignId");

-- CreateIndex
CREATE INDEX "import_rows_importId_status_idx" ON "import_rows"("importId", "status");

-- CreateIndex
CREATE INDEX "export_jobs_requestedById_status_idx" ON "export_jobs"("requestedById", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_campaignId_createdAt_idx" ON "audit_logs"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencers" ADD CONSTRAINT "influencers_dncSetById_fkey" FOREIGN KEY ("dncSetById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_tags" ADD CONSTRAINT "influencer_tags_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_tags" ADD CONSTRAINT "influencer_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_dncOverrideById_fkey" FOREIGN KEY ("dncOverrideById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_campaignInfluencerId_fkey" FOREIGN KEY ("campaignInfluencerId") REFERENCES "campaign_influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_skipReasonId_fkey" FOREIGN KEY ("skipReasonId") REFERENCES "skip_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_campaignInfluencerId_fkey" FOREIGN KEY ("campaignInfluencerId") REFERENCES "campaign_influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "outreach_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_campaignInfluencerId_fkey" FOREIGN KEY ("campaignInfluencerId") REFERENCES "campaign_influencers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
