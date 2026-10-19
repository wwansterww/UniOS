import { fromZoned } from "./time";

export interface IcsEvent {
  uid: string;
  summary: string;
  start: Date;
  description: string;
  url?: string;
}

/** Minimal iCalendar reader for Canvas "Calendar Feed": VEVENT with UID, SUMMARY, DTSTART, DESCRIPTION, URL. */
export function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines (RFC 5545 §3.1).
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.UID && cur.DTSTART) {
        const start = parseIcsDate(cur.DTSTART.value, cur.DTSTART.params);
        if (start)
          events.push({
            uid: cur.UID.value,
            summary: unescapeText(cur.SUMMARY?.value ?? ""),
            start,
            description: unescapeText(cur.DESCRIPTION?.value ?? "").slice(0, 2000),
            url: cur.URL?.value,
          });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...rawParams] = line.slice(0, i).split(";");
      const params: Record<string, string> = {};
      for (const p of rawParams) {
        const [k, v] = p.split("=");
        params[k.toUpperCase()] = v;
      }
      cur[name.toUpperCase()] = { value: line.slice(i + 1), params };
    }
  }
  return events;
}

function parseIcsDate(v: string, params: Record<string, string>): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  // All-day Canvas events mean "end of that day".
  if (!h || params.VALUE === "DATE") return fromZoned(+y, +mo, +d, 23, 59);
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  // Floating or TZID time: treat as Almaty (Canvas feeds for Narxoz use the university zone).
  return fromZoned(+y, +mo, +d, +h, +mi);
}

const unescapeText = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export interface CalendarItem {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  url?: string;
  cancelled?: boolean;
}

/** Builds a subscribable .ics feed (times in UTC). */
export function buildIcs(name: string, items: CalendarItem[]): string {
  const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniOS//Narxoz//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Asia/Almaty",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  const now = stamp(new Date());
  for (const it of items) {
    out.push(
      "BEGIN:VEVENT",
      `UID:${it.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(it.start)}`,
      `DTEND:${stamp(it.end)}`,
      fold(`SUMMARY:${escapeText(it.title)}`),
    );
    if (it.location) out.push(fold(`LOCATION:${escapeText(it.location)}`));
    if (it.description) out.push(fold(`DESCRIPTION:${escapeText(it.description)}`));
    if (it.url) out.push(fold(`URL:${it.url}`));
    if (it.cancelled) out.push("STATUS:CANCELLED");
    out.push("END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}
