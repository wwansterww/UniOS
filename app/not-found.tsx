import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { XMark } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-[5.5rem] font-semibold leading-none tracking-tight text-accent">
        4<XMark className="mx-1 inline-block h-[0.8em] w-auto align-[-0.05em]" />4
      </p>
      <h1 className="mt-6 text-2xl font-semibold">{t.errors.nfTitle}</h1>
      <p className="mt-2 text-[15px] text-muted">{t.errors.nfText}</p>
      <Link href="/" className={buttonClass("accent", "md", "mt-6")}>
        {t.errors.home}
      </Link>
    </main>
  );
}
