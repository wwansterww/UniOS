import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { notifications } from "@/lib/queries";
import { renderNotification } from "@/lib/notifications/render";
import { formatDateTime } from "@/lib/time";
import { Change } from "@/components/bits";
import { MarkAllRead } from "@/components/client-buttons";
import { Empty, PageTitle, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Уведомления" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const list = await notifications(user, { limit: 100 });
  const unread = list.some((n) => !n.read_at);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle action={unread && <MarkAllRead />}>{t.nav.notifications}</PageTitle>
      {list.length === 0 ? (
        <Empty icon="🔕" title={t.notif.empty} />
      ) : (
        <div className="space-y-2">
          {list.map((n) => {
            const r = renderNotification(t, locale, n.kind, n.payload);
            return (
              <Link
                key={n.id}
                href={n.link ?? "#"}
                className={cn(
                  "flex gap-3 rounded-2xl border border-border p-3 transition hover:border-lavender",
                  n.read_at ? "bg-transparent" : "bg-surface",
                )}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-border" : "bg-lavender")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">{r.title}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDateTime(new Date(n.created_at), locale)}</span>
                  </span>
                  <span className="block whitespace-pre-line text-sm text-muted">{r.body}</span>
                  {(r.from || r.to) && <Change from={r.from} to={r.to} />}
                  {n.payload.lines && <span className="mt-1 block whitespace-pre-line text-xs text-muted">{n.payload.lines.join("\n")}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
