import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { withUser } from "@/lib/db";

/** A medical certificate file. RLS decides who may see it: the student, the class's teacher, the group's advisor. */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = req.nextUrl.searchParams.get("session") ?? "";
  const student = req.nextUrl.searchParams.get("student") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(session) || !/^[0-9a-f-]{36}$/.test(student)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [row] = await withUser(user.id, (q) =>
    q<{ file: Uint8Array; file_type: string; file_name: string | null }>(
      `select file, file_type, file_name from excuses where session_id = $1 and student_id = $2 and file is not null`,
      [session, student],
    ),
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(new Uint8Array(row.file), {
    headers: {
      "content-type": row.file_type,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.file_name ?? "spravka")}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    },
  });
}
