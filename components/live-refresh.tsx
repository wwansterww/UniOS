"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps open pages fresh: polls a cheap version stamp and re-renders server components when
 * something visible to this user changed (new deadline, moved class, announcement…).
 */
export function LiveRefresh({ interval = 10_000 }: { interval?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (last.current && last.current !== v && !stop) router.refresh();
        last.current = v;
      } catch {}
    };
    check();
    const id = setInterval(check, interval);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, interval]);
  return null;
}
