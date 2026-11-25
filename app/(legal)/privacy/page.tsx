import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/time";
import { PRIVACY_UPDATED, PRIVACY_VERSION, privacyDoc } from "@/lib/legal/privacy";
import { LegalDocView, LegalFrame } from "../legal-page";

export const metadata: Metadata = { title: "Политика конфиденциальности" };

/** Public privacy policy (Law of RK No. 94-V, Digital Code art. 24(4): users are told how their data is processed). */
export default async function PrivacyPage() {
  const { t, locale } = await getT();
  const doc = privacyDoc(locale);
  const email = process.env.PRIVACY_EMAIL?.trim();
  return (
    <LegalFrame title={doc.title} meta={`${t.legal.edition(formatDate(PRIVACY_UPDATED, locale))} · ${t.legal.version(PRIVACY_VERSION)}`}>
      <LegalDocView
        doc={doc}
        extra={{
          contact: email ? (
            <p className="mt-3 leading-relaxed">
              {t.legal.contactEmail}{" "}
              <a href={`mailto:${email}`} className="font-medium underline underline-offset-2">
                {email}
              </a>
            </p>
          ) : null,
        }}
      />
    </LegalFrame>
  );
}
