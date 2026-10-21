"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Link2, LogOut, MonitorSmartphone, RefreshCw, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { setTheme } from "@/components/theme-toggle";
import { LOCALES } from "@/lib/i18n";
import {
  changePassword,
  disconnectTelegram,
  joinGroup,
  removeCanvas,
  resetIcsToken,
  saveCanvas,
  savePrefs,
  setLocale,
  signOutEverywhere,
  telegramLink,
  telegramTest,
} from "../actions";
import { signOut } from "@/app/login/actions";

function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint?: string }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" name={name} checked={on} onChange={(e) => setOn(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-lavender",
          on ? "bg-primary" : "bg-border",
        )}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition", on ? "left-5.5" : "left-0.5")} />
      </span>
    </label>
  );
}

export function PrefsForm({
  prefs,
  role,
}: {
  prefs: { offsets_minutes: number[]; instant_enabled: boolean; channels: string[]; quiet_start: string; quiet_end: string; digest_enabled: boolean };
  role: "student" | "teacher";
}) {
  const { t } = useT();
  const [pending, run] = useAction();
  const [offsets, setOffsets] = useState<number[]>(prefs.offsets_minutes);
  const [channels, setChannels] = useState<string[]>(prefs.channels);
  const choices: [number, string][] = [
    [2880, t.profile.off2d],
    [1440, t.profile.off24h],
    [60, t.profile.off1h],
  ];
  const all = choices.every(([o]) => offsets.includes(o));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <form action={(fd) => run(() => savePrefs(fd))} className="space-y-5">
      {role === "student" && (
        <div>
          <p className="mb-2 text-sm font-semibold">{t.profile.when}</p>
          <div className="flex flex-wrap gap-2">
            {choices.map(([o, label]) => (
              <button
                type="button"
                key={o}
                aria-pressed={offsets.includes(o)}
                onClick={() => setOffsets(toggle(offsets, o))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition",
                  offsets.includes(o) ? "border-primary bg-primary text-primary-fg" : "border-border text-muted hover:text-fg",
                )}
              >
                {offsets.includes(o) && <Check size={14} />} {label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={all}
              onClick={() => setOffsets(all ? [1440, 60] : choices.map(([o]) => o))}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-semibold transition",
                all ? "border-accent bg-accent text-accent-fg" : "border-dashed border-border text-muted hover:text-fg",
              )}
            >
              {t.profile.allAtOnce}
            </button>
          </div>
          {offsets.map((o) => (
            <input key={o} type="hidden" name="offsets" value={o} />
          ))}
        </div>
      )}

      <div className="divide-y divide-border">
        <Toggle name="instant" defaultChecked={prefs.instant_enabled} label={t.profile.instant} />
        {role === "student" && <Toggle name="digest" defaultChecked={prefs.digest_enabled} label={t.profile.digest} hint={t.profile.digestHint} />}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">{t.profile.channels}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["telegram", t.profile.chTelegram],
              ["email", t.profile.chEmail],
              ["in_app", t.profile.chInApp],
            ] as const
          ).map(([c, label]) => (
            <button
              type="button"
              key={c}
              aria-pressed={channels.includes(c)}
              onClick={() => setChannels(toggle(channels, c))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition",
                channels.includes(c) ? "border-lavender bg-lavender-soft text-fg" : "border-border text-muted hover:text-fg",
              )}
            >
              {channels.includes(c) && <Check size={14} />} {label}
            </button>
          ))}
        </div>
        {channels.map((c) => (
          <input key={c} type="hidden" name="channels" value={c} />
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold">{t.profile.quiet}</p>
        <p className="mb-2 text-xs text-muted">{t.profile.quietHint}</p>
        <div className="flex items-center gap-2">
          <Input type="time" name="quiet_start" defaultValue={prefs.quiet_start} className="w-32" aria-label={t.common.from} />
          <span className="text-muted">—</span>
          <Input type="time" name="quiet_end" defaultValue={prefs.quiet_end} className="w-32" aria-label={t.common.to} />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {t.common.save}
      </Button>
    </form>
  );
}

export function TelegramCard({ connected, configured }: { connected: boolean; configured: boolean }) {
  const { t } = useT();
  const [pending, run] = useAction();
  if (!configured) return <p className="rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn">{t.profile.tgNoBot}</p>;
  return connected ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto inline-flex items-center gap-2 font-semibold text-ok">
        <Check size={18} /> {t.profile.tgConnected}
      </span>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(telegramTest)}>
        <Send size={14} /> {t.profile.tgTest}
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(disconnectTelegram)}>
        <Unlink size={14} /> {t.profile.tgDisconnect}
      </Button>
    </div>
  ) : (
    <div className="space-y-2">
      <Button
        size="lg"
        className="bg-[#229ED9] text-white"
        disabled={pending}
        onClick={() => run(telegramLink, (r) => r.url && window.open(r.url, "_blank"))}
      >
        <Send size={16} /> {t.profile.tgConnect}
      </Button>
      <p className="text-xs text-muted">{t.profile.tgHint}</p>
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          aria-label={t.common.copy}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            toast.success(t.common.copied);
          }}
        >
          <Copy size={16} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={value.replace(/^https?:/, "webcal:")} className="text-sm font-semibold text-muted hover:text-fg">
          Apple Calendar →
        </a>
        <a
          href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(value.replace(/^https?:/, "webcal:"))}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-muted hover:text-fg"
        >
          Google Calendar →
        </a>
        <button disabled={pending} onClick={() => run(resetIcsToken)} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
          <RefreshCw size={13} /> {t.profile.calendarReset}
        </button>
      </div>
    </div>
  );
}

