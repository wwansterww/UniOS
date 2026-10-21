import "server-only";
import { createDb, type Db, type Q } from "./core";
import { seedIfEmpty } from "./seed";

export type { Db, Q } from "./core";

const g = globalThis as unknown as { __uniDb?: Promise<Db> };

/** Shared database handle: Postgres (Supabase) when DATABASE_URL is set, otherwise a local PGlite file. */
export function db(): Promise<Db> {
  if (!g.__uniDb) {
    g.__uniDb = (async () => {
      const d = await createDb(process.env.DATABASE_URL, process.env.PGLITE_DIR ?? ".data/pglite");
      // On Vercel the database is filled from your computer (npm run db:migrate): account passwords live only in
      // your accounts.local.json, and the server's disk is read-only.
      if (process.env.SEED_DEMO !== "false" && !process.env.VERCEL) await seedIfEmpty(d);
      return d;
    })().catch((e) => {
      g.__uniDb = undefined;
      throw e;
    });
  }
  return g.__uniDb;
}

/** Runs reads as the given user with Row Level Security enforced (role uni_app, app.user_id set). */
export async function withUser<T>(userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  const d = await db();
  return d.tx(async (q) => {
    await q(`select set_config('app.user_id', $1, true)`, [userId]);
    await q(`set local role uni_app`);
    return fn(q);
  });
}
