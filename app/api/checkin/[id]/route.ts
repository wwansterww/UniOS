import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkinCode, checkinMsLeft } from "@/lib/checkin";
import { MIN } from "@/lib/time";

/**
 * Teacher's QR screen polls this every few seconds: it keeps check-in open for another minute and returns
 * the current code as a QR (an SVG pointing at /checkin on the host the teacher opened), plus who has checked in.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/checkin/[id]">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user || user.role !== "teacher") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const d = await db();
  const [s] = await d.q<{ group_id: string; starts_at: Date; status: string }>(
    `update class_sessions cs set checkin_until = now() + interval '1 minute' from courses c
      where cs.id = $1 and c.id = cs.course_id and c.teacher_id = $2 and cs.status <> 'cancelled' and cs.starts_at - interval '30 minutes' <= now()
      returning cs.group_id, cs.starts_at, cs.status`,
    [id, user.id],
  );
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const code = checkinCode(id);
  const url = `${req.nextUrl.origin}/checkin?s=${id}&code=${code}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });
  const [counts] = await d.q<{ marked: number; total: number }>(
    `select (select count(*)::int from attendance where session_id = $1 and status in ('present', 'late')) as marked,
            (select count(*)::int from group_members where group_id = $2) as total`,
    [id, s.group_id],
  );
  const recent = await d.q<{ full_name: string }>(
    `select p.full_name from attendance a join profiles p on p.id = a.student_id
      where a.session_id = $1 and a.marked_by is null and a.status in ('present', 'late') and a.marked_at > now() - interval '10 minutes'
      order by a.marked_at desc limit 6`,
    [id],
  );
  return NextResponse.json(
    { code, svg, url, msLeft: checkinMsLeft(), lateAfter: new Date(new Date(s.starts_at).getTime() + 15 * MIN).toISOString(), ...counts, recent: recent.map((r) => r.full_name) },
    { headers: { "cache-control": "no-store" } },
  );
}
