import { z } from "zod";
import { OUTREACH_STATUSES, PIPELINE_LANES } from "./status";

/** §7 Campaign Configuration Requirements. */
export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(3, "Use at least 3 characters.").max(150),
    clientId: z.string().trim().min(1).optional(),
    clientName: z.string().trim().min(2).max(150).optional(),
    location: z.string().trim().min(1, "Campaign location is required.").max(150),
    visitStart: z.coerce.date(),
    visitEnd: z.coerce.date(),
    deliverables: z.string().trim().min(1, "Deliverables are required.").max(4000),
    deliverablesShort: z.string().trim().max(300).default(""),
    compensation: z.string().trim().min(1, "Compensation is required.").max(500),
    applicationDeadline: z.coerce.date().nullable().optional(),
    targetCategory: z.string().trim().max(200).default(""),
    targetLocation: z.string().trim().max(200).default(""),
    briefUrl: z.string().trim().url("Enter a valid URL.").nullable().optional().or(z.literal("")),
    briefLinkEnabled: z.boolean().default(false),
    ownerId: z.string().trim().min(1, "An internal owner is required."),
    templateId: z.string().trim().nullable().optional(),
    notes: z.string().trim().max(4000).default(""),
    followUpOffsetDays: z.array(z.number().int().min(1).max(365)).max(2).default([3, 7]),
  })
  .refine((value) => value.clientId || value.clientName, {
    message: "Select an existing client or enter a new client name.",
    path: ["clientName"],
  })
  // §7 — "Validate end >= start."
  .refine((value) => value.visitEnd >= value.visitStart, {
    message: "The visit end date must be on or after the start date.",
    path: ["visitEnd"],
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const templateInputSchema = z.object({
  name: z.string().trim().min(3).max(150),
  platform: z.enum(["ANY", "INSTAGRAM", "FACEBOOK"]).default("ANY"),
  language: z.string().trim().min(2).max(10).default("en"),
  description: z.string().trim().max(500).default(""),
  content: z.string().trim().min(20, "A template needs at least 20 characters."),
  versionNote: z.string().trim().max(500).default(""),
  lockedTokens: z.array(z.string()).default([]),
});

export const outcomeSchema = z.object({
  outcome: z.enum(["SENT", "SKIPPED", "INVALID", "DUPLICATE", "DO_NOT_CONTACT", "SAVED_FOR_LATER"]),
  version: z.number().int().min(0),
  channel: z.enum(["INSTAGRAM", "FACEBOOK"]).nullable().optional(),
  confirmedText: z.string().max(20000).nullable().optional(),
  preparedText: z.string().max(20000),
  skipReasonId: z.string().nullable().optional(),
  note: z.string().max(2000).default(""),
  manualSendAffirmed: z.boolean().default(false),
  unresolvedAcknowledged: z.boolean().default(false),
  dncReason: z.string().max(500).nullable().optional(),
});

export const statusChangeSchema = z.object({
  status: z.enum(OUTREACH_STATUSES),
  version: z.number().int().min(0).optional(),
  note: z.string().max(2000).optional(),
  quotedRate: z.string().max(200).nullable().optional(),
  overrideReason: z.string().max(500).optional(),
});

export const pipelineUpdateSchema = z.object({
  lane: z.enum(PIPELINE_LANES),
  note: z.string().max(2000).optional(),
  quotedRate: z.string().max(200).nullable().optional(),
});

export const assignSchema = z.object({
  recordIds: z.array(z.string().min(1)).min(1, "Select at least one record."),
  assigneeId: z.string().min(1).nullable(),
  priority: z.number().int().min(0).max(100).optional(),
  /** Marks the selected records Ready to Send once assigned. */
  markReady: z.boolean().default(true),
});

export const influencerUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  firstName: z.string().trim().max(100).nullable().optional(),
  category: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  followerCountRaw: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(50).nullable().optional(),
  rate: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const discoverySearchSchema = z
  .object({
    keywords: z.string().trim().max(200).default(""),
    categories: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    locations: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    channels: z
      .array(z.enum(["INSTAGRAM", "FACEBOOK"]))
      .min(1, "Select at least one channel.")
      .max(2),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .refine((value) => value.keywords || value.categories.length > 0 || value.locations.length > 0, {
    message: "Add keywords, a category, or a location to search.",
    path: ["keywords"],
  });

export type DiscoverySearchInput = z.infer<typeof discoverySearchSchema>;

export const discoverySaveSchema = z.object({
  category: z.string().trim().max(100).default(""),
  location: z.string().trim().max(100).default(""),
  profiles: z
    .array(
      z.object({
        platform: z.enum(["INSTAGRAM", "FACEBOOK"]),
        profileUrl: z.string().trim().url().max(500),
        displayName: z.string().trim().min(1).max(200),
      }),
    )
    .min(1, "Select at least one result.")
    .max(20),
});

export const addToCampaignSchema = z.object({
  influencerId: z.string().min(1, "Choose a creator to add."),
});

export const dncSchema = z.object({
  dnc: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const dncOverrideSchema = z.object({
  recordId: z.string().min(1),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters."),
});

export const mappingSchema = z.object({
  sheetName: z.string().nullable().optional(),
  mapping: z.record(z.string(), z.string().nullable()),
});

export const commitSchema = z.object({
  rowIds: z.array(z.string().min(1)).min(1, "Select at least one row to import."),
});

export const exportSchema = z.object({
  entity: z.enum(["campaign_records", "influencers", "follow_ups", "audit_logs"]),
  format: z.enum(["CSV", "XLSX"]).default("CSV"),
  filters: z
    .object({
      campaignId: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      assigneeId: z.string().nullable().optional(),
      channel: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      search: z.string().nullable().optional(),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
    })
    .default({}),
});

export const userInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(150),
  roleKey: z.enum(["ADMIN", "CAMPAIGN_MANAGER", "OPERATOR", "VIEWER"]),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(200)
    .optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const followUpUpdateSchema = z.object({
  status: z.enum(["COMPLETED", "CANCELLED"]),
  note: z.string().max(2000).optional(),
});
