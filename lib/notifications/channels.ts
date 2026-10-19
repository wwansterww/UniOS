import { botToken, sendMessage, type InlineButton } from "../telegram/api";

/** Outgoing channels. Swappable in tests. */
export interface Senders {
  telegram?: (chatId: number | string, html: string, buttons?: InlineButton[][]) => Promise<unknown>;
  email?: (to: string, subject: string, text: string) => Promise<unknown>;
}

async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "UniOS <onboarding@resend.dev>", to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export function defaultSenders(): Senders {
  return {
    telegram: botToken() ? sendMessage : undefined,
    email: process.env.RESEND_API_KEY ? sendEmail : undefined,
  };
}

export { sendEmail };
