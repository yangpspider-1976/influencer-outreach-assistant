import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Unauthenticated liveness probe for the container orchestrator. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
