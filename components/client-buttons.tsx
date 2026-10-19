"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "./ui";
import { useT } from "./i18n";
import { markAnnouncementRead, markNotificationsRead } from "@/app/(app)/actions";

export function MarkAllRead({ ids }: { ids?: string[] }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await markNotificationsRead(ids ?? "all")))}>
      <CheckCheck size={16} /> {t.common.markAllRead}
    </Button>
  );
}

export function MarkAnnouncementRead({ id }: { id: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await markAnnouncementRead(id);
          if (!r.ok) toast.error(t.common.error);
        })
      }
    >
      <CheckCheck size={16} /> {t.ann.markRead}
    </Button>
  );
}
