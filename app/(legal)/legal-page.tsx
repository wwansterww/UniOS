import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import type { Block, LegalDoc } from "@/lib/legal/doc";
import { I18nProvider } from "@/components/i18n";
import { XMark } from "@/components/logo";
import { LocaleSwitch } from "../login/login-form";

/** Frame of the public legal pages: back link, language (for guests), title with edition, links to the others. */
export async function LegalFrame({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  const user = await getUser();
  const { t, locale } = await getT();
  const links = [
    { href: "/privacy", label: t.legal.privacy },
    { href: "/terms", label: t.legal.terms },
    { href: "/licenses", label: t.legal.licenses },
  ] as const;
  return (
    <I18nProvider locale={locale}>
      <main className="relative isolate min-h-dvh overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_24rem_at_100%_0%,var(--glow),transparent_70%)]" aria-hidden />
        <XMark className="pointer-events-none absolute -right-20 top-24 -z-10 hidden h-[30rem] w-[30rem] text-narxoz/[0.04] lg:block" />
        <header className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5 sm:px-8 lg:h-20">
          <Link href={user ? "/profile" : "/login"} className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
            <ArrowLeft size={15} /> {t.legal.back}
          </Link>
          {!user && <LocaleSwitch />}
        </header>
        <article className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
          <p className="text-[13px] font-medium uppercase tracking-wide text-narxoz">UniOS</p>
          <h1 className="mt-2 text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[2.75rem]">{title}</h1>
          <p className="mt-3 text-sm text-muted">{meta}</p>
          {children}
          <nav className="mt-14 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-[13px] text-muted">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="underline-offset-2 transition-colors hover:text-fg hover:underline">
                {l.label}
              </Link>
            ))}
            <span className="ml-auto">Narxoz University · Almaty</span>
          </nav>
        </article>
      </main>
    </I18nProvider>
  );
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string") return <p className="mt-3 leading-relaxed">{block}</p>;
  if ("list" in block)
    return (
      <ul className="mt-3 space-y-2">
        {block.list.map((item) => (
          <li key={item} className="flex gap-3 leading-relaxed">
            <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-narxoz" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {block.table.map(([what, how]) => (
        <div key={what} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4">
          <dt className="font-medium">{what}</dt>
          <dd className="text-muted">{how}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A legal document: lead, table of contents, numbered sections. `extra` adds lines to a section (by id). */
export async function LegalDocView({ doc, extra }: { doc: LegalDoc; extra?: Record<string, React.ReactNode> }) {
  const { t } = await getT();
  return (
    <>
      <p className="mt-6 text-[15px] leading-relaxed sm:text-base">{doc.lead}</p>
      <nav aria-label={t.legal.contents} className="mt-8 rounded-2xl bg-surface-2 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t.legal.contents}</p>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {doc.sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex gap-2 text-muted transition-colors hover:text-fg">
                <span className="w-5 shrink-0 tabular-nums">{i + 1}.</span>
                <span>{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="text-[15px]">
        {doc.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-6">
            <h2 className="flex gap-2 text-lg font-semibold sm:text-xl">
              <span className="tabular-nums text-narxoz">{i + 1}.</span> {s.title}
            </h2>
            {s.blocks.map((b, j) => (
              <BlockView key={j} block={b} />
            ))}
            {extra?.[s.id]}
          </section>
        ))}
      </div>
    </>
  );
}
