import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, isDemo } from "@/lib/auth";
import { hasOfficialLogo } from "@/lib/brand";
import { getT } from "@/lib/i18n/server";
import { NarxozLogo, XMark } from "@/components/logo";
import { LoginForm, LocaleSwitch } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  if (user) redirect(user.role === "teacher" ? "/teacher" : "/today");
  const { t } = await getT();
  const { expired } = await searchParams;
  const official = hasOfficialLogo();

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <section className="hero-red relative m-2 flex flex-col overflow-hidden rounded-[1.75rem] p-6 text-white sm:m-3 sm:p-10 lg:min-h-[calc(100dvh-1.5rem)] lg:p-14">
        <XMark className="pointer-events-none absolute -bottom-24 -right-16 h-[26rem] w-[26rem] text-white/[0.08] lg:h-[36rem] lg:w-[36rem]" strokeWidth={15} />
        <NarxozLogo official={official} tone="white" className="relative origin-left scale-110" />

        <div className="relative mt-10 lg:mt-auto">
          <p className="fade-up text-[13px] text-white/70">{t.auth.portal}</p>
          <h1 className="fade-up mt-3 max-w-xl text-[2.5rem] font-semibold leading-[1.02] sm:text-[3.5rem] lg:text-[4.25rem]" style={{ "--i": 1 } as React.CSSProperties}>
            {t.auth.welcome}
          </h1>
          <p className="fade-up mt-4 max-w-md text-[15px] text-white/80" style={{ "--i": 2 } as React.CSSProperties}>
            {t.auth.welcomeHint}
          </p>

          <ol className="fade-up mt-10 hidden max-w-lg border-t border-white/20 sm:block" style={{ "--i": 3 } as React.CSSProperties}>
            {t.auth.points.map(([title, text], i) => (
              <li key={title} className="flex gap-6 border-b border-white/20 py-5">
                <span className="w-6 shrink-0 text-[13px] tabular-nums text-white/60">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative mt-10 hidden text-[13px] text-white/60 lg:block">{t.auth.footer}</p>
      </section>

      {/* Form */}
      <section className="flex flex-col px-5 pb-8 sm:px-10 lg:px-16">
        <header className="flex h-16 items-center justify-end lg:h-20">
          <LocaleSwitch />
        </header>
        <div className="fade-up mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-6" style={{ "--i": 2 } as React.CSSProperties}>
          <LoginForm expired={!!expired} demo={isDemo()} />
        </div>
        <p className="text-center text-[13px] text-muted lg:text-right">{t.auth.project}</p>
      </section>
    </main>
  );
}
