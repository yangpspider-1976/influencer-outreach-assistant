import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Consistent page gutters and vertical rhythm across every screen. */
export function Page({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "narrow" | "full";
}) {
  return (
    <div
      className={cn(
        "mx-auto px-5 py-7 sm:px-7 lg:px-8 lg:py-9",
        width === "wide" && "max-w-[1440px]",
        width === "narrow" && "max-w-3xl",
        width === "full" && "max-w-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("mt-7", className)}>{children}</section>;
}
