import type { Dict, Locale } from "../i18n";
import { formatDateTime, formatShort } from "../time";

export type NotificationKind =
  | "deadline_new"
  | "deadline_moved"
  | "deadline_deleted"
  | "class_moved"
  | "class_cancelled"
  | "room_changed"
  | "announcement"
  | "read_reminder"
  | "reg_open"
  | "reg_closing"
  | "reminder"
  | "digest";

export interface NotificationPayload {
  course?: string;
  title?: string;
  body?: string;
  due?: string;
  old?: string;
  new?: string;
  room?: string;
  oldRoom?: string;
  url?: string;
  urgent?: boolean;
  important?: boolean;
  deadlineId?: string;
  announcementId?: string;
  classes?: number;
  deadlines?: number;
  lines?: string[];
}

export interface Rendered {
  title: string;
  /** Main line. When `from`/`to` are set, UI shows `from` struck through → `to`. */
  body: string;
  from?: string;
  to?: string;
}

/** Localised text of a notification, shared by the in-app inbox, Telegram and email. */
export function renderNotification(t: Dict, l: Locale, kind: string, p: NotificationPayload): Rendered {
  const d = (s?: string) => (s ? formatShort(new Date(s), l) : "");
  const room = (r?: string) => (r ? `${t.common.room} ${r}` : "");
  const what = [p.course, p.title].filter(Boolean).join(" · ");
  switch (kind as NotificationKind) {
    case "deadline_new":
      return { title: t.notif.newDeadline, body: `${what} — ${formatDateTime(new Date(p.due!), l)}` };
    case "deadline_moved":
      return { title: t.notif.deadlineMoved, body: what, from: d(p.old), to: d(p.due) };
    case "deadline_deleted":
      return { title: t.notif.deadlineDeleted, body: what };
    case "class_moved":
      return {
        title: t.notif.classMoved,
        body: p.course ?? "",
        from: d(p.old),
        to: [d(p.new), room(p.room)].filter(Boolean).join(", "),
      };
    case "class_cancelled":
      return { title: t.notif.classCancelled, body: [p.course, d(p.old), room(p.room)].filter(Boolean).join(" · ") };
    case "room_changed":
      return { title: t.notif.roomChanged, body: `${p.course} · ${d(p.new)}`, from: room(p.oldRoom), to: room(p.room) };
    case "announcement":
      return { title: p.important ? t.notif.important : t.notif.announcement, body: what + (p.body ? `\n${p.body}` : "") };
    case "read_reminder":
      return { title: t.notif.readReminder, body: what };
    case "reg_open":
      return { title: t.notif.regOpen, body: `${p.title} — ${t.reg.closes}: ${formatDateTime(new Date(p.due!), l)}` };
    case "reg_closing":
      return { title: t.notif.regClosing, body: `${p.title} — ${formatDateTime(new Date(p.due!), l)}` };
    case "reminder":
      return { title: p.urgent ? t.notif.urgent : t.notif.reminder, body: `${what} — ${formatDateTime(new Date(p.due!), l)}` };
    case "digest":
      return { title: t.bot.digest, body: t.today.summary(p.classes ?? 0, p.deadlines ?? 0) };
    default:
      return { title: p.title ?? kind, body: p.body ?? "" };
  }
}

export function renderPlain(r: Rendered): string {
  const change = r.from || r.to ? `${r.from} → ${r.to}` : "";
  return [r.title, r.body, change].filter(Boolean).join("\n");
}
