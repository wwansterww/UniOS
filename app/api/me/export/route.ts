import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportPersonalData } from "@/lib/privacy";
import { logEvent } from "@/lib/reminders/engine";
import { dateKey } from "@/lib/time";

/**
 * "Download my data": everything UniOS keeps about the signed-in person as JSON (right of access and portability,
 * Law No. 94-V art. 24, GDPR art. 15/20). Works even before consent is given — knowing what is stored doesn't
 * depend on agreeing to it.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const d = await db();
  const data = await exportPersonalData(d.q, user.id, user.locale);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.consented) await logEvent(d.q, user.id, "data_exported", {});
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="unios-my-data-${dateKey(new Date())}.json"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
