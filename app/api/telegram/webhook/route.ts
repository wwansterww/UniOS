import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleUpdate } from "@/lib/telegram/bot";

/** Telegram webhook. Set it with: npm run telegram:webhook (uses TELEGRAM_WEBHOOK_SECRET). */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new NextResponse(null, { status: 401 });
  const update = await req.json().catch(() => null);
  if (update) await handleUpdate(await db(), update).catch((e) => console.error("[telegram]", e));
  return NextResponse.json({ ok: true });
}
