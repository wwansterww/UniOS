// Sets the bot's command menu and description: npm run telegram:setup
import { configureBot } from "../lib/telegram/bot";

configureBot()
  .then(() => console.log("bot commands and description updated"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
