// Open-source licence audit of the production dependencies (everything npm installs without dev tools).
//   npm run licenses            → writes lib/legal/licenses.json (shown at /licenses)
//   npm run licenses -- --check → fails on GPL/AGPL/unknown licences or when the JSON is out of date (CI)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify, summarise, type LicencedPackage } from "../lib/legal/licenses";

const root = process.cwd();
const out = join(root, "lib/legal/licenses.json");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string; license?: string; dev?: boolean }>;
};

const packages: LicencedPackage[] = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path.startsWith("node_modules/") || meta.dev) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
  let license = meta.license ?? "";
  // Older lockfiles leave the licence out: read it from the installed package.
  const pkg = join(root, path, "package.json");
  if (!license && existsSync(pkg)) {
    const l = (JSON.parse(readFileSync(pkg, "utf8")) as { license?: string | { type?: string } }).license;
    license = typeof l === "string" ? l : (l?.type ?? "");
  }
  packages.push({ name, version: meta.version ?? "", license: license || "UNKNOWN", kind: classify(license) });
}

const report = summarise(packages);
const json = JSON.stringify(report, null, 1) + "\n";
const bad = report.packages.filter((p) => p.kind === "forbidden" || p.kind === "unknown");

console.log(`${report.packages.length} production packages:`, report.summary);
for (const p of bad) console.error(`  ✗ ${p.name}@${p.version}: ${p.license}`);

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== json) console.error("lib/legal/licenses.json is out of date: run npm run licenses");
  if (bad.length || current !== json) process.exit(1);
  console.log("Licence check passed.");
} else {
  writeFileSync(out, json);
  console.log("Wrote lib/legal/licenses.json");
  if (bad.length) process.exit(1);
}
