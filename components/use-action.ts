"use client";

import { useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
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
        // redirect() from an action (e.g. to /consent or /login) is Next's to handle, not an error to show.
        unstable_rethrow(e);
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}
