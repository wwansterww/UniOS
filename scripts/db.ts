// npm run db:export  → writes supabase/migrations/*.sql from lib/db/migrations.ts
// npm run db:migrate → applies migrations (+ demo seed unless SEED_DEMO=false) to DATABASE_URL
// npm run db:reset   → deletes the local PGlite database (it is re-seeded on next start)
// npm run demo:reset -- --yes          → fresh demo semester in DATABASE_URL (e.g. Supabase), dates around today;
//                                        keeps passwords, Telegram links, settings and real usage events
// npm run demo:reset -- --local --yes  → the same for the local PGlite database (stop `npm run dev` first)
import fs from "node:fs";
import path from "node:path";
import { migrations } from "../lib/db/migrations";
import { createDb } from "../lib/db/core";
import { seedIfEmpty } from "../lib/db/seed";
import { resetDemo } from "../lib/db/demo-reset";

const cmd = process.argv[2];

async function main() {
  if (cmd === "export") {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    fs.mkdirSync(dir, { recursive: true });
    migrations.forEach((m, i) => {
      const file = path.join(dir, `2026101700000${i}_${m.name.replace(/^\d+_/, "")}.sql`);
      fs.writeFileSync(file, `-- Generated from lib/db/migrations.ts (${m.name}). Do not edit by hand.\n${m.sql.trim()}\n`);
      console.log("wrote", path.relative(process.cwd(), file));
    });
    return;
  }
  if (cmd === "migrate") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const d = await createDb(process.env.DATABASE_URL, null);
    console.log("migrations applied");
    if (process.env.SEED_DEMO !== "false") console.log((await seedIfEmpty(d)) ? "demo data seeded" : "database not empty, seed skipped");
    process.exit(0);
  }
  if (cmd === "reset") {
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir} — restart the dev server to re-seed with fresh, current dates`);
    return;
  }
  if (cmd === "demo-reset") {
    const local = process.argv.includes("--local");
    const url = local ? undefined : process.env.DATABASE_URL;
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    const target = url ? new URL(url).host : `local PGlite (${dir})`;
    if (!process.argv.includes("--yes")) {
      console.log(`This rebuilds the demo semester in ${target}: courses, classes, deadlines, grades, attendance and`);
      console.log(`submissions are replaced with fresh data around today. Accounts keep their passwords, Telegram`);
      console.log(`links and settings; real usage events stay. Run again with --yes to do it.`);
      if (!url && !local) console.log(`(DATABASE_URL is not set — add --local to reset the local database instead.)`);
      process.exit(1);
    }
    if (!url) console.log("Make sure `npm run dev` is stopped: the local database can be open in one process only.");
    const d = await createDb(url, url ? null : dir);
    const r = await d.tx((q) => resetDemo(q));
    console.log(`demo data refreshed in ${target}: ${r.people} accounts (${r.telegramKept} with Telegram), ${r.eventsKept} usage events kept`);
    process.exit(0);
  }
  console.log("usage: tsx scripts/db.ts export|migrate|reset|demo-reset");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
