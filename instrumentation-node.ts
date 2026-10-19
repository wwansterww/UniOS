// Local scheduler: on a long-running server (npm run dev / npm start) tick every minute and,
// if configured, poll Telegram. On Vercel this is off — pg_cron calls /api/cron/tick instead.
const g = globalThis as unknown as { __uniScheduler?: boolean };

if (!g.__uniScheduler && !process.env.VERCEL && process.env.SCHEDULER !== "off") {
  g.__uniScheduler = true;
  const start = async () => {
    const { db } = await import("./lib/db");
    const { runTick } = await import("./lib/jobs");
    const d = await db();
    const tick = () =>
      runTick(d)
        .then((r) => {
          const n = r.reminders.sent + r.notifications.sent;
          if (n || r.reminders.failed || r.notifications.failed) console.log("[scheduler]", JSON.stringify(r));
        })
        .catch((e) => console.error("[scheduler]", e));
    setTimeout(tick, 3_000);
    setInterval(tick, 60_000);
    console.log(`[scheduler] started: tick every 60s (${d.kind})`);

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_MODE !== "webhook") {
      const { pollUpdates } = await import("./lib/telegram/bot");
      console.log("[telegram] long polling started");
      pollUpdates(d, new AbortController().signal);
    }
  };
  start().catch((e) => console.error("[scheduler] failed to start", e));
}

export {};
