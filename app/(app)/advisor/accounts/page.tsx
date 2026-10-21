import type { Metadata } from "next";
import { allowedDomain, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { AccountsView, type AccountRow } from "./accounts-view";

export const metadata: Metadata = { title: "Аккаунты" };

/** Advisor: everyone who can sign in. Read directly (not through RLS) because only the advisor gets here. */
export default async function AccountsPage() {
  const user = await requireUser("advisor");
  const { t } = await getT();
  const d = await db();
  const [accounts, groups] = await Promise.all([
    d.q<AccountRow>(
      `select p.id, p.full_name, p.email, p.role, p.disabled_at is not null as blocked, p.must_change_password,
              (select gm.group_id from group_members gm where gm.student_id = p.id order by gm.joined_at limit 1) as group_id,
              (select max(la.created_at) from login_attempts la where la.email = p.email and la.ok) as last_login
         from profiles p
        order by case p.role when 'advisor' then 0 when 'teacher' then 1 else 2 end, p.full_name`,
    ),
    d.q<{ id: string; name: string }>(`select id, name from groups order by name`),
  ]);
  const count = (role: string) => accounts.filter((a) => a.role === role).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle meta={[t.profile.advisor]} sub={t.admin.sub(accounts.length, count("teacher"), count("student"))}>
        {t.admin.title}
      </PageTitle>
      <AccountsView
        accounts={accounts.map((a) => ({ ...a, last_login: a.last_login ? new Date(a.last_login).toISOString() : null }))}
        groups={groups}
        me={user.id}
        domain={allowedDomain()}
      />
    </div>
  );
}
