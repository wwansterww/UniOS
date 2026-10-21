"use client";

import { useEffect, useRef } from "react";
import { X_BOX, X_PATH } from "./logo";
import { hitStrength, nextDissolve, nextDwell, stepPearl, type Pearl } from "@/lib/bubble-physics";

/** hx/hy: place in the X relative to the pivot; grow: 0→1 while it re-forms after popping. */
type Dot = Pearl & { hx: number; hy: number; grow: number };
type Bubble = { x: number; y: number; r: number; vy: number; phase: number; freq: number; alpha: number };
type Pop = { x: number; y: number; r: number; age: number };

const POP_FRAMES = 18;

/** A bubble image drawn once and stamped many times (much faster than gradients per frame). */
function sprite(draw: (g: CanvasRenderingContext2D, r: number) => void) {
  const size = 64;
  const c = Object.assign(document.createElement("canvas"), { width: size, height: size });
  draw(c.getContext("2d")!, size / 2);
  return c;
}

/** At rest: a white pearl with a soft highlight. */
const pearlSprite = () =>
  sprite((g, r) => {
    const fill = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.08, r, r, r);
    fill.addColorStop(0, "#ffffff");
    fill.addColorStop(0.55, "rgba(255,255,255,0.97)");
    fill.addColorStop(1, "rgba(255,222,230,0.9)");
    g.fillStyle = fill;
    g.beginPath();
    g.arc(r, r, r - 0.5, 0, Math.PI * 2);
    g.fill();
  });

