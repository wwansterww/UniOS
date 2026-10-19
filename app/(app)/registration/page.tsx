import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { registrationWindows } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";
import { Countdown } from "@/components/bits";
import { Badge, Card, Empty, PageTitle, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegistrationPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const now = new Date();
  const list = await registrationWindows(user);

  return (
    <div>
      <PageTitle>{t.reg.title}</PageTitle>
      <p className="-mt-3 mb-5 max-w-xl text-muted">{t.reg.hint}</p>
      {list.length === 0 ? (
        <Empty icon="🗂️" title={t.reg.empty} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((w) => {
            const opens = new Date(w.opens_at);
            const closes = new Date(w.closes_at);
            const state = closes <= now ? "closed" : opens <= now ? "open" : "upcoming";
            return (
              <Card key={w.id} className={state === "open" ? "border-fg/30" : ""}>
                <Badge tone={state === "open" ? "accent" : state === "upcoming" ? "lavender" : "neutral"}>{t.reg[state]}</Badge>
                <h2 className="mt-3 text-xl font-semibold leading-tight">{w.title}</h2>
                {w.description && <p className="mt-1 text-sm text-muted">{w.description}</p>}
                {state !== "closed" && (
                  <p className="mt-4 text-3xl font-semibold tabular-nums">
                    <Countdown to={(state === "open" ? closes : opens).toISOString()} wrap={state === "open" ? "closesIn" : "opensIn"} />
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">{t.reg.opens}</dt>
                    <dd className="font-semibold">{formatDateTime(opens, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">{t.reg.closes}</dt>
                    <dd className="font-semibold">{formatDateTime(closes, locale)}</dd>
                  </div>
                </dl>
                <a href={w.url} target="_blank" rel="noreferrer" className={buttonClass(state === "open" ? "primary" : "outline", "lg", "mt-5 w-full")}>
                  {t.reg.go} <ExternalLink size={16} />
                </a>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
