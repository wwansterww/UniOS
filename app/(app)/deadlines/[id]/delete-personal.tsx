"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n";
import { deletePersonalTask } from "../../actions";

export function DeletePersonal({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!confirm(t.common.delete + "?")) return;
          await deletePersonalTask(id);
          toast.success(t.deadlines.deleted);
          router.push("/deadlines");
        })
      }
    >
      <Trash2 size={16} /> {t.common.delete}
    </Button>
  );
}
