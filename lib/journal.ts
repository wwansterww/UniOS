// Pure gradebook / attendance math, shared by student, teacher and advisor pages and the Telegram bot.
import { zoned } from "./time";

export type AttendanceStatus = "present" | "late" | "absent" | "excused";
/** What a teacher marks by hand; "excused" comes from an approved medical certificate (справка). */
export const ATTENDANCE_STATUSES = ["present", "late", "absent"] as const;
export const isAttendanceStatus = (v: unknown): v is (typeof ATTENDANCE_STATUSES)[number] => v === "present" || v === "late" || v === "absent";

/** Letter grade on the Kazakhstan credit-system scale (0–100). */
export function letter(percent: number): string {
  const p = Math.round(percent);
  if (p >= 95) return "A";
  if (p >= 90) return "A-";
  if (p >= 85) return "B+";
  if (p >= 80) return "B";
  if (p >= 75) return "B-";
  if (p >= 70) return "C+";
  if (p >= 65) return "C";
  if (p >= 60) return "C-";
  if (p >= 55) return "D+";
  if (p >= 50) return "D";
  return "F";
}

/** Lowest score of each letter, best first. */
export const LETTER_MIN: [string, number][] = [
  ["A", 95], ["A-", 90], ["B+", 85], ["B", 80], ["B-", 75], ["C+", 70], ["C", 65], ["C-", 60], ["D+", 55], ["D", 50],
];

// ---------- Narxoz final grade ----------

/** rk1 / rk2: the two midterm ratings (рубежный контроль); exam: the final exam. */
export type Category = "rk1" | "rk2" | "exam";
export const CATEGORIES: Category[] = ["rk1", "rk2", "exam"];
export const isCategory = (v: unknown): v is Category => v === "rk1" || v === "rk2" || v === "exam";

/** Share of the exam in the final grade; the admission rating gives the rest. */
export const EXAM_WEIGHT = 0.4;
/** Admission rating needed to sit the exam. */
export const ADMISSION_MIN = 50;

type GradedWork = { max_points: number; points: number | null; category?: Category };

export interface CourseResult {
  rk1: number | null;
  rk2: number | null;
  exam: number | null;
  /** Рейтинг допуска: mean of the graded midterms. */
  admission: number | null;
  /** Final grade once the exam is graded; until then the admission rating. */
  score: number | null;
  final: boolean;
}

/** Percent earned in one category over the works graded so far (ungraded works don't pull it down). */
function categoryPercent(works: GradedWork[], cat: Category): number | null {
  let got = 0;
  let max = 0;
  for (const w of works) {
    if ((w.category ?? "rk1") !== cat || w.points == null) continue;
    got += w.points;
    max += w.max_points;
  }
  return max > 0 ? (got / max) * 100 : null;
}

/** Narxoz formula: final = 60% × admission rating + 40% × exam. */
export function courseResult(works: GradedWork[]): CourseResult {
  const rk1 = categoryPercent(works, "rk1");
  const rk2 = categoryPercent(works, "rk2");
  const exam = categoryPercent(works, "exam");
  const rks = [rk1, rk2].filter((x): x is number => x != null);
  const admission = rks.length ? rks.reduce((a, b) => a + b, 0) / rks.length : null;
  const score = exam != null ? (admission != null ? (1 - EXAM_WEIGHT) * admission + EXAM_WEIGHT * exam : exam) : admission;
  const r = (x: number | null) => (x == null ? null : Math.round(x));
  return { rk1: r(rk1), rk2: r(rk2), exam: r(exam), admission: r(admission), score: r(score), final: exam != null };
}

/** Current course score (see courseResult); null when nothing is graded yet. */
export const courseScore = (works: GradedWork[]) => courseResult(works).score;

/** Exam score needed to finish with at least `target`: null if out of reach, 0 if already guaranteed. */
export function examNeeded(admission: number, target: number): number | null {
  const need = (target - (1 - EXAM_WEIGHT) * admission) / EXAM_WEIGHT;
  if (need > 100) return null;
  return Math.max(0, Math.ceil(need - 1e-9));
}

/** "9.5" stays "9.5", "10.00" becomes "10". */
export const fmtPoints = (n: number) => String(Math.round(n * 100) / 100);

/** Accepts "8", "8.5", "8,5"; empty means "no grade". Returns undefined when invalid. */
export function parsePoints(raw: string, max: number): number | null | undefined {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 0 && n <= max ? n : undefined;
}

// ---------- attendance ----------

export interface AttendanceStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Share of classes attended (late counts as attended, excused ones are left out), 0–100; null when nothing is marked. */
  percent: number | null;
}

export function attendanceStats(statuses: AttendanceStatus[]): AttendanceStats {
  const s = { total: statuses.length, present: 0, late: 0, absent: 0, excused: 0 };
  for (const x of statuses) s[x]++;
  const counted = s.total - s.excused;
  return { ...s, percent: counted ? Math.round(((s.present + s.late) / counted) * 100) : null };
}

/** Colour of an attendance percentage: fine, worth a look, or a problem. */
export const attendanceTone = (p: number | null) => (p == null ? "neutral" : p >= 90 ? "green" : p >= 75 ? "yellow" : "red");

// ---------- GPA ----------

const GPA_POINTS: Record<string, number> = { A: 4, "A-": 3.67, "B+": 3.33, B: 3, "B-": 2.67, "C+": 2.33, C: 2, "C-": 1.67, "D+": 1.33, D: 1, F: 0 };

/** GPA points of a 0–100 score (A = 4.0 … F = 0). */
export const gpaPoints = (percent: number) => GPA_POINTS[letter(percent)];

/** Credit-weighted GPA over courses that already have a score; null when none has. */
export function gpa(courses: { score: number | null; credits: number }[]): number | null {
  let sum = 0;
  let credits = 0;
  for (const c of courses) {
    if (c.score == null) continue;
    sum += gpaPoints(c.score) * c.credits;
    credits += c.credits;
  }
  return credits > 0 ? Math.round((sum / credits) * 100) / 100 : null;
}

export const fmtGpa = (n: number) => n.toFixed(2);

// ---------- semesters ----------

/** Semester code: "2026-2" = fall 2026 (from July), "2026-1" = spring 2026. */
export function currentTerm(now = new Date()): string {
  const p = zoned(now);
  return `${p.year}-${p.month >= 7 ? 2 : 1}`;
}

export const termParts = (term: string) => {
  const [y, s] = term.split("-");
  return { year: Number(y), fall: s === "2" };
};

// ---------- absence limit ----------

/** Narxoz rule: a student may miss up to 25% of a course's classes ("НБ"). Late and excused ones don't count. */
export const ABSENCE_LIMIT = 0.25;

/** How many classes may be missed out of all planned (not cancelled) ones: 30 → 7. */
export const absenceAllowance = (planned: number) => Math.floor(planned * ABSENCE_LIMIT);

export type AbsenceRisk = "ok" | "warn" | "over";

/** ok; warn when at most one more absence is allowed; over when the limit is exceeded. */
export function absenceRisk(absent: number, allowed: number): AbsenceRisk {
  if (absent > allowed) return "over";
  return allowed - absent <= 1 ? "warn" : "ok";
}
