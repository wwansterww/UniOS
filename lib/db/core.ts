import type { Sql, TransactionSql } from "postgres";
import { migrations } from "./migrations";

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Parameterised query: q("select ... where id = $1", [id]) → rows. */
export type Q = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface Db {
  q: Q;
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  kind: "pglite" | "postgres";
}

export async function createDb(databaseUrl: string | undefined, pgliteDir: string | null): Promise<Db> {
  const d = databaseUrl ? await postgresDb(databaseUrl) : await pgliteDb(pgliteDir);
  await migrate(d);
  return d;
}

async function pgliteDb(dir: string | null): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
  }
  const pg = dir ? await PGlite.create(dir) : await PGlite.create();
  // PGlite is a single connection: serialise transactions so they never interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const q: Q = async (sql, params = []) => (await pg.query(sql, params)).rows as never;
  return {
    kind: "pglite",
    q: (sql, params) => {
      const run = chain.then(() => q(sql, params));
      chain = run.catch(() => {});
      return run as never;
    },
    tx: (fn) => {
      const run = chain.then(() =>
        pg.transaction(async (t) => fn(async (sql, params = []) => (await t.query(sql, params)).rows as never)),
      );
      chain = run.catch(() => {});
      return run;
    },
  };
}

async function postgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  // prepare: false keeps it compatible with the Supabase transaction pooler (port 6543).
  // Encrypted unless the database runs on this machine: the password and data cross the internet to Supabase.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false,
    max: 5,
    ssl: local ? false : "require",
    // Don't keep sockets around: a serverless instance sleeps between requests (or the network changes), and a
    // query on a silently dead connection would hang. Fresh connections are cheap through the pooler.
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    // Queries pass json/jsonb parameters as JSON text (JSON.stringify, as PGlite takes them). postgres.js would
    // encode them once more into a JSON string, so text goes through as is; only objects get stringified.
    types: {
      json: {
        to: 114,
        from: [114, 3802],
        serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
    },
  });
  const wrap =
    (s: Sql | TransactionSql): Q =>
    async (text, params = []) =>
      (await s.unsafe(text, params as never[])) as never;
  return {
    kind: "postgres",
    q: wrap(sql),
    tx: async (fn) => (await sql.begin((t) => fn(wrap(t)))) as never,
  };
}

async function migrate(d: Db) {
  await d.q(`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`);
  const done = new Set((await d.q<{ name: string }>(`select name from _migrations`)).map((r) => r.name));
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    await d.tx(async (q) => {
      for (const stmt of splitSql(m.sql)) await q(stmt);
      await q(`insert into _migrations (name) values ($1)`, [m.name]);
    });
  }
}

/** Splits a migration into statements, keeping $$-quoted bodies intact. */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    if (line.trim().startsWith("--") && !inDollar) continue;
    cur += line + "\n";
    const count = (line.match(/\$\$/g) ?? []).length;
    if (count % 2 === 1) inDollar = !inDollar;
    if (!inDollar && line.trim().endsWith(";")) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