export function CanvasForm({ url, error }: { url: string | null; error: string | null }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <form action={(fd) => run(() => saveCanvas(fd))} className="space-y-2">
      <Field label={t.profile.canvasUrl}>
        <Input name="url" type="url" required defaultValue={url ?? ""} placeholder="https://narxoz.instructure.com/feeds/calendars/user_….ics" />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {t.profile.canvasSync}
        </Button>
        {url && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(removeCanvas)}>
            <Unlink size={14} /> {t.profile.canvasRemove}
          </Button>
        )}
      </div>
    </form>
  );
}

export function JoinGroupForm() {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <form action={(fd) => run(() => joinGroup(fd))} className="flex gap-2">
      <Input name="code" required placeholder={t.profile.inviteCode} className="uppercase" autoCapitalize="characters" aria-label={t.profile.inviteCode} />
      <Button type="submit" disabled={pending}>
        <Link2 size={14} /> {t.profile.join}
      </Button>
    </form>
  );
}

export function Appearance() {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, run] = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-xl border border-border p-0.5">
        <button onClick={() => setTheme("light")} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg dark:text-muted">
          {t.common.light}
        </button>
        <button onClick={() => setTheme("dark")} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg">
          {t.common.dark}
        </button>
      </div>
      <div className="flex rounded-xl border border-border p-0.5" role="radiogroup" aria-label={t.common.language}>
        {LOCALES.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={l.code === locale}
            disabled={pending}
            onClick={() => run(() => setLocale(l.code), () => router.refresh())}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-bold", l.code === locale ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}
          >
            {l.label}
          </button>
        ))}
      </div>
      <Button variant="ghost" className="ml-auto" onClick={() => signOut()}>
        <LogOut size={16} /> {t.common.logout}
      </Button>
    </div>
  );
}

/** Change password: current, new, repeat. The form clears after a successful change. */
export function PasswordForm() {
  const { t } = useT();
  const [pending, run] = useAction();
  const [key, setKey] = useState(0);
  return (
    <form key={key} action={(fd) => run(() => changePassword(fd), () => setKey((k) => k + 1))} className="grid gap-3 sm:grid-cols-2">
      <Field label={t.profile.currentPassword} className="sm:col-span-2">
        <Input name="current" type="password" required autoComplete="current-password" />
      </Field>
      <Field label={t.profile.newPassword} hint={t.profile.passwordRule}>
        <Input name="next" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label={t.profile.repeatPassword}>
        <Input name="repeat" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          <KeyRound size={16} /> {t.profile.changePassword}
        </Button>
      </div>
    </form>
  );
}

export function SignOutEverywhere() {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => signOutEverywhere())}>
      <MonitorSmartphone size={14} /> {t.profile.logoutEverywhere}
    </Button>
  );
}
