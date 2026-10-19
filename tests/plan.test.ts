import { describe, expect, it } from "vitest";
import { planReminders, instantSendAt } from "../lib/reminders/plan";
import { fromZoned, formatDateTime, toLocalInput } from "../lib/time";

const prefs = { offsets: [1440, 60], quietStart: "23:00", quietEnd: "08:00" };
const at = (d: number, h: number, m = 0) => fromZoned(2026, 10, d, h, m); // October 2026, Almaty
const local = (r: { sendAt: Date }[]) => r.map((x) => toLocalInput(x.sendAt));

describe("planReminders", () => {
  it("acceptance: created today 10:00 for tomorrow 18:00 with 24h + 1h → today 18:00 and tomorrow 17:00", () => {
    const r = planReminders(at(19, 18), at(18, 10), prefs);
    expect(local(r)).toEqual(["2026-10-18T18:00", "2026-10-19T17:00"]);
    expect(r.map((x) => x.offsetMinutes)).toEqual([1440, 60]);
  });

  it("uses all chosen offsets (2 days, 24h, 1h)", () => {
    const r = planReminders(at(25, 18), at(18, 10), { ...prefs, offsets: [60, 2880, 1440] });
    expect(local(r)).toEqual(["2026-10-23T18:00", "2026-10-24T18:00", "2026-10-25T17:00"]);
  });

  it("skips offsets that are already in the past", () => {
    const r = planReminders(at(19, 6, 0), at(18, 10), { ...prefs, quietStart: "00:00", quietEnd: "00:00" });
    // 24h before = 18th 06:00 (past) → only the 1h reminder
    expect(local(r)).toEqual(["2026-10-19T05:00"]);
  });

  it("acceptance: deadline 30 minutes away → exactly one urgent message, right now", () => {
    const now = at(18, 14, 0);
    const r = planReminders(at(18, 14, 30), now, prefs);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "urgent", offsetMinutes: 0 });
    expect(r[0].sendAt).toEqual(now);
  });

  it("no urgent message when the shortest offset is still ahead", () => {
    const r = planReminders(at(19, 6, 0), at(18, 10), prefs);
    expect(r.every((x) => x.kind === "reminder")).toBe(true);
  });

  it("acceptance: reminder at 02:00 is moved to 08:00", () => {
    // due 19th 03:00 + 24h offset → 18th 03:00? use 2-day deadline: due 20th 02:00, 24h → 19th 02:00
    const r = planReminders(at(20, 12, 0), at(18, 10), { ...prefs, offsets: [600] }); // 10h before = 02:00
    expect(local(r)).toEqual(["2026-10-20T08:00"]);
  });

  it("deadline before 08:00: reminder falling in quiet hours goes out before quiet hours start", () => {
    const r = planReminders(at(20, 7, 0), at(18, 10), prefs);
    // 24h → 19th 07:00 (quiet, deadline after 08:00 next day? no: 19th 08:00 < due) → 19th 08:00
    // 1h  → 20th 06:00 (quiet, quiet ends 08:00 after due) → 19th 22:45
    expect(local(r)).toEqual(["2026-10-19T08:00", "2026-10-19T22:45"]);
  });

  it("urgent during the night for a deadline before morning is sent immediately", () => {
    const now = at(18, 1, 0);
    const r = planReminders(at(18, 1, 40), now, prefs);
    expect(r).toEqual([{ offsetMinutes: 0, kind: "urgent", sendAt: now }]);
  });

  it("two reminders pushed to the same 08:00 collapse into one", () => {
    const r = planReminders(at(20, 10, 0), at(18, 10), { ...prefs, offsets: [420, 360] }); // 03:00 and 04:00
    expect(local(r)).toEqual(["2026-10-20T08:00"]);
    expect(r[0].offsetMinutes).toBe(360);
  });

  it("reminders off → nothing, past deadline → nothing", () => {
    expect(planReminders(at(19, 18), at(18, 10), { ...prefs, offsets: [] })).toEqual([]);
    expect(planReminders(at(17, 18), at(18, 10), prefs)).toEqual([]);
  });

  it("deadline moved: plan is recomputed from the new due date", () => {
    const before = planReminders(at(23, 18), at(18, 10), prefs);
    const after = planReminders(at(26, 12), at(18, 10), prefs);
    expect(local(before)).toEqual(["2026-10-22T18:00", "2026-10-23T17:00"]);
    expect(local(after)).toEqual(["2026-10-25T12:00", "2026-10-26T11:00"]);
  });

  it("instant messages wait for the end of quiet hours", () => {
    expect(toLocalInput(instantSendAt(at(18, 2), prefs))).toBe("2026-10-18T08:00");
    expect(toLocalInput(instantSendAt(at(18, 23, 30), prefs))).toBe("2026-10-19T08:00");
    expect(instantSendAt(at(18, 12), prefs)).toEqual(at(18, 12));
  });

  it("Almaty is UTC+5", () => {
    expect(at(18, 18).toISOString()).toBe("2026-10-18T13:00:00.000Z");
    expect(formatDateTime(at(18, 18))).toContain("18:00");
  });
});
