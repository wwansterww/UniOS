import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runTick } from "@/lib/jobs";

/**
 * Scheduler entry point. In production pg_cron calls it every 5 minutes (see supabase/cron.sql);
 * locally instrumentation.ts runs the same tick every minute.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });
  const result = await runTick(await db());
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
