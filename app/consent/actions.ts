"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, getUser, homeFor, safeNext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/privacy";
import { logEvent, recomputeForStudent } from "@/lib/reminders/engine";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";

/** "I agree": the consent is stored with its version, time, IP and browser — the proof the law asks for. */
export async function acceptPrivacy(form: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const next = safeNext(form.get("next"));
  if (!user.consented) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
    const d = await db();
    await d.tx(async (q) => {
      const wasWithdrawn = await recordConsent(q, user.id, { source: "signin", ip, userAgent: h.get("user-agent") ?? "" });
      // Nothing was planned while consent was withdrawn: plan this student's reminders again.
      if (wasWithdrawn && user.role === "student") await recomputeForStudent(q, user.id);
      await logEvent(q, user.id, "privacy_consent", { version: PRIVACY_VERSION });
    });
  }
  redirect(next ?? homeFor(user.role));
}

/** "I don't agree": nothing is recorded, the person is signed out of this device. */
export async function declinePrivacy() {
  await endSession();
  redirect("/login?declined=1");
}
