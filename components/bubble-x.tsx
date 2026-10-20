"use client";

import { useEffect, useRef } from "react";
import { X_BOX, X_PATH } from "./logo";

/** hx/hy: place in the X relative to the pivot; ox/oy: how far it drifted away; amp/fx/fy/ph: its own floating path. */
type Dot = { hx: number; hy: number; ox: number; oy: number; vx: number; vy: number; r: number; x: number; y: number; amp: number; fx: number; fy: number; ph: number };
type Bubble = { x: number; y: number; r: number; vy: number; phase: number; freq: number; alpha: number };

/**
 * The Narxoz X made of small bubbles, hanging on a thread and swaying gently.
 * Under the pointer it dissolves into floating bubbles, a click pops it; it always gathers back.
 * Ambient bubbles drift up behind it. Respects prefers-reduced-motion (a still X).
 * It finds free room on its own: below the element marked data-bubble="top" (the logo) and,
 * unless it fits beside it, above the one marked data-bubble="text".
 */
export function BubbleX({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let dots: Dot[] = [];
    let bubbles: Bubble[] = [];
    let pivot = { x: 0, y: 0 };
    let thread = 0; // pivot → top of the X
    let size = 0; // height of the X
    let raf = 0;
    let dissolve = 0; // 0 = a crisp X, 1 = a cloud of floating bubbles
    let lastNear = Infinity; // pointer's distance to the nearest place in the X, last frame
    let visible = true;
    const pointer = { x: -1e4, y: -1e4 };
    const start = performance.now();

    const newBubble = (anywhere: boolean): Bubble => ({
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 10 + Math.random() * 40,
      r: 1.5 + Math.random() * 5.5,
      vy: 0.15 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      freq: 0.4 + Math.random() * 0.8,
      alpha: 0.08 + Math.random() * 0.2,
    });

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The X hangs at the right, below the logo; as big as fits beside the text, or else above it.
      const box = (sel: string) => canvas!.parentElement?.querySelector(`[data-bubble="${sel}"]`)?.getBoundingClientRect();
      const logo = box("top");
      const text = box("text");
      const pad = W < 640 ? 22 : 44;
      const top = (logo ? logo.bottom - rect.top : 0) + (W < 640 ? 18 : 34);
      const ratio = X_BOX.w / X_BOX.h;
      size = Math.min(H - pad - top, (W * 0.5) / ratio, 480);
      if (text && W - pad - size * ratio < text.right - rect.left + 12) size = Math.min(size, text.top - rect.top - 26 - top);
      size = Math.max(110, size);
      thread = top;
      pivot = { x: W - pad - (size * ratio) / 2, y: 0 };

      // Sample the official glyph on a hex grid: every filled cell becomes a bubble.
      const scale = size / X_BOX.h;
      const w = Math.ceil(X_BOX.w * scale);
      const h = Math.ceil(size);
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d")!;
      o.scale(scale, scale);
      o.translate(-X_BOX.x, -X_BOX.y);
      o.fill(new Path2D(X_PATH));
      const data = o.getImageData(0, 0, w, h).data;
      const step = Math.max(4, size / 62);
      dots = [];
      let row = 0;
      for (let y = step / 2; y < h; y += step * 0.866, row++) {
        for (let x = (row % 2 ? step : step / 2); x < w; x += step) {
          if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] < 140) continue;
          const hx = x - w / 2;
          const hy = y + thread;
          dots.push({ hx, hy, ox: 0, oy: 0, vx: 0, vy: 0, r: step * (0.47 + Math.random() * 0.08), x: pivot.x + hx, y: pivot.y + hy,
            amp: size * (0.05 + Math.random() * 0.13), fx: 0.6 + Math.random() * 1.2, fy: 0.5 + Math.random(), ph: Math.random() * Math.PI * 2 });
        }
      }
      bubbles = Array.from({ length: Math.round((W * H) / 22000) }, () => newBubble(true));
      if (reduce) draw(0);
    }

    function draw(t: number) {
      const c = ctx!;
      c.clearRect(0, 0, W, H);

      // Ambient bubbles rising behind everything.
      for (const b of bubbles) {
        if (!reduce) {
          b.y -= b.vy;
          b.x += Math.sin(t * b.freq + b.phase) * 0.25;
          if (b.y < -12) Object.assign(b, newBubble(false));
        }
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.strokeStyle = `rgba(255,255,255,${b.alpha})`;
        c.lineWidth = 1;
        c.stroke();
      }

      // A slow pendulum with a little wobble on top.
      const angle = reduce ? 0 : Math.sin((t * Math.PI * 2) / 6.4) * 0.045 + Math.sin((t * Math.PI * 2) / 2.7) * 0.007;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // The thread and a little ring it hangs from.
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

      const R = size * 0.17;
      let near = Infinity;
      for (const d of dots) {
        // The sway moves the whole X; physics only acts on how far a bubble was pushed from its place.
        const homeX = pivot.x + d.hx * cos - d.hy * sin;
        const homeY = pivot.y + d.hx * sin + d.hy * cos;
        if (!reduce) {
          near = Math.min(near, Math.abs(homeX - pointer.x) + Math.abs(homeY - pointer.y));
          const dx = homeX + d.ox - pointer.x;
          const dy = homeY + d.oy - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < R * R) {
            const dist = Math.sqrt(dist2) || 1;
            // Gentle while the whole X is dissolving, so it becomes a cloud rather than a ring.
            const f = (1 - dist / R) * 2 * (1 - dissolve * 0.75);
            d.vx += (dx / dist) * f + (Math.random() - 0.5) * 0.5;
            d.vy += (dy / dist) * f - 0.35; // bubbles float up
          }
          // Dissolved, every bubble drifts along its own wavy path upwards; otherwise it springs home.
          const tx = dissolve * d.amp * Math.sin(t * d.fx + d.ph);
          const ty = dissolve * (-d.amp * 0.8 + d.amp * 0.6 * Math.cos(t * d.fy + d.ph));
          d.vx = (d.vx + (tx - d.ox) * 0.012) * 0.92;
          d.vy = (d.vy + (ty - d.oy) * 0.012) * 0.92;
          d.ox += d.vx;
          d.oy += d.vy;
        }
        d.x = homeX + d.ox;
        d.y = homeY + d.oy;

        // At home a dot is solid; the further it drifts, the more it looks like a soap bubble.
        const free = Math.min(1, Math.hypot(d.ox, d.oy) / 24);
        const r = d.r * (1 + free * 0.9);
        c.beginPath();
        c.arc(d.x, d.y, r, 0, Math.PI * 2);
        if (free < 0.12) {
          c.fillStyle = "#fff";
          c.fill();
        } else {
          c.fillStyle = `rgba(255,255,255,${0.95 - free * 0.85})`;
          c.fill();
          c.strokeStyle = `rgba(255,255,255,${0.9 - free * 0.35})`;
          c.lineWidth = 1;
          c.stroke();
          c.beginPath();
          c.arc(d.x - r * 0.35, d.y - r * 0.35, r * 0.26, 0, Math.PI * 2);
          c.fillStyle = `rgba(255,255,255,${0.35 + free * 0.5})`;
          c.fill();
        }
      }
      lastNear = near;
    }

    const loop = (now: number) => {
      // Hovering the X (pointer within a few bubbles of it) dissolves it; leaving lets it gather back slowly.
      const over = lastNear < size * 0.09;
      dissolve += ((over ? 1 : 0) - dissolve) * (over ? 0.06 : 0.025);
      raf = requestAnimationFrame(loop);
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
    // A click near the X pops it: every bubble flies off, then they gather back.
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      if (!p.inside) return;
      for (const d of dots) {
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > size * 0.9) continue;
        const f = (1 - dist / (size * 0.9)) * 22 + 4;
        d.vx += (dx / dist) * f + (Math.random() - 0.5) * 6;
        d.vy += (dy / dist) * f - Math.random() * 6;
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
