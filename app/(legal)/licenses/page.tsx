import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import type { LicenceReport } from "@/lib/legal/licenses";
import report from "@/lib/legal/licenses.json";
import { LegalFrame } from "../legal-page";

export const metadata: Metadata = { title: "Открытые лицензии" };

/** Attribution for the open-source packages UniOS ships (MIT, Apache-2.0, BSD… require the notice to travel with the code). */
export default async function LicensesPage() {
  const { t } = await getT();
  const { packages, summary } = report as LicenceReport;
  const groups = (["permissive", "weak", "data"] as const).filter((k) => summary[k] > 0);
  return (
    <LegalFrame title={t.legal.licenses} meta={t.legal.packages(packages.length)}>
      <p className="mt-6 text-[15px] leading-relaxed sm:text-base">{t.legal.licensesLead(packages.length)}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {groups.map((k) => (
          <span key={k} className="rounded-full bg-surface-2 px-3 py-1.5 text-[13px]">
            <span className="font-semibold tabular-nums">{summary[k]}</span> · {t.legal.licensesKind[k]}
          </span>
        ))}
      </div>
      {groups.map((k) => (
        <section key={k} className="mt-10">
          <h2 className="text-lg font-semibold">{t.legal.licensesKind[k]}</h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border text-sm">
            {packages
              .filter((p) => p.kind === k)
              .map((p) => (
                <li key={`${p.name}@${p.version}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
                  <span className="min-w-0 break-all font-medium">
                    {p.name} <span className="font-normal text-muted tabular-nums">{p.version}</span>
                  </span>
                  <span className="text-muted">{p.license}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-[13px] leading-relaxed text-muted">{t.legal.licensesCheck}</p>
    </LegalFrame>
  );
}
