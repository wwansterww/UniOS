import type { Db, Q } from "../db/core";
import { dictionaries, duration, isLocale, relative, type Dict, type Locale } from "../i18n";
import { logEvent, markDone, recomputeForStudent, snooze } from "../reminders/engine";
import { OFFSET_CHOICES } from "../reminders/plan";
import { DAY, addDays, formatDateTime, formatDay, formatTime, startOfDay, startOfWeek } from "../time";
import { appUrl, canLinkButton, esc, tg, type InlineButton } from "./api";

interface Update {
  update_id: number;
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
}

type Profile = { id: string; full_name: string; locale: string; role: string };

export interface SendOptions {
  /** Inline buttons under the message. */
  buttons?: InlineButton[][];
  /** Persistent reply keyboard (the bot's menu). */
  keyboard?: string[][];
}

/** Telegram transport, injectable for tests. */
export interface BotIO {
  send(chatId: number, html: string, opts?: SendOptions): Promise<unknown>;
  edit(chatId: number, messageId: number, html: string, buttons?: InlineButton[][]): Promise<unknown>;
  answer(callbackId: string, text: string): Promise<unknown>;
  clearButtons(chatId: number, messageId: number): Promise<unknown>;
}

export const telegramIO: BotIO = {
  send: (chat_id, text, opts) =>
    tg("sendMessage", {
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(opts?.buttons
        ? { reply_markup: { inline_keyboard: opts.buttons } }
        : opts?.keyboard
          ? { reply_markup: { keyboard: opts.keyboard.map((row) => row.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true } }
          : {}),
    }),
  edit: (chat_id, message_id, text, buttons) =>
    tg("editMessageText", { chat_id, message_id, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons ?? [] } }),
  answer: (callback_query_id, text) => tg("answerCallbackQuery", { callback_query_id, text }),
  clearButtons: (chat_id, message_id) => tg("editMessageReplyMarkup", { chat_id, message_id, reply_markup: { inline_keyboard: [] } }),
};

const lang = (p?: { locale: string }): Locale => (p && isLocale(p.locale) ? p.locale : "ru");

/** The bot's always-visible menu. */
export const menu = (t: Dict) => [
  [t.bot.kbToday, t.bot.kbNext],
  [t.bot.kbDeadlines, t.bot.kbWeek],
  [t.bot.kbSettings],
];

/** Menu button text (in any language; older emoji labels too) → command. */
function menuCommand(raw: string): string | null {
  const text = raw.replace(/^[^\p{L}]+/u, "").trim();
  for (const t of Object.values(dictionaries)) {
    if (text === t.bot.kbToday) return "/today";
    if (text === t.bot.kbNext) return "/next";
    if (text === t.bot.kbDeadlines) return "/deadlines";
    if (text === t.bot.kbWeek) return "/week";
    if (text === t.bot.kbSettings) return "/settings";
  }
  return null;
}

export async function handleUpdate(db: Db, u: Update, io: BotIO = telegramIO, now = new Date()) {
  if (u.callback_query) return handleCallback(db, u.callback_query, io, now);
  const msg = u.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const [cmd, arg] = text.split(/\s+/, 2);
  const command = menuCommand(text) ?? cmd.split("@")[0].toLowerCase();

  if (command === "/start" && arg) return link(db, chatId, arg, io);

  const [p] = await db.q<Profile>(`select id, full_name, locale, role from profiles where telegram_chat_id = $1`, [chatId]);
  const t = dictionaries[lang(p)];
  if (!p) return io.send(chatId, t.bot.welcomeGuest);

  switch (command) {
    case "/today":
      return io.send(chatId, await today(db, p, t, now), { keyboard: menu(t) });
    case "/next":
      return io.send(chatId, await nextClass(db, p, t, now), { keyboard: menu(t) });
    case "/week":
      return io.send(chatId, await week(db, p, t, now), { keyboard: menu(t) });
    case "/deadlines": {
      const [html, buttons] = await deadlines(db, p, t, now);
      return io.send(chatId, html, { buttons });
    }
    case "/settings": {
      const [html, buttons] = await settings(db, p, t);
      return io.send(chatId, html, { buttons });
    }
    default:
      return io.send(chatId, t.bot.help, { keyboard: menu(t) });
  }
}

