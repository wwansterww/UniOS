"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Megaphone, Search, X } from "lucide-react";
import { useT } from "./i18n";
import { cn } from "./ui";

type Hit = { type: "deadline" | "class" | "announcement"; id: string; title: string; subtitle: string; href: string; color?: string };

const EVENT = "uni:open-search";
export const openSearch = () => window.dispatchEvent(new Event(EVENT));

export function SearchPalette() {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENT, onOpen);
    };
  }, []);


  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) {
          setHits((await res.json()).hits);
          setActive(0);
        }
      } catch {}
      setLoading(false);
    }, 120);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open]);

  if (!open) return null;

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };
  const groups: [Hit["type"], string, typeof Search][] = [
    ["deadline", t.search.deadlines, ClipboardList],
    ["class", t.search.classes, CalendarDays],
    ["announcement", t.search.announcements, Megaphone],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy/50 p-3 pt-[10vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal
        aria-label={t.nav.search}
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && hits[active]) go(hits[active]);
            }}
            placeholder={t.search.placeholder}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted focus-visible:outline-none"
          />
          <button onClick={() => setOpen(false)} aria-label={t.common.close} className="rounded-lg p-1 text-muted hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {hits.length === 0 && !loading && <p className="px-3 py-8 text-center text-sm text-muted">{t.search.empty}</p>}
          {groups.map(([type, label, Icon]) => {
            const list = hits.filter((h) => h.type === type);
            if (!list.length) return null;
            return (
              <div key={type} className="mb-2">
                <p className="px-3 py-1.5 text-xs text-muted">{label}</p>
                {list.map((h) => {
                  const i = hits.indexOf(h);
                  return (
                    <button
                      key={h.type + h.id}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === active && "bg-surface-2")}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: (h.color ?? "#8C80EF") + "33" }}>
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{h.title}</span>
                        <span className="block truncate text-xs text-muted">{h.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">↑↓ · Enter · Esc — {t.search.hint}</p>
      </div>
    </div>
  );
}
