"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api, ClientApiError } from "@/lib/client-api";
import type { DemoAccount } from "@/lib/demo-accounts";

function syncInputValue(input: HTMLInputElement | null, value: string) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";
  const expired = params.get("expired") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    expired ? "Your session expired. Sign in again to continue." : null,
  );
  const [pending, setPending] = useState(false);
  const [filled, setFilled] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email, password });
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? caught.message
          : "Sign-in failed. Try again in a moment.",
      );
      setPending(false);
    }
  }

  function fillDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    syncInputValue(emailRef.current, account.email);
    syncInputValue(passwordRef.current, account.password);
    setError(null);
    setFilled(account.email);
    emailRef.current?.focus();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError>{error}</FormError>

        <Field label="Work email" htmlFor="email" required>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@qroad.test"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          hint="Forgot your password? Ask an administrator to issue a new one."
        >
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {/*
        Development convenience only. `demoAccounts` is null in production, so
        this block — and the credentials — never reach a production build.
      */}
      {demoAccounts ? (
        <section
          aria-label="Demo accounts for development"
          className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4"
        >
          <div className="flex items-center gap-2">
            <Wrench className="size-3.5 text-amber-700" aria-hidden />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Development only
            </h2>
          </div>
          <p className="mt-1.5 text-[12px] leading-5 text-amber-900/80">
            Fill the form with a seeded demo account, then press Sign in.
          </p>

          <ul className="mt-3 grid gap-1.5">
            {demoAccounts.map((account) => {
              const isFilled = filled === account.email;
              return (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => fillDemo(account)}
                    title={account.hint}
                    aria-label={`Fill credentials for ${account.roleLabel}`}
                    className={`flex w-full items-baseline justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      isFilled
                        ? "border-amber-400 bg-white"
                        : "border-transparent bg-white/70 hover:border-amber-300 hover:bg-white"
                    }`}
                  >
                    <span className="text-[12px] font-medium text-slate-800">
                      {account.roleLabel}
                    </span>
                    <span className="truncate font-mono text-[11px] text-slate-500">
                      {account.email}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p aria-live="polite" className="mt-2.5 min-h-4 text-[11px] text-amber-900/70">
            {filled ? `Filled ${filled} — press Sign in to continue.` : null}
          </p>
        </section>
      ) : null}
    </div>
  );
}
