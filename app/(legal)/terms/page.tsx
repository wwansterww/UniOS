import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/time";
import { TERMS_UPDATED, termsDoc } from "@/lib/legal/terms";
import { LegalDocView, LegalFrame } from "../legal-page";

export const metadata: Metadata = { title: "Условия использования" };

export default async function TermsPage() {
  const { t, locale } = await getT();
  const doc = termsDoc(locale);
  return (
    <LegalFrame title={doc.title} meta={t.legal.edition(formatDate(TERMS_UPDATED, locale))}>
      <LegalDocView doc={doc} />
    </LegalFrame>
  );
}