async function link(db: Db, chatId: number, token: string, io: BotIO) {
  const p = await db.tx(async (q) => {
    const [row] = await q<{ user_id: string }>(
      `update telegram_link_tokens set used_at = now() where token = $1 and used_at is null and expires_at > now() returning user_id`,
      [token],
    );
    if (!row) return null;
    // One chat ↔ one account.
    await q(`update profiles set telegram_chat_id = null where telegram_chat_id = $1`, [chatId]);
    const [prof] = await q<Profile>(`update profiles set telegram_chat_id = $2 where id = $1 returning id, full_name, locale, role`, [
      row.user_id,
      chatId,
    ]);
    await q(`update notification_prefs set channels = array_append(channels, 'telegram') where user_id = $1 and not ('telegram' = any(channels))`, [
      row.user_id,
    ]);
    await logEvent(q, row.user_id, "telegram_connected", {});
    return prof;
  });
  const t = dictionaries[lang(p ?? undefined)];
  if (!p) return io.send(chatId, t.bot.badToken);
  return io.send(chatId, t.bot.linked(esc(p.full_name.split(" ")[0])), { keyboard: menu(t) });
}

async function handleCallback(db: Db, cb: NonNullable<Update["callback_query"]>, io: BotIO, now: Date) {
  const chatId = cb.message?.chat.id;
  const [action, arg] = (cb.data ?? "").split(":");
  const [p] = chatId ? await db.q<Profile>(`select id, full_name, locale, role from profiles where telegram_chat_id = $1`, [chatId]) : [];
  const t = dictionaries[lang(p)];
  if (!p) return io.answer(cb.id, t.bot.unknown);

  if (action === "pref") {
    await togglePref(db, p, arg);
    if (cb.message) {
      const [html, buttons] = await settings(db, p, t);
      await io.edit(cb.message.chat.id, cb.message.message_id, html, buttons).catch(() => {});
    }
    return io.answer(cb.id, t.common.saved);
  }

  const deadlineId = arg;
  if (!deadlineId || !/^[0-9a-f-]{36}$/.test(deadlineId) || !(await canSee(db, p.id, deadlineId))) return io.answer(cb.id, t.bot.unknown);

  if (action === "done") {
    await db.tx(async (q) => {
      await markDone(q, p.id, deadlineId, now);
      await q(`update reminders set opened_at = coalesce(opened_at, $3) where student_id = $1 and deadline_id = $2 and sent_at is not null`, [
        p.id,
        deadlineId,
        now.toISOString(),
      ]);
    });
    await io.answer(cb.id, t.bot.doneOk);
    if (cb.message) await io.clearButtons(cb.message.chat.id, cb.message.message_id).catch(() => {});
    return;
  }
  if (action === "snooze") {
    await db.tx((q) => snooze(q, p.id, deadlineId, now));
    return io.answer(cb.id, t.bot.snoozeOk);
  }
  return io.answer(cb.id, t.bot.help);
}

async function canSee(db: Db, userId: string, deadlineId: string) {
  return db.tx(async (q: Q) => {
    await q(`select set_config('app.user_id', $1, true)`, [userId]);
    await q(`set local role uni_app`);
    return (await q(`select 1 from deadlines where id = $1 and deleted_at is null`, [deadlineId])).length > 0;
  });
}

// ---------- settings: reminder offsets, digest, instant messages ----------

type Prefs = { offsets_minutes: number[]; digest_enabled: boolean; instant_enabled: boolean; quiet_start: string; quiet_end: string };

async function loadPrefs(db: Db, userId: string): Promise<Prefs> {
  await db.q(`insert into notification_prefs (user_id) values ($1) on conflict do nothing`, [userId]);
  const [p] = await db.q<Prefs>(
    `select offsets_minutes, digest_enabled, instant_enabled, to_char(quiet_start, 'HH24:MI') as quiet_start, to_char(quiet_end, 'HH24:MI') as quiet_end
       from notification_prefs where user_id = $1`,
    [userId],
  );
  return p;
}