/** Set free: a soap bubble — clear inside, an iridescent rim and a bright glint. */
const soapSprite = () =>
  sprite((g, r) => {
    const film = g.createRadialGradient(r, r, r * 0.2, r, r, r);
    film.addColorStop(0, "rgba(255,255,255,0.04)");
    film.addColorStop(0.72, "rgba(255,255,255,0.12)");
    film.addColorStop(0.93, "rgba(255,255,255,0.5)");
    film.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = film;
    g.beginPath();
    g.arc(r, r, r - 0.5, 0, Math.PI * 2);
    g.fill();
    const rim = g.createLinearGradient(0, 0, r * 2, r * 2);
    rim.addColorStop(0, "rgba(255,214,236,0.95)");
    rim.addColorStop(0.5, "rgba(255,255,255,0.75)");
    rim.addColorStop(1, "rgba(206,232,255,0.95)");
    g.strokeStyle = rim;
    g.lineWidth = r * 0.09;
    g.beginPath();
    g.arc(r, r, r * 0.9, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.ellipse(r * 0.62, r * 0.58, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2);
    g.fill();
  });

/**
 * The Narxoz X made of small pearls, hanging on a thread and swaying gently. It holds together like a drop:
 * a slow pointer only dents it and it springs back; a quick swipe knocks pearls loose as soap bubbles that float
 * and return; resting on it for a couple of seconds dissolves the whole letter into a cloud; a click pops it.
 * Bubbles that drift too far pop and grow back in place; background bubbles pop when touched.
 * Size: below the element marked data-bubble="top" (the logo); on phones also above data-bubble="text";
 * never depends on the heading's language. Respects prefers-reduced-motion (a still X).
 */
export function BubbleX({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pearl = pearlSprite();
    const soap = soapSprite();

    let W = 0;
    let H = 0;
    let dots: Dot[] = [];
    let bubbles: Bubble[] = [];
    const pops: Pop[] = [];
    let pivot = { x: 0, y: 0 };
    let thread = 0; // pivot → top of the X
    let size = 0; // height of the X
    let raf = 0;
    let visible = true;
    let dissolve = 0; // 0 = a crisp X, 1 = a cloud of floating bubbles
    let dwell = 0; // frames the pointer has rested on the X
    let lastNear = Infinity; // pointer's distance to the nearest place in the X, last frame
    const pointer = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, speed: 0 };
    const start = performance.now();

    const newBubble = (anywhere: boolean): Bubble => ({
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 10 + Math.random() * 40,
      r: 2 + Math.random() * 6,
      vy: 0.15 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      freq: 0.4 + Math.random() * 0.8,
      alpha: 0.25 + Math.random() * 0.35,
    });

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The X hangs at the right, below the logo, the same size in every language: on wide panels it sits beside
      // the heading whatever its length; on phones it sits above a two-line heading (the longest of RU / KK / EN).
      const panel = canvas!.parentElement;
      const logo = panel?.querySelector('[data-bubble="top"]')?.getBoundingClientRect();
      const pad = W < 640 ? 22 : 44;
      const top = (logo ? logo.bottom - rect.top : 0) + (W < 640 ? 18 : 34);
      const ratio = X_BOX.w / X_BOX.h;
      size = Math.min(H - pad - top, (W * 0.5) / ratio, 480);
      const text = panel?.querySelector('[data-bubble="text"]')?.getBoundingClientRect();
      const heading = panel?.querySelector('[data-bubble="text"] h1');
      if (W < 640 && text && heading) {
        const line = parseFloat(getComputedStyle(heading).lineHeight) || heading.getBoundingClientRect().height;
        const twoLinesTop = text.bottom - rect.top - (text.height - heading.getBoundingClientRect().height) - 2 * line;
        size = Math.min(size, twoLinesTop - 22 - top);
      }
      size = Math.max(110, size);
      thread = top;
      pivot = { x: W - pad - (size * ratio) / 2, y: 0 };

      // Sample the official glyph on a hex grid: every filled cell becomes a pearl.
      const scale = size / X_BOX.h;
      const w = Math.ceil(X_BOX.w * scale);
      const h = Math.ceil(size);
      const off = Object.assign(document.createElement("canvas"), { width: w, height: h });
      const o = off.getContext("2d")!;
      o.scale(scale, scale);
      o.translate(-X_BOX.x, -X_BOX.y);
      o.fill(new Path2D(X_PATH));
      const data = o.getImageData(0, 0, w, h).data;
      const step = Math.max(4, size / 62);
      dots = [];
      let row = 0;
      for (let y = step / 2; y < h; y += step * 0.866, row++) {
        for (let x = row % 2 ? step : step / 2; x < w; x += step) {
          if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] < 140) continue;
          dots.push({
            hx: x - w / 2,
            hy: y + thread,
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
            r: step * (0.47 + Math.random() * 0.08),
            amp: size * (0.05 + Math.random() * 0.13),
            fx: 0.6 + Math.random() * 1.2,
            fy: 0.5 + Math.random(),
            ph: Math.random() * Math.PI * 2,
            grow: 1,
          });
        }
      }
      bubbles = Array.from({ length: Math.round((W * H) / 22000) }, () => newBubble(true));
      if (reduce) draw(0);
    }

    const pop = (x: number, y: number, r: number) => {
      if (pops.length < 60) pops.push({ x, y, r, age: 0 });
    };

    function draw(t: number) {
      const c = ctx!;
      c.clearRect(0, 0, W, H);
      const inside = pointer.x > -1e3;

      // A soft light follows the pointer over the panel.
      if (inside && !reduce) {
        const glow = c.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 140);
        glow.addColorStop(0, "rgba(255,255,255,0.10)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = glow;
        c.fillRect(pointer.x - 140, pointer.y - 140, 280, 280);
      }

      // Background bubbles rising; touching one pops it.
      for (const b of bubbles) {
        if (!reduce) {
          b.y -= b.vy;
          b.x += Math.sin(t * b.freq + b.phase) * 0.25;
          if (b.y < -12) Object.assign(b, newBubble(false));
          if (inside && Math.hypot(b.x - pointer.x, b.y - pointer.y) < b.r + 6) {
            pop(b.x, b.y, b.r);
            Object.assign(b, newBubble(false));
          }
        }
        c.globalAlpha = b.alpha;
        c.drawImage(soap, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      c.globalAlpha = 1;

      // A slow pendulum with a little wobble on top.
      const angle = reduce ? 0 : Math.sin((t * Math.PI * 2) / 6.4) * 0.045 + Math.sin((t * Math.PI * 2) / 2.7) * 0.007;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // The thread and the little ring it hangs from.
      const topX = pivot.x - sin * thread;
      const topY = pivot.y + cos * thread;
      const grad = c.createLinearGradient(pivot.x, pivot.y, topX, topY);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,0.6)");
      c.beginPath();
      c.moveTo(pivot.x, pivot.y);
      c.lineTo(topX, topY);
      c.strokeStyle = grad;
      c.lineWidth = 1.2;
      c.stroke();
      c.beginPath();
      c.arc(topX, topY + 3, 3.2, 0, Math.PI * 2);
      c.strokeStyle = "rgba(255,255,255,0.75)";
      c.stroke();

      // How hard the pointer hits: a slow pointer dents the X, a quick swipe knocks pearls loose.
      const hit = hitStrength(pointer.speed);
      const R = size * 0.13;
      let near = Infinity;
      for (const d of dots) {
        // The sway moves the whole X; physics only acts on how far a pearl drifted from its place.
        const homeX = pivot.x + d.hx * cos - d.hy * sin;
        const homeY = pivot.y + d.hx * sin + d.hy * cos;
        if (!reduce) {
          if (inside) near = Math.min(near, Math.abs(homeX - pointer.x) + Math.abs(homeY - pointer.y));
          stepPearl(d, inside ? homeX + d.ox - pointer.x : null, inside ? homeY + d.oy - pointer.y : null, R, hit, dissolve, t);
          // Blown too far: it pops and grows back in place.
          if (dissolve < 0.3 && d.ox * d.ox + d.oy * d.oy > (size * 0.42) ** 2) {
            pop(homeX + d.ox, homeY + d.oy, d.r * 1.8);
            d.ox = d.oy = d.vx = d.vy = 0;
            d.grow = 0;
          }
          if (d.grow < 1) d.grow = Math.min(1, d.grow + 0.05);
        }
        const x = homeX + d.ox;
        const y = homeY + d.oy;

        // At rest a pearl; the further it drifts, the more it turns into a soap bubble.
        const free = Math.min(1, Math.hypot(d.ox, d.oy) / 24);
        const r = d.r * (1 + free * 0.9) * (d.grow < 1 ? d.grow * (2 - d.grow) : 1);
        if (free < 0.98) {
          c.globalAlpha = 1 - free;
          c.drawImage(pearl, x - r, y - r, r * 2, r * 2);
        }
        if (free > 0.02) {
          c.globalAlpha = free;
          c.drawImage(soap, x - r, y - r, r * 2, r * 2);
        }
      }
      c.globalAlpha = 1;
      lastNear = near;

      // Popping rings.
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        const k = p.age / POP_FRAMES;
        c.beginPath();
        c.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, Math.PI * 2);
        c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
        c.lineWidth = 1.2;
        c.stroke();
        if (++p.age > POP_FRAMES) pops.splice(i, 1);
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Pointer speed, smoothed (px per frame).
      if (pointer.px > -1e3 && pointer.x > -1e3) pointer.speed = pointer.speed * 0.7 + Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py) * 0.3;
      else pointer.speed *= 0.7;
      pointer.px = pointer.x;
      pointer.py = pointer.y;
      // Only resting on the X for about two seconds dissolves it; leaving lets it gather back.
      dwell = nextDwell(dwell, lastNear, size, pointer.speed);
      dissolve = nextDissolve(dissolve, dwell);
      if (visible) draw((now - start) / 1000);
    };

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, inside: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom };
    };
    const onMove = (e: PointerEvent) => {
      const p = toLocal(e);
      pointer.x = p.inside ? p.x : -1e4;
      pointer.y = p.inside ? p.y : -1e4;
    };
    // A click near the X pops it: pearls fly off as bubbles, some burst, then they gather back.
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      if (!p.inside) return;
      for (const d of dots) {
        const angle = Math.atan2(pivot.y + d.hy - p.y, pivot.x + d.hx - p.x);
        const dist = Math.hypot(pivot.x + d.hx - p.x, pivot.y + d.hy - p.y) || 1;
        if (dist > size * 0.9) continue;
        const f = (1 - dist / (size * 0.9)) * 18 + 3;
        d.vx += Math.cos(angle) * f + (Math.random() - 0.5) * 5;
        d.vy += Math.sin(angle) * f - Math.random() * 5;
        if (dist < size * 0.12 && Math.random() < 0.35) {
          pop(pivot.x + d.hx, pivot.y + d.hy, d.r * 1.6);
          d.grow = 0;
        }
      }
    };
    const onLeave = () => {
      pointer.x = -1e4;
      pointer.y = -1e4;
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    canvas.parentElement?.querySelectorAll("[data-bubble]").forEach((el) => ro.observe(el));
    // Web fonts change the heading's line height once they load.
    document.fonts?.ready.then(() => layout());
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(canvas);
    if (!reduce) {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
