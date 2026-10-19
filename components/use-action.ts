"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type Result = { ok: boolean; message?: string; url?: string };

/** Runs a server action in a transition and shows its message as a toast. */
export function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result | void>, onOk?: (r: Result) => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r) return;
        if (r.ok) {
          if (r.message) toast.success(r.message);
          onOk?.(r);
        } else toast.error(r.message ?? "Error");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}
