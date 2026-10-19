import { cn } from "./ui";

/** The Narxoz "X": a bold back-slash crossed by a thin curved stroke. */
export function XMark({ className, strokeWidth = 16 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none" strokeLinecap="round">
      <path d="M30 14 L70 86" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M74 14 Q 44 36, 28 86" stroke="currentColor" strokeWidth={strokeWidth * 0.32} />
    </svg>
  );
}

/**
 * Narxoz University logo. Uses the official file from public/brand/narxoz-logo.png when present;
 * otherwise a wordmark in wide capitals. tone="white" for red or dark backgrounds.
 */
export function NarxozLogo({ official, tone = "red", className }: { official?: boolean; tone?: "red" | "white"; className?: string }) {
  if (official)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/narxoz-logo.png" alt="Narxoz University" className={cn("h-8 w-auto", tone === "white" && "brightness-0 invert", className)} />;
  return (
    <span className={cn("inline-flex flex-col leading-none", tone === "white" ? "text-white" : "text-narxoz", className)} aria-label="Narxoz University">
      <span className="font-display text-[1.2rem] font-extrabold tracking-[-0.02em]">NARXOZ</span>
      <span className="mt-[3px] text-[0.47rem] font-bold tracking-[0.5em]">UNIVERSITY</span>
    </span>
  );
}

/** Round Narxoz badge with the X, like the university's social avatar. */
export function NarxozBadge({ className }: { className?: string }) {
  return (
    <span className={cn("grid h-9 w-9 place-items-center rounded-full bg-narxoz text-white", className)} aria-hidden>
      <XMark className="h-5 w-5" strokeWidth={13} />
    </span>
  );
}
