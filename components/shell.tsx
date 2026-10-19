"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Home,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Search,
  UserRound,
  CalendarCheck,
} from "lucide-react";
import { NarxozLogo } from "./logo";
import { cn } from "./ui";
import { useT } from "./i18n";
import { SearchPalette, openSearch } from "./search";
import { LiveRefresh } from "./live-refresh";
import { AppOpenTracker } from "./metrics-tracker";
import { ThemeToggle } from "./theme-toggle";
import { OfflineBanner } from "./offline-banner";
import { Spotlight } from "./spotlight";
import type { Dict } from "@/lib/i18n";

type Item = { href: string; label: (t: Dict) => string; icon: typeof Home; mobile?: boolean };

const studentNav: Item[] = [
  { href: "/today", label: (t) => t.nav.today, icon: Home, mobile: true },
  { href: "/schedule", label: (t) => t.nav.schedule, icon: CalendarDays, mobile: true },
  { href: "/deadlines", label: (t) => t.nav.deadlines, icon: ClipboardList, mobile: true },
  { href: "/announcements", label: (t) => t.nav.announcements, icon: Megaphone, mobile: true },
  { href: "/registration", label: (t) => t.nav.registration, icon: CalendarCheck },
  { href: "/profile", label: (t) => t.nav.profile, icon: UserRound, mobile: true },
];

const teacherNav: Item[] = [
  { href: "/teacher", label: (t) => t.nav.overview, icon: LayoutDashboard, mobile: true },
  { href: "/teacher/courses", label: (t) => t.nav.courses, icon: BookOpen },
  { href: "/teacher/deadlines", label: (t) => t.nav.deadlines, icon: ClipboardList, mobile: true },
  { href: "/teacher/schedule", label: (t) => t.nav.schedule, icon: CalendarDays, mobile: true },
  { href: "/teacher/announcements", label: (t) => t.nav.announcements, icon: Megaphone, mobile: true },
  { href: "/metrics", label: (t) => t.nav.metrics, icon: LineChart },
  { href: "/profile", label: (t) => t.nav.profile, icon: UserRound, mobile: true },
];

export function Shell({
  role,
  name,
  unread,
  officialLogo,
  children,
}: {
  role: "student" | "teacher";
  name: string;
  unread: number;
  officialLogo?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const path = usePathname();
  const nav = role === "teacher" ? teacherNav : studentNav;
  const active = (href: string) => (href === "/teacher" ? path === href : path === href || path.startsWith(href + "/"));
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  const iconBtn = "relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <div className="min-h-dvh">
      <OfflineBanner />

      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-8">
          <Link href="/" aria-label="Narxoz University" className="shrink-0">
            <NarxozLogo official={officialLogo} />
          </Link>

          <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Navigation">
            {nav
              .filter((i) => i.href !== "/profile")
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-sm transition-colors",
                    active(i.href) ? "font-medium text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {i.label(t)}
                  {active(i.href) && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" aria-hidden />}
                </Link>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={openSearch} aria-label={t.nav.search} className={iconBtn}>
              <Search size={18} />
            </button>
            <Link href="/notifications" aria-label={t.nav.notifications} className={cn(iconBtn, active("/notifications") && "text-fg")}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-bg" aria-label={String(unread)} />}
            </Link>
            <ThemeToggle className="h-9 w-9 rounded-lg border-0 text-muted hover:text-fg" />
            <Link
              href="/profile"
              aria-label={t.nav.profile}
              className={cn(
                "ml-1 grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-xs font-semibold transition-colors hover:bg-border",
                active("/profile") && "bg-primary text-primary-fg hover:bg-primary",
              )}
            >
              {initials}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8 sm:px-8 sm:pt-12 lg:pb-16">{children}</main>

      {/* Phone: bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur-md lg:hidden" aria-label="Navigation">
        <div className="mx-auto flex max-w-md">
          {nav
            .filter((i) => i.mobile)
            .map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i.href) ? "page" : undefined}
                className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px]", active(i.href) ? "font-medium text-fg" : "text-muted")}
              >
                <i.icon size={20} strokeWidth={active(i.href) ? 2.2 : 1.8} />
                <span className="max-w-full truncate px-0.5">{i.label(t)}</span>
              </Link>
            ))}
        </div>
      </nav>

      <SearchPalette />
      <Spotlight />
      <LiveRefresh />
      <AppOpenTracker />
    </div>
  );
}
