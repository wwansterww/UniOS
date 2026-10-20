import { describe, expect, it } from "vitest";
import { absenceAllowance, absenceRisk, attendanceStats, courseResult, courseScore, currentTerm, examNeeded, gpa, gpaPoints, letter, parsePoints } from "../lib/journal";
import { fromZoned } from "../lib/time";

describe("gradebook math", () => {
  it("course score counts only graded works", () => {
    expect(courseScore([{ max_points: 10, points: 9 }, { max_points: 20, points: 15 }, { max_points: 30, points: null }])).toBe(80);
    expect(courseScore([{ max_points: 10, points: null }])).toBeNull();
    expect(courseScore([])).toBeNull();
  });

  it("letter grades follow the 100-point scale", () => {
    expect([100, 95, 94, 85, 80, 75, 70, 65, 60, 55, 50, 49, 0].map(letter)).toEqual(["A", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F", "F"]);
  });

  it("parses typed points", () => {
    expect(parsePoints("8,5", 10)).toBe(8.5);
    expect(parsePoints(" 10 ", 10)).toBe(10);
    expect(parsePoints("", 10)).toBeNull();
    expect(parsePoints("11", 10)).toBeUndefined();
    expect(parsePoints("-1", 10)).toBeUndefined();
    expect(parsePoints("abc", 10)).toBeUndefined();
  });

  it("attendance: late counts as attended", () => {
    expect(attendanceStats(["present", "late", "absent", "present"])).toEqual({ total: 4, present: 2, late: 1, absent: 1, excused: 0, percent: 75 });
    // An excused absence (accepted certificate) is left out of the percentage.
    expect(attendanceStats(["present", "excused", "absent", "present"]).percent).toBe(67);
    expect(attendanceStats([]).percent).toBeNull();
  });

  it("GPA is credit-weighted on the 4.0 scale", () => {
    expect([96, 92, 87, 82, 77, 40].map(gpaPoints)).toEqual([4, 3.67, 3.33, 3, 2.67, 0]);
    // A (4.0) × 6 credits + B (3.0) × 3 credits → 33 / 9 = 3.67
    expect(gpa([{ score: 96, credits: 6 }, { score: 82, credits: 3 }, { score: null, credits: 5 }])).toBe(3.67);
    expect(gpa([{ score: null, credits: 5 }])).toBeNull();
  });

  it("25% absence limit: 30 classes → 7 may be missed", () => {
    expect(absenceAllowance(30)).toBe(7);
    expect(absenceAllowance(15)).toBe(3);
    expect(absenceAllowance(0)).toBe(0);
    expect(absenceRisk(5, 7)).toBe("ok");
    expect(absenceRisk(6, 7)).toBe("warn"); // one left
    expect(absenceRisk(7, 7)).toBe("warn"); // limit reached
    expect(absenceRisk(8, 7)).toBe("over");
  });

  it("Narxoz final grade: 60% admission rating (mean of RK1, RK2) + 40% exam", () => {
    const works = [
      { category: "rk1" as const, max_points: 100, points: 80 },
      { category: "rk2" as const, max_points: 100, points: 90 },
      { category: "exam" as const, max_points: 100, points: null },
    ];
    expect(courseResult(works)).toMatchObject({ rk1: 80, rk2: 90, admission: 85, exam: null, score: 85, final: false });
    works[2].points = 70;
    // 0.6 × 85 + 0.4 × 70 = 79
    expect(courseResult(works)).toMatchObject({ score: 79, final: true });
    // Works without a category count as RK1 (older data).
    expect(courseScore([{ max_points: 10, points: 9 }])).toBe(90);
  });

  it("exam calculator: what the exam needs for a letter", () => {
    // admission 85: A (95) needs (95 − 51) / 0.4 = 110 → out of reach; B+ (85) needs 85; D (50) is already secured
    expect(examNeeded(85, 95)).toBeNull();
    expect(examNeeded(85, 90)).toBe(98);
    expect(examNeeded(85, 85)).toBe(85);
    expect(examNeeded(85, 50)).toBe(0);
  });

  it("semester codes", () => {
    expect(currentTerm(fromZoned(2026, 10, 20, 12))).toBe("2026-2");
    expect(currentTerm(fromZoned(2027, 2, 1, 12))).toBe("2027-1");
  });
});
