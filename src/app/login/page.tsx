import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand";
import { getDemoAccounts } from "@/lib/demo-accounts";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Deep check: only send genuinely signed-in users to the dashboard. A cookie
  // whose JWT is still valid but whose user is gone/disabled returns null here,
  // so the form renders instead of bouncing — no redirect loop with the proxy.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // null in production — the credentials are never sent to the browser.
  const demoAccounts = getDemoAccounts();
  return (
    <main className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <BrandMark className="size-10 rounded-xl text-base" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            QROAD Influencer Outreach Assistant. Campaign and influencer data is only accessible to
            signed-in staff.
          </p>

          <div className="mt-8">
            <Suspense fallback={<div className="h-64" />}>
              <LoginForm demoAccounts={demoAccounts} />
            </Suspense>
          </div>

          <p className="mt-10 text-[12px] leading-5 text-slate-400">
            Internal system. Access is logged. This tool never signs in to Facebook or Instagram on
            your behalf and never sends a message for you.
          </p>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-slate-50 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#dbeafe,transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
            Human-in-the-loop by design
          </p>
          <h2 className="mt-4 max-w-md text-[28px] font-semibold leading-9 tracking-tight text-slate-900">
            Prepare the work automatically. Keep the send button human.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
            The assistant centralizes campaign details, imports and validates influencer lists,
            renders approved copy and tracks every outcome — while the operator reviews, pastes and
            sends each first-contact DM personally.
          </p>

          <ol className="mt-10 max-w-md space-y-3">
            {[
              "Upload and validate the influencer list",
              "Render the approved, personalized message",
              "Open the saved profile in a new tab",
              "Paste, review and send it yourself",
              "Record the outcome and schedule follow-up",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="text-[13px] leading-5 text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </main>
  );
}
