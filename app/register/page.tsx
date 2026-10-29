import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Globe2 } from "lucide-react";
import { getUser, homeFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { defaultPeriod } from "@/lib/applications";
import { NarxozLogo, XMark } from "@/components/logo";
import { I18nProvider } from "@/components/i18n";
import { LocaleSwitch } from "../login/login-form";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Регистрация преподавателя" };

/** Public: a teacher without an account applies with their subjects and timetable (an advisor decides). */
export default async function RegisterPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));
  const { t, locale } = await getT();
  const d = await db();
  // Names only: invite codes stay private.
  const groups = await d.q<{ id: string; name: string }>(`select id, name from groups order by name`);

  return (
    <I18nProvider locale={locale}>
      <main className="grid min-h-dvh lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="hero-red relative m-2 flex min-h-[17rem] flex-col overflow-hidden rounded-[1.75rem] p-6 text-white sm:m-3 sm:p-10 lg:sticky lg:top-3 lg:h-[calc(100dvh-1.5rem)] lg:p-14">
          <div className="aurora" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden />
          <XMark className="pointer-events-none absolute -bottom-16 -right-10 h-[26rem] w-[26rem] text-white/[0.07]" />

          <Link href="/login" className="relative w-fit">
            <NarxozLogo tone="white" locale={locale} className="h-10 sm:h-12" />
          </Link>

          <div className="relative mt-auto max-w-xl pt-10">
            <p className="fade-up text-[13px] text-white/75 sm:text-sm">{t.apply.eyebrow}</p>
            <h1
              className="fade-up mt-2 text-[2.3rem] font-semibold leading-[1] tracking-[-0.03em] sm:text-[3.25rem] lg:text-[2.75rem] xl:text-[3.25rem] 2xl:text-[3.75rem]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {t.apply.title}
            </h1>
            <p className="fade-up mt-4 max-w-md text-[15px] leading-relaxed text-white/80" style={{ "--i": 2 } as React.CSSProperties}>
              {t.apply.lead}
            </p>
            <p
              className="fade-up mt-5 inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-[13px] text-white/90 ring-1 ring-white/20 backdrop-blur-sm"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <Globe2 size={15} /> {t.apply.outside}
            </p>
          </div>
        </section>

        <section className="relative isolate flex flex-col px-5 pb-10 sm:px-10 lg:px-14">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_22rem_at_100%_0%,var(--glow),transparent_70%)]" aria-hidden />
          <header className="flex h-16 items-center justify-between gap-3 lg:h-20">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
              <ArrowLeft size={15} /> {t.apply.haveAccount}
            </Link>
            <LocaleSwitch />
          </header>
          <div className="fade-up mx-auto w-full max-w-[40rem] flex-1 py-4 lg:py-8" style={{ "--i": 2 } as React.CSSProperties}>
            <RegisterForm groups={groups} period={defaultPeriod(new Date())} />
          </div>
        </section>
      </main>
    </I18nProvider>
  );
}
