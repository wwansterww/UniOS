"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useT } from "./i18n";
import { XMark } from "./logo";
import { Button, buttonClass } from "./ui";

/** Shared body of the error boundaries: what happened, a retry, a way home, and the code to quote. */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useT();
  // In production Server Component errors carry only a digest that matches the server log.
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-5 text-center" role="alert">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <XMark className="h-7 w-7" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold">{t.errors.title}</h1>
      <p className="mt-2 text-[15px] text-muted">{t.errors.text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="accent" onClick={() => retry()}>
          <RotateCcw size={16} /> {t.errors.retry}
        </Button>
        <Link href="/" className={buttonClass("outline")}>
          {t.errors.home}
        </Link>
      </div>
      {digest && (
        <p className="mt-6 text-xs text-muted">
          {t.errors.code}: <code className="rounded bg-surface-2 px-1.5 py-0.5">{digest}</code>
        </p>
      )}
    </div>
  );
}
