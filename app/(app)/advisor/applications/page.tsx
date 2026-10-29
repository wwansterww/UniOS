import type { Metadata } from "next";
import { allowedDomain, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { review } from "@/lib/applications";
import { bookedAround, listApplications, pendingApplicationCount } from "@/lib/db/applications";
import { Empty, PageTitle, Tabs } from "@/components/ui";
import { ApplicationCard, DecidedList, type ApplicationView } from "./applications-view";

export const metadata: Metadata = { title: "Заявки" };

/**
 * Advisor: teachers' applications, each with what approving would create and where it overlaps the timetable.
 * Read directly (not through RLS): the table is server-only and only the advisor gets here.
 */
export default async function ApplicationsPage({ searchParams }: PageProps<"/advisor/applications">) {
  await requireUser("advisor");
  const { t } = await getT();
  const history = (await searchParams).view === "history";
  const d = await db();
  const now = new Date();
  const [list, groups, waiting] = await Promise.all([
    listApplications(d.q, history ? "history" : "pending"),
    d.q<{ id: string; name: string }>(`select id, name from groups`),
    pendingApplicationCount(d.q),
  ]);
  const domain = "@" + allowedDomain();
  const items: ApplicationView[] = await Promise.all(
    list.map(async (a) => {
      const r = history ? null : review(a, await bookedAround(d.q, a, now), now);
      return {
        id: a.id,
        full_name: a.full_name,
        email: a.email,
        outside: !a.email.endsWith(domain),
        note: a.note,
        starts_on: a.starts_on,
        ends_on: a.ends_on,
        created_at: new Date(a.created_at).toISOString(),
        status: a.status,
        review_note: a.review_note,
        reviewer: a.reviewer,
        reviewed_at: a.reviewed_at ? new Date(a.reviewed_at).toISOString() : null,
        subjects: r?.subjects ?? a.subjects.map((s) => ({ ...s, slots: s.slots.map((sl) => ({ ...sl, classes: 0, clashes: [] })) })),
        classes: r?.classes ?? 0,
        clashes: r?.clashes ?? 0,
      };
    }),
  );
  const names = Object.fromEntries(groups.map((g) => [g.id, g.name]));

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle meta={[t.profile.advisor]} sub={t.applications.sub(waiting)}>
        {t.applications.title}
      </PageTitle>
      <Tabs
        className="mb-6 max-w-md"
        items={[
          { href: "/advisor/applications", label: waiting ? `${t.applications.pending} · ${waiting}` : t.applications.pending, active: !history },
          { href: "/advisor/applications?view=history", label: t.applications.history, active: history },
        ]}
      />
      {items.length === 0 ? (
        <Empty icon={history ? "🗂️" : "📭"} title={history ? t.applications.emptyHistory : t.applications.empty}>
          {!history && t.applications.emptyHint}
        </Empty>
      ) : history ? (
        <DecidedList items={items} />
      ) : (
        <div className="space-y-5">
          {items.map((a) => (
            <ApplicationCard key={a.id} a={a} groups={names} />
          ))}
        </div>
      )}
    </div>
  );
}
