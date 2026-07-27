-- AlterTable
ALTER TABLE "influencers" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "influencers_isDemo_idx" ON "influencers"("isDemo");

-- Backfill: mark influencers seeded for the demo dataset. They are the ones
-- attached to the fixed demo campaigns; real (imported/discovered) creators are
-- left as isDemo = false. New demo seeds set the flag directly.
UPDATE "influencers" SET "isDemo" = true
WHERE "id" IN (
  SELECT DISTINCT "influencerId" FROM "campaign_influencers"
  WHERE "campaignId" IN ('seed-campaign-abc', 'seed-campaign-cafe')
);
