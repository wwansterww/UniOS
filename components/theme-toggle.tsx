"use client";

import { Moon, Sun } from "lucide-react";
import { useT } from "./i18n";
import { cn } from "./ui";

export function setTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <button
      onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")}
      aria-label={t.common.theme}
      className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border hover:bg-surface-2", className)}
    >
      <Sun size={16} className="hidden dark:block" />
      <Moon size={16} className="dark:hidden" />
    </button>
  );
}
