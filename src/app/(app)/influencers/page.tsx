import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, Users } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { has } from "@/lib/rbac";
import { formatCompactNumber } from "@/lib/format";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-url";
import { Page } from "@/components/ui/page";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";
import { InfluencerFilters } from "./influencer-filters";
import { ExportButton } from "@/components/export-button";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Influencer database" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    category?: string;
    location?: string;
    channel?: string;
    dnc?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "influencers_view")) redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1), 1);

  // Demo/actual separation is a development affordance only — production data
  // never carries the demo flag, so the tabs are hidden there.
  const showTabs = !env.isProduction;
  const view = params.view === "demo" ? "demo" : "actual";

  const baseWhere: Prisma.InfluencerWhereInput = {
    archivedAt: null,
    ...(params.category ? { category: { contains: params.category, mode: "insensitive" } } : {}),
    ...(params.location ? { location: { contains: params.location, mode: "insensitive" } } : {}),
    ...(params.channel ? { profiles: { some: { platform: params.channel as never } } } : {}),
    ...(params.dnc === "true" ? { dncFlag: true } : {}),
    ...(params.search
      ? {
          OR: [
            { displayName: { contains: params.search, mode: "insensitive" } },
            { email: { contains: params.search, mode: "insensitive" } },
            { profiles: { some: { normalizedUrl: { contains: params.search.toLowerCase() } } } },
          ],
        }
      : {}),
  };

  const where: Prisma.InfluencerWhereInput = showTabs
    ? { ...baseWhere, isDemo: view === "demo" }
    : baseWhere;

  const [influencers, total, categories, demoCount, actualCount] = await Promise.all([
    prisma.influencer.findMany({
      where,
      orderBy: { displayName: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        profiles: true,
        tags: { include: { tag: true } },
        _count: { select: { records: true } },
      },
    }),
    prisma.influencer.count({ where }),
    prisma.influencer.findMany({
      where: { category: { not: "" } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
      take: 50,
    }),
    showTabs ? prisma.influencer.count({ where: { ...baseWhere, isDemo: true } }) : Promise.resolve(0),
    showTabs ? prisma.influencer.count({ where: { ...baseWhere, isDemo: false } }) : Promise.resolve(0),
  ]);

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const tabs = [
    { key: "actual", label: "Actual", count: actualCount },
    { key: "demo", label: "Demo", count: demoCount },
  ] as const;

  return (
    <Page>
      <PageHeader
        title="Influencer database"
        description="Every creator QROAD has worked with or imported. Follower counts come from your own lists — nothing is collected from social platforms."
        actions={
          has(user.permissions, "export_data") ? (
            <ExportButton entity="influencers" filters={{ search: params.search ?? null }} />
          ) : null
        }
      />

      <Card className="mt-7">
        {showTabs ? (
          <div className="flex items-center gap-5 border-b border-slate-200 px-5 pt-3">
            {tabs.map((tab) => {
              const active = view === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={{
                    pathname: "/influencers",
                    query: { ...params, view: tab.key, page: undefined },
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      active ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
        <InfluencerFilters categories={categories.map((row) => row.category)} />

        {influencers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" aria-hidden />}
            title="No creators match these filters"
            description={
              showTabs && view === "actual"
                ? "Creators you import or add from discovery appear here. The seeded sample data is on the Demo tab."
                : "Import a list from a campaign to grow the database."
            }
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th>Creator</Th>
                  <Th>Channels</Th>
                  <Th>Category</Th>
                  <Th>Location</Th>
                  <Th className="text-right">Followers</Th>
                  <Th className="text-right">Campaigns</Th>
                  <Th>Tags</Th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((influencer) => (
                  <Tr key={influencer.id}>
                    <Td>
                      <Link
                        href={`/influencers/${influencer.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {influencer.displayName}
                      </Link>
                      {influencer.dncFlag ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                          <ShieldAlert className="size-3" aria-hidden />
                          DNC
                        </span>
                      ) : null}
                      {influencer.email ? (
                        <p className="mt-0.5 truncate text-[12px] text-slate-500">
                          {influencer.email}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {influencer.profiles.length === 0 ? (
                          <span className="text-[12px] text-slate-400">—</span>
                        ) : (
                          influencer.profiles.map((profile) => (
                            <a
                              key={profile.id}
                              href={profile.originalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100"
                            >
                              {SOCIAL_PLATFORM_LABELS[profile.platform]}
                            </a>
                          ))
                        )}
                      </div>
                    </Td>
                    <Td className="text-[13px]">{influencer.category || "—"}</Td>
                    <Td className="text-[13px]">{influencer.location || "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {influencer.followerCountNumeric
                        ? formatCompactNumber(influencer.followerCountNumeric)
                        : influencer.followerCountRaw || "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{influencer._count.records}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {influencer.tags.slice(0, 3).map((link) => (
                          <Badge key={link.tagId}>{link.tag.name}</Badge>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + influencers.length} of{" "}
                {total}
              </span>
              <span className="flex items-center gap-3">
                {page > 1 ? (
                  <Link
                    href={{ pathname: "/influencers", query: { ...params, page: page - 1 } }}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Previous
                  </Link>
                ) : null}
                <span>
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link
                    href={{ pathname: "/influencers", query: { ...params, page: page + 1 } }}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Next
                  </Link>
                ) : null}
              </span>
            </div>
          </>
        )}
      </Card>
    </Page>
  );
}
