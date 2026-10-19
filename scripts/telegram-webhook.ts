// Points the Telegram bot at the deployed app: npm run telegram:webhook
const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.APP_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !url || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN, APP_URL and TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}
const api = (method: string, body: object) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

(async () => {
  console.log(await api("setWebhook", { url: `${url.replace(/\/$/, "")}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"] }));
  console.log(
    await api("setMyCommands", {
      commands: [
        { command: "today", description: "Пары и дедлайны на сегодня" },
        { command: "week", description: "Расписание на неделю" },
        { command: "deadlines", description: "Ближайшие дедлайны" },
      ],
    }),
  );
})();
