"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n";
import { XMark } from "@/components/logo";
import { closeCheckin } from "../actions";

type State = { code: string; svg: string; msLeft: number; marked: number; total: number; recent: string[] };

/**
 * Full-screen QR for the projector: students scan it (or type the 6 digits) to check in.
 * Polls the server, which rotates the code every 15 s and keeps check-in open only while this is shown.
 */
export function QrCheckin({ sessionId, title }: { sessionId: string; title: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [left, setLeft] = useState(15_000);

  const close = () => {
    setOpen(false);
    setState(null);
    closeCheckin(sessionId).then(() => router.refresh());
  };

  useEffect(() => {
    if (!open) return;
    let stop = false;
    let until = 0;
    const load = async () => {
      try {
        const res = await fetch(`/api/checkin/${sessionId}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const s = (await res.json()) as State;
        setState(s);
        until = Date.now() + s.msLeft;
      } catch {}
    };
    load();
    const poll = setInterval(load, 2500);
    const tick = setInterval(() => {
      const ms = until - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0 && until) load();
    }, 200);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="flex-1 sm:flex-none">
        <QrCode size={16} /> {t.attendance.qr}
      </Button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t.attendance.qrTitle} className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-5 py-4 sm:px-8">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-narxoz text-white">
              <XMark className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{title}</p>
              <p className="text-[13px] text-muted">{t.attendance.qrTitle}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={close} aria-label={t.attendance.qrClose}>
              <X size={20} />
            </Button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 pb-8 lg:flex-row lg:gap-14">
            <div className="relative aspect-square w-[min(78vw,62vh)] max-w-[34rem] overflow-hidden rounded-[2rem] bg-white p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]">
              {state ? (
                // The SVG comes from our own server (the qrcode library), never from user input.
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: state.svg }} />
              ) : (
                <div className="skeleton h-full w-full rounded-2xl" />
              )}
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/5">
                <div className="h-full bg-narxoz transition-[width] duration-200 ease-linear" style={{ width: `${(left / 15_000) * 100}%` }} />
              </div>
            </div>

            <div className="flex w-full max-w-sm flex-col items-center text-center lg:items-start lg:text-left">
              <p className="text-[13px] uppercase tracking-wide text-muted">{t.attendance.qrOrCode}</p>
              <p className="mt-1 font-mono text-[3.25rem] font-semibold leading-none tracking-[0.12em] tabular-nums sm:text-[4rem]">
                {state ? `${state.code.slice(0, 3)} ${state.code.slice(3)}` : "··· ···"}
              </p>
              <p className="mt-6 font-display text-2xl font-semibold">{state ? t.attendance.qrCheckedIn(state.marked, state.total) : " "}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: state && state.total ? `${(state.marked / state.total) * 100}%` : "0%" }} />
              </div>
              {state && state.recent.length > 0 && (
                <ul className="mt-4 flex flex-wrap justify-center gap-1.5 lg:justify-start">
                  {state.recent.map((n) => (
                    <li key={n} className="checkin-pop rounded-full bg-ok-soft px-3 py-1 text-[13px] text-ok">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-6 text-sm text-muted">{t.attendance.qrHint}</p>
              <Button onClick={close} size="lg" className="mt-6 w-full lg:w-auto">
                {t.attendance.qrClose}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
