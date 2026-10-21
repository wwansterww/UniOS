import { describe, expect, it } from "vitest";
import { DWELL_FRAMES, hitStrength, nextDissolve, nextDwell, stepPearl, type Pearl } from "../lib/bubble-physics";

const pearl = (): Pearl => ({ ox: 0, oy: 0, vx: 0, vy: 0, r: 2.5, amp: 30, fx: 1, fy: 1, ph: 0 });
const R = 40; // pointer reach for an X ~300 px tall
const still = () => 0.5; // no jitter

/** Runs `frames` frames with the pointer at a fixed spot `at` px left of the pearl's place; returns the largest drift. */
function run(p: Pearl, frames: number, speed: number, at: number | null) {
  let max = 0;
  for (let i = 0; i < frames; i++) {
    stepPearl(p, at == null ? null : p.ox + at, at == null ? null : p.oy, R, hitStrength(speed), 0, i / 60, still);
    max = Math.max(max, Math.hypot(p.ox, p.oy));
  }
  return max;
}

describe("bubble X physics", () => {
  it("a slow pointer only dents the letter: pearls stay held (under 2.5 radii) and spring back", () => {
    const p = pearl();
    const max = run(p, 240, 0, 4);
    expect(max).toBeGreaterThan(0.5); // it does give way
    expect(max).toBeLessThan(p.r * 2.5);
    run(p, 120, 0, null);
    expect(Math.hypot(p.ox, p.oy)).toBeLessThan(0.2);
  });

  it("a quick swipe knocks pearls loose as bubbles that float up and come back", () => {
    const p = pearl();
    const max = run(p, 12, 30, 4);
    expect(max).toBeGreaterThan(p.r * 2.5);
    expect(p.oy).toBeLessThan(0); // floating up
    run(p, 600, 0, null);
    expect(Math.hypot(p.ox, p.oy)).toBeLessThan(1);
  });

  it("only resting on the X for about two seconds dissolves it; moving away gathers it back", () => {
    let dwell = 0;
    let dissolve = 0;
    for (let i = 0; i < 60; i++) {
      dwell = nextDwell(dwell, 5, 300, 1);
      dissolve = nextDissolve(dissolve, dwell);
    }
    expect(dissolve).toBe(0); // one second: still a crisp X
    for (let i = 0; i < 160; i++) {
      dwell = nextDwell(dwell, 5, 300, 1);
      dissolve = nextDissolve(dissolve, dwell);
    }
    expect(dwell).toBeGreaterThan(DWELL_FRAMES);
    expect(dissolve).toBeGreaterThan(0.5);
    // A moving pointer doesn't count as resting.
    expect(nextDwell(50, 5, 300, 12)).toBeLessThan(50);
    for (let i = 0; i < 200; i++) {
      dwell = nextDwell(dwell, Infinity, 300, 0);
      dissolve = nextDissolve(dissolve, dwell);
    }
    expect(dissolve).toBeLessThan(0.05);
  });
});
