"use client"; // Error boundaries must be Client Components

/**
 * Last resort when the root layout itself fails. It renders its own document without the app's styles or
 * language, so it is self-contained and bilingual.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#fafaf9", color: "#111" }}>
        <title>UniOS</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, margin: "0 auto", borderRadius: 16, background: "#c41233" }} aria-hidden />
          <h1 style={{ fontSize: 24, margin: "24px 0 8px" }}>Что-то пошло не так</h1>
          <p style={{ color: "#6b6b6b", margin: 0 }}>Something went wrong. Попробуйте ещё раз.</p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 24, padding: "10px 18px", border: 0, borderRadius: 12, background: "#c41233", color: "#fff", fontSize: 15, cursor: "pointer" }}
          >
            Попробовать снова · Try again
          </button>
        </main>
      </body>
    </html>
  );
}
