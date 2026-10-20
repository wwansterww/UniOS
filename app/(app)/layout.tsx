import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = await unreadCount(user);
  return (
    <Shell role={user.role} name={user.full_name} unread={unread}>
      {children}
    </Shell>
  );
}
