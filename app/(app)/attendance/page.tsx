import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { myAttendance } from "@/lib/queries";
import { PageTitle, buttonClass } from "@/components/ui";
import { AttendanceCards, attendanceTotals } from "./attendance-cards";

export const metadata: Metadata = { title: "Посещаемость" };

export default async function AttendancePage() {
  const user = await requireUser("student");
  const { t, locale } = await getT();
  const courses = await myAttendance(user);
  const all = attendanceTotals(courses);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        sub={all.percent != null ? t.attendance.summary(all.percent, all.absent, all.late) : undefined}
        action={
          <Link href="/checkin" className={buttonClass("primary", "md")}>
            <ScanLine size={16} /> {t.attendance.checkin}
          </Link>
        }
      >
        {t.attendance.title}
      </PageTitle>
      <AttendanceCards courses={courses} t={t} locale={locale} />
    </div>
  );
}
