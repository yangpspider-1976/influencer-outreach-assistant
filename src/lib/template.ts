/**
 * §9 / FR-015 — template variable rendering.
 *
 * Pure module. Unresolved *required* variables are deliberately left in the
 * output as `{{token}}` so the workspace can highlight them and so a record
 * can never be marked Sent with information silently dropped (AC / §9).
 */

export type VariableToken =
  | "first_name"
  | "influencer_name"
  | "restaurant_name"
  | "campaign_location"
  | "visit_period"
  | "deliverables"
  | "compensation"
  | "application_deadline"
  | "campaign_manager_name"
  | "brief_link";

export type VariableDefinition = {
  token: VariableToken;
  label: string;
  source: string;
  /** Required variables block a silent send when unresolved. */
  required: boolean;
  fallbackNote: string;
};

/** §9 variable table. */
export const VARIABLE_CATALOG: VariableDefinition[] = [
  {
    token: "first_name",
    label: "First name",
    source: "Influencer first name or display name",
    required: true,
    fallbackNote: "Falls back to the display name; unresolved if both are empty.",
  },
  {
    token: "influencer_name",
    label: "Influencer name",
    source: "Influencer display name",
    required: true,
    fallbackNote: "Required.",
  },
  {
    token: "restaurant_name",
    label: "Client / restaurant",
    source: "Campaign client",
    required: true,
    fallbackNote: "Required.",
  },
  {
    token: "campaign_location",
    label: "Campaign location",
    source: "Campaign location",
    required: true,
    fallbackNote: "Required.",
  },
  {
    token: "visit_period",
    label: "Visit period",
    source: "Formatted campaign dates",
    required: true,
    fallbackNote: "Required.",
  },
  {
    token: "deliverables",
    label: "Deliverables",
    source: "Campaign deliverables",
    required: true,
    fallbackNote: "Uses the copy-safe short form when provided.",
  },
  {
    token: "compensation",
    label: "Compensation",
    source: "Campaign compensation",
    required: true,
    fallbackNote: "Required.",
  },
  {
    token: "application_deadline",
    label: "Application deadline",
    source: "Formatted campaign deadline",
    required: true,
    fallbackNote:
      "Write it as {{application_deadline?}} to drop the whole line when no deadline is set.",
  },
  {
    token: "campaign_manager_name",
    label: "Campaign manager",
    source: "Assigned campaign owner",
    required: false,
    fallbackNote: "Falls back to the organization name.",
  },
  {
    token: "brief_link",
    label: "Brief link",
    source: "Authorized campaign brief link",
    required: false,
    fallbackNote: "Omitted unless the campaign explicitly enables brief links (§9).",
  },
];

const CATALOG_BY_TOKEN = new Map(VARIABLE_CATALOG.map((v) => [v.token as string, v]));

/** `{{token}}` or `{{token?}}` (optional marker). Whitespace tolerant. */
const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*(\?)?\s*\}\}/g;

export type TemplateContext = Partial<Record<VariableToken, string | null | undefined>>;

export type RenderedToken = {
  token: string;
  optional: boolean;
  known: boolean;
  required: boolean;
  resolved: boolean;
  value: string | null;
};

export type RenderResult = {
  /** Final text. Unresolved required tokens remain as `{{token}}`. */
  text: string;
  tokens: RenderedToken[];
  /** Required tokens with no value — must be surfaced before Mark Sent. */
  unresolvedRequired: string[];
  /** Tokens present in the template but not part of the catalog. */
  unknownTokens: string[];
  /** Lines dropped because an optional token had no value. */
  removedLines: number;
};

export function extractTokens(content: string): { token: string; optional: boolean }[] {
  const found = new Map<string, { token: string; optional: boolean }>();
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    const optional = match[2] === "?";
    const existing = found.get(token);
    // If a token appears both ways, the strictest (required) reading wins.
    if (!existing || (existing.optional && !optional)) {
      found.set(token, { token, optional });
    }
  }
  return [...found.values()];
}

function valueOf(context: TemplateContext, token: string): string | null {
  const raw = (context as Record<string, string | null | undefined>)[token];
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function renderTemplate(content: string, context: TemplateContext): RenderResult {
  const tokens = new Map<string, RenderedToken>();
  const unknownTokens = new Set<string>();
  let removedLines = 0;

  const lines = content.split("\n");
  const outputLines: string[] = [];

  for (const line of lines) {
    let dropLine = false;

    const rendered = line.replace(TOKEN_PATTERN, (_full, rawToken: string, optMark?: string) => {
      const token = rawToken;
      const optional = optMark === "?";
      const definition = CATALOG_BY_TOKEN.get(token);
      const known = Boolean(definition);
      if (!known) unknownTokens.add(token);

      const value = valueOf(context, token);
      const required = known ? Boolean(definition!.required) && !optional : !optional;
      const resolved = value !== null;

      const previous = tokens.get(token);
      if (!previous || (previous.resolved && !resolved)) {
        tokens.set(token, { token, optional, known, required, resolved, value });
      }

      if (resolved) return value!;
      if (optional) {
        // §9 — remove the sentence only when the template marks it optional.
        dropLine = true;
        return "";
      }
      // Left in place so the operator sees exactly what is missing.
      return `{{${token}}}`;
    });

    if (dropLine) {
      removedLines += 1;
      continue;
    }
    outputLines.push(rendered);
  }

  const tokenList = [...tokens.values()];
  return {
    text: outputLines.join("\n"),
    tokens: tokenList,
    unresolvedRequired: tokenList.filter((t) => t.required && !t.resolved).map((t) => t.token),
    unknownTokens: [...unknownTokens],
    removedLines,
  };
}

/** Any `{{...}}` still present in operator-edited text is unresolved. */
export function findUnresolvedTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN_PATTERN)].map((m) => m[1]))];
}

/**
 * §12 — warn when identical copy is reused without personalization.
 * Deliberately reports similarity only; it never asserts that any volume of
 * messaging is safe (§16).
 */
export function personalizationSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const left = normalize(a);
  const right = normalize(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;

  const shingles = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i + 4 <= s.length; i += 1) set.add(s.slice(i, i + 4));
    return set;
  };
  const leftSet = shingles(left);
  const rightSet = shingles(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  for (const shingle of leftSet) if (rightSet.has(shingle)) intersection += 1;
  return intersection / (leftSet.size + rightSet.size - intersection);
}

export const DEFAULT_TEMPLATE_CONTENT = `Hi {{first_name}},

We are QROAD, an influencer marketing agency supporting {{restaurant_name}} in {{campaign_location}}. We would like to invite you to join an upcoming restaurant campaign.

Campaign details
- Visit period: {{visit_period}}
- Deliverables: {{deliverables}}
- Compensation: {{compensation}}
- Application deadline: {{application_deadline?}}

Please let us know if you are interested. We will send the full campaign brief after your reply.

Thank you,
{{campaign_manager_name}}
QROAD Influencer Marketing Team`;
