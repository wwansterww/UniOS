"use client";

import { useEffect } from "react";

const KEY = "uni_app_open";

export function track(name: string, props: object = {}) {
  const body = JSON.stringify({ name, props });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
  else fetch("/api/events", { method: "POST", body, keepalive: true }).catch(() => {});
}

/** Marks the moment the app was opened in this tab (the start of the "find my deadline" clock). */
export function AppOpenTracker() {
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, String(Date.now()));
        track("app_open", { path: location.pathname });
      }
    } catch {}
  }, []);
  return null;
}

/** On a deadline page: how long it took from opening the app to get here. Counted once per tab session. */
export function DeadlineOpenTracker({ deadlineId, fromReminder }: { deadlineId: string; fromReminder?: boolean }) {
  useEffect(() => {
    try {
      const opened = Number(sessionStorage.getItem(KEY) || Date.now());
      const seenKey = `uni_dl_${deadlineId}`;
      if (sessionStorage.getItem(seenKey)) return;
      sessionStorage.setItem(seenKey, "1");
      track("deadline_open", { deadline_id: deadlineId, ms_since_open: Date.now() - opened, from_reminder: !!fromReminder });
    } catch {}
  }, [deadlineId, fromReminder]);
  return null;
}
