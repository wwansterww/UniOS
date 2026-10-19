import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger" | "soft";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-85",
  accent: "bg-accent text-accent-fg hover:opacity-90",
  outline: "border border-border bg-surface text-fg hover:border-fg/25",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "text-danger hover:bg-danger-soft",
  soft: "bg-surface-2 text-fg hover:bg-border",
};
const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6", className)} {...props} />;
}

type Tone = "neutral" | "red" | "yellow" | "green" | "lavender" | "accent" | "outline" | "solid";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  red: "bg-danger-soft text-danger",
  yellow: "bg-warn-soft text-warn",
  green: "bg-ok-soft text-ok",
  lavender: "bg-surface-2 text-fg",
  accent: "bg-accent-soft text-accent",
  outline: "border border-border text-muted",
  solid: "bg-accent text-accent-fg",
};
export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

const field =
  "w-full rounded-xl border border-field-border bg-field px-3.5 text-sm text-fg placeholder:text-muted/70 transition-colors focus:border-fg/40 focus:outline-none";
export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cn(field, "h-11", className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => (
  <textarea className={cn(field, "min-h-20 py-2.5", className)} {...p} />
);
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cn(field, "h-11", className)} {...p} />;

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      {icon && <div className="mb-1 text-2xl opacity-80">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Page header: small meta line, title, optional one-line description and action. */
export function PageTitle({
  children,
  action,
  eyebrow,
  meta,
  sub,
}: {
  children: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode[];
  sub?: ReactNode;
}) {
  const items = meta ?? (eyebrow ? [eyebrow] : []);
  return (
    <header className="fade-up mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
      <div className="min-w-0">
        {items.length > 0 && (
          <p className="mb-2 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
            {items.map((m, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden>·</span>}
                {m}
              </span>
            ))}
          </p>
        )}
        <h1 className="text-[2.25rem] font-semibold leading-[1.05] sm:text-[3.25rem]">{children}</h1>
        {sub && <div className="mt-2 text-[15px] text-muted">{sub}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="min-w-0 text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** Small coloured dot for a course. */
export function CourseDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}
