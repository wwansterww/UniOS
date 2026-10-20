import { cn } from "./ui";

/** The official Narxoz "X" glyph (from the university's vector logo), in its own coordinates. */
export const X_PATH = "M429.8 123.9L376.1 43.7H405.4L444.9 104.8L469 67.9H497.5L459.4 123.5L533.3 232.8H504L444.2 142.7L418.5 181.8H390.1L429.8 123.9Z";
export const X_BOX = { x: 376.1, y: 43.7, w: 157.2, h: 189.1 };

/** The Narxoz X on its own. */
export function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox={`${X_BOX.x} ${X_BOX.y} ${X_BOX.w} ${X_BOX.h}`} className={className} aria-hidden fill="currentColor">
      <path d={X_PATH} />
    </svg>
  );
}

/**
 * Narxoz University logo, drawn from the official vector file so it stays sharp and takes any colour:
 * tone="red" on light backgrounds, tone="white" on red or photos. Kazakh pages get "UNİVERSİTETİ".
 */
export function NarxozLogo({ tone = "red", locale, className }: { tone?: "red" | "white"; locale?: string; className?: string }) {
  if (locale === "kk")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/brand/narxoz-kk.png" alt="Narxoz Universiteti" className={cn("h-9 w-auto", tone === "white" && "brightness-0 invert", className)} />
    );
  return (
    <svg
      viewBox="22 40 714 196"
      role="img"
      aria-label="Narxoz University"
      className={cn("h-9 w-auto", tone === "white" ? "text-white" : "text-narxoz", className)}
      fill="currentColor"
    >
      <path d="M25.4 67.9H48.5L101.9 138V67.9H126.6V181.8H105.3L50.1 109.4V181.8H25.4V67.9Z" />
      <path d="M192.5 67.1H215.6L264.4 181.8H238.2L227.8 156.3H179.6L169.2 181.8H143.7L192.5 67.1ZM218.9 134.1L203.8 97.2L188.7 134.1H218.9Z" />
      <path d="M281.5 67.9H333.6C348.1 67.9 359.3 72 366.8 79.4C373.1 85.8 376.6 94.7 376.6 105.8C376.6 124.2 366.7 135.8 352.2 141.1L380 181.8H350.7L326 145.3H306.6V181.8H281.5V67.9ZM332 123.2C344.2 123.2 351.2 116.7 351.2 106.8C351.2 96.1 343.7 90.5 331.5 90.5H306.6V123.2H332Z" />
      <path d={X_PATH} />
      <path d="M504.1 124.8C504.1 92.4 529.6 65.9 564.8 65.9C600 65.9 625.2 92.1 625.2 124.8C625.2 157.2 599.7 183.7 564.5 183.7C529.3 183.7 504.1 157.5 504.1 124.8ZM599 124.8C599 105.3 584.7 89 564.5 89C544.3 89 530.3 105 530.3 124.8C530.3 144.3 544.6 160.6 564.8 160.6C585 160.6 599 144.7 599 124.8Z" />
      <path d="M637.9 162.8L700.6 89.9H639.9V67.9H732.8V86.9L670.1 159.8H732.8V181.8H637.9V162.8Z" />
      <path d="M25.4 216.5V195.2H31.9V216.2C31.9 223.1 35.4 226.8 41.3 226.8C47.1 226.8 50.6 223.3 50.6 216.5V195.2H57V216.2C57 227.2 50.8 232.8 41.1 232.8C31.5 232.8 25.4 227.2 25.4 216.5Z" />
      <path d="M78.4 195.2H84.4L104.2 220.8V195.2H110.6V232.2H105.2L84.8 205.9V232.2H78.4V195.2Z" />
      <path d="M132.9 195.2H139.5V232.2H132.9V195.2Z" />
      <path d="M158.6 195.2H165.8L176.9 223.7L188 195.2H195.1L179.7 232.5H174L158.6 195.2Z" />
      <path d="M213.8 195.2H241.3V201H220.3V210.6H238.9V216.5H220.3V226.4H241.5V232.2H213.8V195.2Z" />
      <path d="M261.7 195.2H278.2C286.9 195.2 292 199.9 292 207C292 213.1 288.4 216.7 283.2 218.2L293.2 232.2H285.5L276.3 219.3H268.3V232.2H261.8L261.7 195.2ZM277.7 213.6C282.3 213.6 285.3 211.2 285.3 207.3C285.3 203.3 282.4 201.2 277.6 201.2H268.1V213.6H277.7Z" />
      <path d="M309.8 226.8L313.7 222.1C317.2 225.2 320.8 226.9 325.4 226.9C329.4 226.9 331.9 225.1 331.9 222.1C331.9 219.5 330.4 218 323.5 216.4C315.6 214.6 311.2 212.2 311.2 205.3C311.2 199 316.5 194.6 323.8 194.6C329.2 194.6 333.5 196.2 337.2 199.3L333.7 204.2C330.4 201.7 327 200.4 323.7 200.4C319.9 200.4 317.7 202.4 317.7 204.9C317.7 207.8 319.4 209 326.5 210.7C334.3 212.6 338.4 215.4 338.4 221.6C338.4 228.5 333 232.6 325.2 232.6C319.6 232.7 314.3 230.8 309.8 226.8Z" />
      <path d="M358.9 195.2H365.4V232.2H358.9V195.2Z" />
      <path d="M396.8 201.2H385.1V195.2H415.1V201.2H403.4V232.2H396.8V201.2Z" />
      <path d="M445.3 217.6L430.6 195.2H438.3L448.7 211.6L459.1 195.2H466.6L451.9 217.5V232.2H445.3V217.6Z" />
    </svg>
  );
}

/** Round Narxoz badge with the X, like the university's social avatar. */
export function NarxozBadge({ className }: { className?: string }) {
  return (
    <span className={cn("grid h-9 w-9 place-items-center rounded-full bg-narxoz text-white", className)} aria-hidden>
      <XMark className="h-5 w-5" />
    </span>
  );
}
