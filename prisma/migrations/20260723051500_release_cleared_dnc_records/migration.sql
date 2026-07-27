-- Repair campaign records left in DO_NOT_CONTACT after the creator-level DNC
-- flag was cleared. NOT_CONTACTED keeps the record out of the send queue.
UPDATE "campaign_influencers" AS record
SET
  "outreachStatus" = 'NOT_CONTACTED',
  "pipelineStatus" = 'NONE',
  "dueAt" = NULL,
  "dncOverrideById" = NULL,
  "dncOverrideAt" = NULL,
  "dncOverrideReason" = NULL,
  "version" = record."version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "influencers" AS influencer
WHERE
  record."influencerId" = influencer."id"
  AND influencer."dncFlag" = false
  AND record."outreachStatus" = 'DO_NOT_CONTACT';

-- Campaign-specific exceptions are no longer active once the global DNC flag
-- is cleared. Expire them so a later opt-out cannot reuse a stale override.
UPDATE "campaign_influencers" AS record
SET
  "dncOverrideById" = NULL,
  "dncOverrideAt" = NULL,
  "dncOverrideReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "influencers" AS influencer
WHERE
  record."influencerId" = influencer."id"
  AND influencer."dncFlag" = false
  AND record."dncOverrideById" IS NOT NULL;
