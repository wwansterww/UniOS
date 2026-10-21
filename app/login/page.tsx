import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, homeFor, safeNext } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { NarxozLogo, XMark } from "@/components/logo";
import { BubbleX } from "@/components/bubble-x";
import { I18nProvider } from "@/components/i18n";
import { LoginForm, LocaleSwitch } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  const { expired, next } = await searchParams;
  if (user) redirect(safeNext(next) ?? homeFor(user.role));
  const { t, locale } = await getT();

  // Its own provider: when a signed-in page sends the browser here, the root layout stays mounted with the
  // signed-in user's language, while this page renders in the guest's — the form must follow the page.
  return (
    <I18nProvider locale={locale}>
      <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Brand panel: drifting light, rising bubbles and the hanging X that scatters under the pointer */}
        <section className="hero-red relative m-2 flex min-h-[21rem] flex-col overflow-hidden rounded-[1.75rem] p-6 text-white sm:m-3 sm:min-h-[30rem] sm:p-10 lg:min-h-[calc(100dvh-1.5rem)] lg:p-14">
          <div className="aurora" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden />
          <BubbleX className="absolute inset-0 h-full w-full" />

          <div data-bubble="top" className="relative w-fit">
            <NarxozLogo tone="white" locale={locale} className="h-11 sm:h-14" />
          </div>

          <div data-bubble="text" className="pointer-events-none relative mt-auto w-fit max-w-full sm:max-w-[62%]">
            <p className="fade-up text-[13px] text-white/75 sm:text-sm">{t.auth.portal}</p>
            <h1
              className="fade-up mt-2 text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.03em] sm:text-[3.75rem] lg:text-[4.25rem] xl:text-[5.25rem]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {t.auth.welcome}
            </h1>
          </div>
          <p className="relative mt-8 hidden text-[13px] text-white/60 lg:block">{t.auth.footer}</p>
        </section>

        {/* Form */}
        <section className="relative isolate flex flex-col overflow-hidden px-5 pb-8 sm:px-10 lg:px-16">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_22rem_at_100%_0%,var(--glow),transparent_70%)]" aria-hidden />
          <XMark className="pointer-events-none absolute -bottom-10 -right-8 -z-10 h-80 w-80 text-narxoz/[0.05]" />
          <header className="flex h-16 items-center justify-end lg:h-20">
            <LocaleSwitch />
          </header>
          <div className="fade-up mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-6" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="rounded-[1.75rem] border border-border bg-surface/85 p-6 shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] backdrop-blur-md sm:p-8">
              <LoginForm expired={!!expired} magic={!!process.env.RESEND_API_KEY} next={safeNext(next) ?? undefined} />
            </div>
          </div>
          <p className="text-center text-[13px] text-muted lg:text-right">{t.auth.project}</p>
        </section>
      </main>
    </I18nProvider>
  );
}
