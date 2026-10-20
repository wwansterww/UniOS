import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, CalendarPlus, GraduationCap, LineChart, Palette, Send, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { myGroups, myPrefs } from "@/lib/queries";
import { appUrl, botToken, botUsername } from "@/lib/telegram/api";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, PageTitle } from "@/components/ui";
import { Appearance, CanvasForm, CopyField, JoinGroupForm, PrefsForm, TelegramCard } from "./forms";

export const metadata: Metadata = { title: "Профиль" };

function Section({ id, icon: Icon, title, hint, children }: { id?: string; icon: typeof Bell; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Icon size={18} /> {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default async function ProfilePage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const student = user.role === "student";
  const d = await db();
  const [prefs, groups, [canvas]] = await Promise.all([
    myPrefs(user),
    student ? myGroups(user) : Promise.resolve([]),
    d.q<{ canvas_feed_url: string | null; canvas_synced_at: Date | null; canvas_error: string | null }>(
      `select canvas_feed_url, canvas_synced_at, canvas_error from profiles where id = $1`,
      [user.id],
    ),
  ]);
  const icsUrl = `${appUrl()}/api/ics/${user.ics_token}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle>{t.profile.title}</PageTitle>
      <Card className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-base font-semibold">
          {user.full_name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{user.full_name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
        <Badge tone={student ? "lavender" : "accent"} className="ml-auto">
          {student ? t.profile.student : user.role === "advisor" ? t.profile.advisor : t.profile.teacher}
        </Badge>
      </Card>

      {student && (
        <Section id="groups" icon={Users} title={t.profile.groups}>
          {groups.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {groups.map((g) => (
                <Badge key={g.id} tone="outline" className="px-3 py-1 text-sm">
                  {g.name}
                </Badge>
              ))}
            </div>
          )}
          <p className="mb-2 text-sm font-semibold">{t.profile.joinGroup}</p>
          <JoinGroupForm />
        </Section>
      )}

      <Section id="notifications" icon={Bell} title={t.profile.notif}>
        <PrefsForm prefs={prefs} role={student ? "student" : "teacher"} />
      </Section>

      <Section icon={Send} title={t.profile.telegram}>
        <TelegramCard connected={!!user.telegram_chat_id} configured={!!botToken() && !!botUsername()} />
      </Section>

      <Section icon={CalendarPlus} title={t.profile.calendar} hint={t.profile.calendarHint}>
        <CopyField value={icsUrl} />
      </Section>

      {student && (
        <Section icon={GraduationCap} title={t.profile.canvas} hint={t.profile.canvasHint}>
          <CanvasForm url={canvas?.canvas_feed_url ?? null} error={canvas?.canvas_error ?? null} />
          {canvas?.canvas_synced_at && !canvas.canvas_error && (
            <p className="mt-2 text-xs text-muted">{t.profile.canvasLast(formatDateTime(new Date(canvas.canvas_synced_at), locale))}</p>
          )}
        </Section>
      )}

      <Section icon={Palette} title={t.profile.appearance}>
        <Appearance />
      </Section>

      {user.role === "teacher" && (
        <Link href="/metrics" className="flex items-center gap-2 px-1 py-2 text-sm text-muted hover:text-fg">
          <LineChart size={16} /> {t.teacher.metricsLink} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}
