import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { CHECKIN_WINDOW_MS, checkinCode, checkinValid } = await import("../lib/checkin");

describe("QR check-in codes", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const t0 = 1_800_000_000_000;

  it("six digits that change every 15 seconds, different per class", () => {
    const w = Math.floor(t0 / CHECKIN_WINDOW_MS);
    expect(checkinCode(id, w)).toMatch(/^\d{6}$/);
    expect(checkinCode(id, w)).not.toBe(checkinCode(id, w + 1));
    expect(checkinCode(id, w)).not.toBe(checkinCode("11111111-2222-3333-4444-555555555556", w));
  });

  it("accepts the current and the previous code only", () => {
    const w = Math.floor(t0 / CHECKIN_WINDOW_MS);
    expect(checkinValid(id, checkinCode(id, w), t0)).toBe(true);
    expect(checkinValid(id, checkinCode(id, w - 1), t0)).toBe(true);
    expect(checkinValid(id, checkinCode(id, w - 2), t0)).toBe(false);
    expect(checkinValid(id, "12345", t0)).toBe(false);
    expect(checkinValid(id, "abcdef", t0)).toBe(false);
  });
});
