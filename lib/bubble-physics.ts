// Physics of the login page's bubble X (components/bubble-x.tsx), kept free of the DOM so it can be tested.

/** ox/oy: how far a pearl drifted from its place; amp/fx/fy/ph: its own floating path when dissolved. */
export type Pearl = { ox: number; oy: number; vx: number; vy: number; r: number; amp: number; fx: number; fy: number; ph: number };

/** How hard the pointer hits, 0–1, from its speed in px per frame: a slow pointer dents, a quick swipe knocks loose. */
export const hitStrength = (speed: number) => Math.min(1, speed / 16);

/** Frames of resting on the X before it dissolves into a cloud (~2 s at 60 fps). */
export const DWELL_FRAMES = 110;

/**
 * One frame for one pearl. `dx`/`dy`: from the pointer to the pearl (null when the pointer is away);
 * `R`: the pointer's reach. Surface tension: a small dent snaps back like jelly; a pearl that broke away
 * (further than 2.5 radii) floats home slowly.
 */
export function stepPearl(d: Pearl, dx: number | null, dy: number | null, R: number, hit: number, dissolve: number, t: number, random = Math.random) {
  if (dx != null && dy != null) {
    const dist2 = dx * dx + dy * dy;
    if (dist2 < R * R) {
      const dist = Math.sqrt(dist2) || 1;
      const fall = 1 - dist / R;
      const f = fall * fall * (0.35 + 2.6 * hit) * (1 - dissolve * 0.75);
      d.vx += (dx / dist) * f + (random() - 0.5) * 0.6 * hit;
      d.vy += (dy / dist) * f - 0.3 * hit; // loose bubbles float up
    }
  }
  // Dissolved, every bubble drifts along its own wavy path upwards.
  const tx = dissolve * d.amp * Math.sin(t * d.fx + d.ph);
  const ty = dissolve * (-d.amp * 0.8 + d.amp * 0.6 * Math.cos(t * d.fy + d.ph));
  const held = Math.hypot(d.ox - tx, d.oy - ty) < d.r * 2.5;
  const k = held ? 0.06 : 0.012;
  const damping = held ? 0.82 : 0.92;
  d.vx = (d.vx + (tx - d.ox) * k) * damping;
  d.vy = (d.vy + (ty - d.oy) * k) * damping;
  d.ox += d.vx;
  d.oy += d.vy;
}

/** Resting on the X (close to it, nearly still) builds up dwell; moving or leaving lets it drain. */
export function nextDwell(dwell: number, near: number, size: number, speed: number) {
  return near < size * 0.09 && speed < 4 ? dwell + 1 : Math.max(0, dwell - 3);
}

/** Eases the dissolve amount towards 1 once the dwell is long enough, back to 0 otherwise. */
export function nextDissolve(dissolve: number, dwell: number) {
  const target = dwell > DWELL_FRAMES ? 1 : 0;
  return dissolve + (target - dissolve) * (target ? 0.02 : 0.03);
}
