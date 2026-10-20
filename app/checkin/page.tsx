import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { NarxozLogo, XMark } from "@/components/logo";
import { CheckinForm } from "./checkin-form";

export const metadata: Metadata = { title: "Отметиться" };

/** Where the QR code leads: a focused screen that checks the student in, after signing in if needed. */
export default async function CheckinPage({ searchParams }: PageProps<"/checkin">) {
  const sp = await searchParams;
  const s = typeof sp.s === "string" ? sp.s : undefined;
  const code = typeof sp.code === "string" ? sp.code : undefined;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkin${s && code ? `?s=${s}&code=${code}` : ""}`)}`);
  if (user.role !== "student") redirect(homeFor(user.role));
  const { locale } = await getT();

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <XMark className="pointer-events-none absolute -right-16 -top-10 -z-10 h-[28rem] w-[28rem] text-narxoz/[0.06]" />
      <div className="w-full max-w-sm">
        <Link href={homeFor(user.role)} className="mb-8 block w-fit">
          <NarxozLogo locale={locale} className="h-10" />
        </Link>
        <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] sm:p-8">
          <CheckinForm session={s} code={code} home={homeFor(user.role)} />
        </div>
      </div>
    </main>
  );
}
