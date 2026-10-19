export type InlineButton = { text: string; callback_data?: string; url?: string };

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || "";
export const botUsername = () => (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Telegram refuses inline URL buttons pointing at localhost. */
export const canLinkButton = () => !/\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(appUrl());

export async function tg<T = unknown>(method: string, body: object, signal?: AbortSignal): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result;
}

export function sendMessage(chatId: number | string, html: string, buttons?: InlineButton[][]) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
