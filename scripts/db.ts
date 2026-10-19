// npm run db:export  → writes supabase/migrations/*.sql from lib/db/migrations.ts
// npm run db:migrate → applies migrations (+ demo seed unless SEED_DEMO=false) to DATABASE_URL
// npm run db:reset   → deletes the local PGlite database (it is re-seeded on next start)
import fs from "node:fs";
import path from "node:path";
import { migrations } from "../lib/db/migrations";
import { createDb } from "../lib/db/core";
import { seedIfEmpty } from "../lib/db/seed";

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
  console.log("usage: tsx scripts/db.ts export|migrate|reset");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
