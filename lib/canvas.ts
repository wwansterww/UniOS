import type { Db, Q } from "./db/core";
import { parseIcs } from "./ics";
import { logEvent, recomputeForDeadline } from "./reminders/engine";
import { HOUR } from "./time";

/** Only public https URLs: the feed is fetched by our server, so block obvious internal targets. */
export function validateFeedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim().replace(/^webcal:/i, "https:"));
    if (u.protocol !== "https:") return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[|0\.)/.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export async function fetchFeed(url: URL): Promise<string> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCalendar feed");
  return text.slice(0, 5_000_000);
}

/** Upserts Canvas assignments as personal deadlines of one student; dedupes by UID. Returns how many are in the feed. */
export async function importCanvasEvents(q: Q, userId: string, ics: string, now = new Date()) {
  const events = parseIcs(ics).filter((e) => e.uid);
  for (const e of events) {
    const [row] = await q<{ id: string; changed: boolean }>(
      `insert into deadlines (owner_id, title, due_at, description, link, source, external_uid, created_by)
       values ($1, $2, $3, $4, $5, 'canvas', $6, $1)
       on conflict (owner_id, external_uid) where external_uid is not null do update
         set title = excluded.title, due_at = excluded.due_at, description = excluded.description,
             link = excluded.link, updated_at = now(), deleted_at = null
       returning id, (xmax <> 0) as changed`,
      [userId, e.summary.slice(0, 300) || "Canvas", e.start.toISOString(), e.description, e.url ?? null, e.uid],
    );
    if (e.start > now) await recomputeForDeadline(q, row.id, { now });
  }
  return events.length;
}

export async function syncCanvas(db: Db, userId: string, now = new Date()) {
  const [p] = await db.q<{ canvas_feed_url: string | null }>(`select canvas_feed_url from profiles where id = $1`, [userId]);
  const url = p?.canvas_feed_url ? validateFeedUrl(p.canvas_feed_url) : null;
  if (!url) return 0;
  try {
    const ics = await fetchFeed(url);
    const n = await db.tx(async (q) => {
      const count = await importCanvasEvents(q, userId, ics, now);
      await q(`update profiles set canvas_synced_at = $2, canvas_error = null where id = $1`, [userId, now.toISOString()]);
      await logEvent(q, userId, "canvas_sync", { count });
      return count;
    });
    return n;
  } catch (e) {
    await db.q(`update profiles set canvas_synced_at = $2, canvas_error = $3 where id = $1`, [
      userId,
      now.toISOString(),
      (e as Error).message.slice(0, 300),
    ]);
    throw e;
  }
}

/** Hourly background sync for everyone who connected Canvas. */
export async function syncAllCanvas(db: Db, now = new Date()) {
  const due = await db.q<{ id: string }>(
    `select id from profiles where canvas_feed_url is not null
       and (canvas_synced_at is null or canvas_synced_at < $1) limit 50`,
    [new Date(now.getTime() - HOUR).toISOString()],
  );
  for (const { id } of due) await syncCanvas(db, id, now).catch(() => {});
  return due.length;
}
