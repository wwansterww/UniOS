"use client";

import { useEffect, useState } from "react";

/** A number that counts up once when it appears. */
export function CountUp({ value, ms = 700 }: { value: number; ms?: number }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (value === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{n}</span>;
}