async function togglePref(db: Db, p: Profile, what: string) {
  const prefs = await loadPrefs(db, p.id);
  await db.tx(async (q) => {
    const offset = Number(what);
    if ((OFFSET_CHOICES as readonly number[]).includes(offset)) {
      const next = prefs.offsets_minutes.includes(offset) ? prefs.offsets_minutes.filter((o) => o !== offset) : [...prefs.offsets_minutes, offset];
      await q(`update notification_prefs set offsets_minutes = coalesce(string_to_array(nullif($2, ''), ',')::int[], '{}') where user_id = $1`, [
        p.id,
        next.join(","),
      ]);
      if (p.role === "student") await recomputeForStudent(q, p.id);
    } else if (what === "all") {
      await q(`update notification_prefs set offsets_minutes = $2::int[] where user_id = $1`, [p.id, `{${OFFSET_CHOICES.join(",")}}`]);
      if (p.role === "student") await recomputeForStudent(q, p.id);
    } else if (what === "digest") {
      await q(`update notification_prefs set digest_enabled = not digest_enabled where user_id = $1`, [p.id]);
    } else if (what === "instant") {
      await q(`update notification_prefs set instant_enabled = not instant_enabled where user_id = $1`, [p.id]);
    }
    await logEvent(q, p.id, "prefs_saved", { via: "telegram", what });
  });
}

async function settings(db: Db, p: Profile, t: Dict): Promise<[string, InlineButton[][]]> {
  const prefs = await loadPrefs(db, p.id);
  const mark = (on: boolean, label: string) => (on ? `✓ ${label}` : label);
  const labels: Record<number, string> = { 2880: t.profile.off2d, 1440: t.profile.off24h, 60: t.profile.off1h };
  const html = [`<b>${t.bot.settingsTitle}</b>`, t.bot.settingsHint, "", `${t.profile.quiet}: ${prefs.quiet_start}–${prefs.quiet_end}`].join("\n");
  const buttons: InlineButton[][] = [
    OFFSET_CHOICES.map((o) => ({ text: mark(prefs.offsets_minutes.includes(o), labels[o]), callback_data: `pref:${o}` })),
    [{ text: t.profile.allAtOnce, callback_data: "pref:all" }],
    [{ text: mark(prefs.digest_enabled, t.profile.digest), callback_data: "pref:digest" }],
    [{ text: mark(prefs.instant_enabled, t.bot.instantShort), callback_data: "pref:instant" }],
  ];
  if (canLinkButton()) buttons.push([{ text: t.bot.open, url: `${appUrl()}/profile#notifications` }]);
  return [html, buttons];
}

// ---------- schedule & deadlines ----------

const sessionsSql = `
  select cs.starts_at, cs.ends_at, cs.room, cs.status, c.title from class_sessions cs
    join courses c on c.id = cs.course_id
   where (cs.group_id in (select group_id from group_members where student_id = $1) or c.teacher_id = $1)
     and cs.starts_at >= $2 and cs.starts_at < $3
   order by cs.starts_at`;

type S = { starts_at: Date; ends_at: Date; room: string; status: string; title: string };
const line = (s: S, t: Dict, l: Locale) => {
  const time = `${formatTime(new Date(s.starts_at), l)}–${formatTime(new Date(s.ends_at), l)}`;
  if (s.status === "cancelled") return `<s>${time}  ${esc(s.title)}</s>  ${t.bot.cancelled}`;
  return `${time}  ${esc(s.title)} · ${esc(s.room)}${s.status === "moved" ? ` (${t.schedule.moved.toLowerCase()})` : ""}`;
};

async function today(db: Db, p: Profile, t: Dict, now: Date) {
  const l = lang(p);
  const from = startOfDay(now);
  const sessions = await db.q<S>(sessionsSql, [p.id, from.toISOString(), new Date(from.getTime() + DAY).toISOString()]);
  const [list] = await deadlines(db, p, t, now, new Date(from.getTime() + DAY));
  return [`<b>${t.bot.todayTitle}, ${esc(formatDay(now, l))}</b>`, "", sessions.length ? sessions.map((s) => line(s, t, l)).join("\n") : t.bot.noClasses, "", list].join("\n");
}

