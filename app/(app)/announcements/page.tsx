import type { Metadata } from "next";
import { Pin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { announcements } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";
import { Badge, CourseDot, Empty, PageTitle, cn } from "@/components/ui";
import { MarkAnnouncementRead } from "@/components/client-buttons";

export const metadata: Metadata = { title: "Объявления" };

export default async function AnnouncementsPage() {
  const user = await requireUser("student");
  const { t, locale } = await getT();
  const list = await announcements(user);

  return (
    <div>
      <PageTitle>{t.ann.title}</PageTitle>
      {list.length === 0 ? (
        <Empty icon="📣" title={t.ann.empty} />
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <article
              id={a.id}
              key={a.id}
              className={cn(
                "scroll-mt-20 rounded-3xl border bg-surface p-4 sm:p-5",
                a.is_important && !a.read ? "border-danger/40" : "border-border",
                !a.read && "shadow-[inset_4px_0_0_var(--lavender)]",
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                <CourseDot color={a.color} />
                <span>{a.course_title}</span>
                <span>·</span>
                <span>{formatDateTime(new Date(a.created_at), locale)}</span>
                {a.is_pinned && (
                  <Badge tone="lavender">
                    <Pin size={11} /> {t.ann.pinned}
                  </Badge>
                )}
                {a.is_important && <Badge tone="solid">{t.ann.important}</Badge>}
                {!a.read && <Badge tone="accent">{t.ann.unread}</Badge>}
              </div>
              <h2 className="text-lg font-bold leading-snug">{a.title}</h2>
              {a.body && <p className="mt-1 whitespace-pre-line text-muted">{a.body}</p>}
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">{a.author_name}</p>
                {a.read ? <span className="text-xs font-semibold text-ok">✓ {t.ann.read}</span> : <MarkAnnouncementRead id={a.id} />}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
