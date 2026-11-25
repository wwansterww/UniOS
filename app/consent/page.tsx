import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, KeyRound, MapPin, ShieldCheck, Target } from "lucide-react";
import { getUser, homeFor, safeNext } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { I18nProvider } from "@/components/i18n";
import { NarxozLogo, XMark } from "@/components/logo";
import { acceptPrivacy, declinePrivacy } from "./actions";
import { SubmitButton } from "./submit-button";

export const metadata: Metadata = { title: "Согласие на обработку данных" };

const ICONS = [Database, Target, MapPin, KeyRound];

/**
 * Informed consent before the first use (and again when the policy changes materially): what is kept, why,
 * where and the person's rights, with "I agree" and "I don't agree" given equal weight — no pre-ticked boxes.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/consent">) {
  const user = await getUser();
  const { next } = await searchParams;
  if (!user) redirect("/login");
  if (user.consented) redirect(safeNext(next) ?? homeFor(user.role));
  const { t, locale } = await getT();

  return (
    <I18nProvider locale={locale}>
      <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_22rem_at_100%_0%,var(--glow),transparent_70%)]" aria-hidden />
        <XMark className="pointer-events-none absolute -right-16 -top-10 -z-10 h-[28rem] w-[28rem] text-narxoz/[0.06]" />
        <div className="w-full max-w-xl">
          <NarxozLogo locale={locale} className="mb-8 h-10" />
          <div className="rounded-[1.75rem] border border-border bg-surface/85 p-6 shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] backdrop-blur-md sm:p-8">
            <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-narxoz">
              <ShieldCheck size={15} /> {t.legal.consentEyebrow}
            </p>
            <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight">{t.legal.consentTitle}</h1>
            <p className="mt-1.5 text-sm text-muted">{t.legal.consentLead}</p>

            <ul className="mt-6 space-y-4">
              {t.legal.consentPoints.map(([title, text], i) => {
                const Icon = ICONS[i] ?? ShieldCheck;
                return (
                  <li key={title} className="flex gap-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-narxoz">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">{title}</span>
                      <span className="block text-sm leading-relaxed text-muted">{text}</span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
              {t.legal.consentFoot(PRIVACY_VERSION)}{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-fg underline underline-offset-2">
                {t.legal.consentFull}
              </Link>
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <form action={declinePrivacy}>
                <SubmitButton variant="outline" size="lg" className="w-full">
                  {t.legal.decline}
                </SubmitButton>
              </form>
              <form action={acceptPrivacy}>
                <input type="hidden" name="next" value={safeNext(next) ?? ""} />
                <SubmitButton variant="accent" size="lg" className="w-full shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]">
                  {t.legal.accept}
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      </main>
    </I18nProvider>
  );
}
