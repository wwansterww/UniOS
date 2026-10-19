import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/queries";
import { hasOfficialLogo } from "@/lib/brand";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = await unreadCount(user);
  return (
    <Shell role={user.role} name={user.full_name} unread={unread} officialLogo={hasOfficialLogo()}>
      {children}
    </Shell>
  );
}
