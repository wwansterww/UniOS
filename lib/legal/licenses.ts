// Open-source licence audit: what kind of obligation each dependency's licence brings.
// scripts/licenses.ts writes lib/legal/licenses.json from package-lock.json; /licenses shows it; CI runs --check.

export type LicenceKind = "permissive" | "weak" | "data" | "forbidden" | "unknown";

const PERMISSIVE = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "Unlicense", "CC0-1.0", "BlueOak-1.0.0", "Zlib", "Python-2.0"]);
/** File- or library-level copyleft: fine when the library is used unmodified and linked, as UniOS does. */
const WEAK = /^(LGPL-(2\.1|3\.0)(-only|-or-later)?|MPL-2\.0|EPL-2\.0)$/;
/** Attribution-only licences for data (browser support tables). */
const DATA = new Set(["CC-BY-3.0", "CC-BY-4.0"]);
/** Strong copyleft or source-available licences that would oblige us to publish UniOS or forbid commercial use. */
const FORBIDDEN = /^(A?GPL-|SSPL-|BUSL-|CC-BY-NC|CC-BY-SA|EUPL-|OSL-)/;

const RANK: Record<LicenceKind, number> = { permissive: 0, data: 1, weak: 2, unknown: 3, forbidden: 4 };

function one(id: string): LicenceKind {
  if (PERMISSIVE.has(id)) return "permissive";
  if (WEAK.test(id)) return "weak";
  if (DATA.has(id)) return "data";
  if (FORBIDDEN.test(id)) return "forbidden";
  return "unknown";
}

/**
 * Classifies an SPDX expression. "A OR B": we may pick the better one; "A AND B": every term applies, so the
 * worst one counts. Missing or custom licences are "unknown" and need a human look.
 */
export function classify(expr: string | null | undefined): LicenceKind {
  const e = (expr ?? "").trim().replace(/^\((.*)\)$/, "$1");
  if (!e) return "unknown";
  if (/\sOR\s/.test(e)) {
    return e
      .split(/\s+OR\s+/)
      .map((x) => classify(x))
      .reduce((best, k) => (RANK[k] < RANK[best] ? k : best));
  }
  if (/\sAND\s/.test(e)) {
    return e
      .split(/\s+AND\s+/)
      .map((x) => classify(x))
      .reduce((worst, k) => (RANK[k] > RANK[worst] ? k : worst));
  }
  return one(e.replace(/\+$/, "-or-later"));
}

export interface LicencedPackage {
  name: string;
  version: string;
  license: string;
  kind: LicenceKind;
}

export interface LicenceReport {
  packages: LicencedPackage[];
  summary: Record<LicenceKind, number>;
}

export function summarise(packages: LicencedPackage[]): LicenceReport {
  const summary: Record<LicenceKind, number> = { permissive: 0, weak: 0, data: 0, forbidden: 0, unknown: 0 };
  for (const p of packages) summary[p.kind]++;
  return { packages: [...packages].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)), summary };
}
