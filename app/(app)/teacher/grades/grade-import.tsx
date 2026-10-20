"use client";

import { useMemo, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { importGrades } from "../actions";

type Work = { id: string; title: string; max_points: number };
type Student = { id: string; full_name: string; email: string };
type Row = { studentId: string; workId: string; points: number };

/** "Иванов, Иван" / "иван иванов" / "ИВАНОВ ИВАН" → the same key. */
const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
/** Canvas adds the assignment id to the column title: "Lab 1 (12345)". */
const titleKey = (s: string) => s.replace(/\(\d+\)\s*$/, "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

/** Splits pasted Excel (tabs) or CSV (; or ,) text into rows of cells, honouring quotes. */
function parseTable(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === sep && !quoted) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  });
}

const num = (s: string) => {
  const v = s.replace(",", ".").replace(/\s/g, "");
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
};

/** Matches the table to students and works: either every column titled like a work (Canvas), or name + points into one work. */
function match(table: string[][], students: Student[], works: Work[], target: string) {
  const byName = new Map(students.map((s) => [nameKey(s.full_name), s.id]));
  const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s.id]));
  const who = (cells: string[]) => {
    for (const c of cells) if (c.includes("@") && byEmail.has(c.toLowerCase())) return byEmail.get(c.toLowerCase())!;
    for (const c of cells) if (num(c) == null && byName.has(nameKey(c))) return byName.get(nameKey(c))!;
    return null;
  };
  const rows: Row[] = [];
  const missing: string[] = [];
  if (target === "auto") {
    const header = table[0] ?? [];
    const cols = header.map((h) => works.find((w) => titleKey(w.title) === titleKey(h)) ?? null);
    for (const cells of table.slice(1)) {
      const sid = who(cells);
      const values = cells.map((c, i) => (cols[i] ? num(c) : null));
      if (!values.some((v) => v != null)) continue;
      if (!sid) {
        missing.push(cells.find((c) => c && num(c) == null) ?? "?");
        continue;
      }
      values.forEach((v, i) => v != null && cols[i] && v <= cols[i]!.max_points && rows.push({ studentId: sid, workId: cols[i]!.id, points: v }));
    }
  } else {
    const work = works.find((w) => w.id === target);
    for (const cells of table) {
      const pts = [...cells].reverse().map(num).find((v) => v != null) ?? null;
      if (pts == null || !work) continue;
      const sid = who(cells);
      if (!sid) {
        missing.push(cells.find((c) => c && num(c) == null) ?? "?");
        continue;
      }
      if (pts <= work.max_points) rows.push({ studentId: sid, workId: work.id, points: pts });
    }
  }
  return { rows, missing };
}

export function GradeImport({ courseId, groupId, works, students, onDone }: { courseId: string; groupId: string; works: Work[]; students: Student[]; onDone: () => void }) {
  const { t } = useT();
  const [pending, run] = useAction();
  const [text, setText] = useState("");
  const [target, setTarget] = useState(works[0]?.id ?? "auto");
  const result = useMemo(() => match(parseTable(text), students, works, target), [text, students, works, target]);

  return (
    <div className="space-y-3 border-b border-border bg-surface-2/60 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.grades.importTitle}</p>
          <p className="mt-0.5 text-[13px] text-muted">{t.grades.importHint}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDone} aria-label={t.common.cancel}>
          <X size={16} />
        </Button>
      </div>
      <Field label={t.grades.importWork}>
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          {works.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title} ({t.grades.outOf(String(w.max_points))})
            </option>
          ))}
          <option value="auto">{t.grades.importAuto}</option>
        </Select>
      </Field>
      <Field label={t.grades.importPaste}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"Айдана Серікова\t9\nАлибек Нурланов\t8,5"} className="min-h-28 font-mono text-[13px]" />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <Upload size={14} /> {t.grades.importFile}
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:font-medium file:text-fg"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const content = await f.text();
            setText(content);
            // A Canvas export has a "Student" header row: match its columns by title.
            if (/student|студент/i.test(content.split("\n")[0])) setTarget("auto");
          }}
        />
      </label>
      {text.trim() && (
        <div className="rounded-xl bg-surface px-3 py-2 text-[13px]">
          <p className="font-medium">{t.grades.importFound(result.rows.length)}</p>
          {result.missing.length > 0 && <p className="mt-0.5 text-warn">{t.grades.importUnmatched(result.missing.slice(0, 6).join(", ") + (result.missing.length > 6 ? "…" : ""))}</p>}
        </div>
      )}
      <Button disabled={pending || result.rows.length === 0} onClick={() => run(() => importGrades(courseId, groupId, result.rows), onDone)}>
        {t.grades.importDo(result.rows.length)}
      </Button>
    </div>
  );
}
