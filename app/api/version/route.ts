import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { withUser } from "@/lib/db";

/** Cheap change stamp for LiveRefresh: changes whenever something this user can see changes. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ v: "anon" }, { status: 401 });
  const [row] = await withUser(user.id, (q) =>
    q<{ v: string }>(
      `select concat_ws('|',
         (select max(updated_at) from deadlines), (select count(*) from deadlines where deleted_at is null),
         (select max(updated_at) from class_sessions), (select count(*) from class_sessions),
         (select max(created_at) from announcements), (select count(*) from announcements where is_pinned),
         (select max(created_at) from notifications where user_id = app_uid()),
         (select count(*) from deadline_status), (select count(*) from announcement_reads),
         (select count(*) from group_members),
         (select count(*) from assessments), (select max(updated_at) from grades), (select count(*) from grades),
         (select max(marked_at) from attendance), (select count(*) from attendance)) as v`,
    ),
  );
  return NextResponse.json({ v: row.v }, { headers: { "cache-control": "no-store" } });
}