async function nextClass(db: Db, p: Profile, t: Dict, now: Date) {
  const l = lang(p);
  const [s] = await db.q<S>(
    `select cs.starts_at, cs.ends_at, cs.room, cs.status, c.title from class_sessions cs join courses c on c.id = cs.course_id
      where (cs.group_id in (select group_id from group_members where student_id = $1) or c.teacher_id = $1)
        and cs.ends_at > $2 and cs.status <> 'cancelled'
      order by cs.starts_at limit 1`,
    [p.id, now.toISOString()],
  );
  if (!s) return `<b>${t.bot.nextTitle}</b>\n${t.bot.noNext}`;
  const start = new Date(s.starts_at);
  const live = start <= now;
  return [
    `<b>${live ? t.today.now : t.bot.nextTitle}</b>`,
    "",
    `<b>${esc(s.title)}</b>`,
    `${esc(formatDateTime(start, l))}–${formatTime(new Date(s.ends_at), l)} · ${t.common.room} ${esc(s.room)}${s.status === "moved" ? ` (${t.schedule.moved.toLowerCase()})` : ""}`,
    esc(live ? t.today.endsIn(duration(t, new Date(s.ends_at).getTime() - now.getTime())) : t.today.startsIn(duration(t, start.getTime() - now.getTime()))),
  ].join("\n");
}

async function week(db: Db, p: Profile, t: Dict, now: Date) {
  const l = lang(p);
  const from = startOfWeek(now);
  const sessions = await db.q<S>(sessionsSql, [p.id, from.toISOString(), addDays(from, 7).toISOString()]);
  if (!sessions.length) return `<b>${t.bot.weekTitle}</b>\n${t.bot.noClasses}`;
  const out = [`<b>${t.bot.weekTitle}</b>`];
  let day = "";
  for (const s of sessions) {
    const d = formatDay(new Date(s.starts_at), l);
    if (d !== day) out.push("", `<b>${esc(d)}</b>`);
    day = d;
    out.push(line(s, t, l));
  }
  return out.join("\n");
}

async function deadlines(db: Db, p: Profile, t: Dict, now: Date, until = new Date(now.getTime() + 14 * DAY)): Promise<[string, InlineButton[][]]> {
  const l = lang(p);
  const rows = await db.q<{ id: string; title: string; due_at: Date; course: string | null }>(
    `select d.id, d.title, d.due_at, c.title as course from deadlines d left join courses c on c.id = d.course_id
      where d.deleted_at is null and d.due_at > $2 and d.due_at < $3
        and not exists (select 1 from deadline_status ds where ds.deadline_id = d.id and ds.student_id = $1)
        and (d.owner_id = $1 or exists (select 1 from deadline_groups dg join group_members gm on gm.group_id = dg.group_id
                                         where dg.deadline_id = d.id and gm.student_id = $1))
      order by d.due_at limit 10`,
    [p.id, now.toISOString(), until.toISOString()],
  );
  if (!rows.length) return [`<b>${t.bot.deadlinesTitle}</b>\n${t.bot.noDeadlines}`, []];
  const text = [
    `<b>${t.bot.deadlinesTitle}</b>`,
    ...rows.map((d) => `\n<b>${esc(d.title)}</b>\n${d.course ? `${esc(d.course)} · ` : ""}${esc(relative(t, l, new Date(d.due_at), now))}`),
  ].join("\n");
  const buttons = rows.slice(0, 5).map((d) => [{ text: `✓ ${d.title.slice(0, 34)}`, callback_data: `done:${d.id}` }]);
  return [text, buttons];
}

/** Bot profile: menu commands + description shown in Telegram. */
export async function configureBot() {
  const t = dictionaries.ru;
  await tg("setMyCommands", {
    commands: [
      { command: "today", description: "Пары и дедлайны на сегодня" },
      { command: "next", description: "Следующая пара" },
      { command: "deadlines", description: "Ближайшие дедлайны" },
      { command: "week", description: "Расписание на неделю" },
      { command: "settings", description: "Когда напоминать о дедлайнах" },
    ],
  });
  await tg("setMyShortDescription", { short_description: t.bot.shortDescription });
  await tg("setMyDescription", { description: t.bot.description });
}

/** Long polling for local development (no public URL needed for a webhook). */
export async function pollUpdates(db: Db, signal: AbortSignal) {
  await tg("deleteWebhook", {}).catch(() => {});
  let offset = 0;
  while (!signal.aborted) {
    try {
      const updates = await tg<Update[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, signal);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(db, u).catch((e) => console.error("[telegram]", e));
      }
    } catch (e) {
      if (signal.aborted) return;
      console.error("[telegram] polling:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
