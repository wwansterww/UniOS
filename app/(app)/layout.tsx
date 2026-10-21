import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Shell } from "@/components/shell";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [unread, { t }] = await Promise.all([unreadCount(user), getT()]);
  return (
    <Shell role={user.role} name={user.full_name} unread={unread}>
      {/* A temporary password from the advisor: ask for one of their own. */}
      {user.must_change_password && (
        <Link
          href="/profile#security"
          className="mb-8 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn transition-colors hover:border-warn/60 sm:px-5"
        >
          <KeyRound size={17} className="shrink-0" />
          <span className="min-w-0 flex-1 font-medium">{t.profile.tempPassword}</span>
          <span className="shrink-0 font-semibold underline-offset-2 hover:underline">{t.profile.changeNow} →</span>
        </Link>
      )}
      {children}
    </Shell>
  );
}
