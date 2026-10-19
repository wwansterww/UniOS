"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dict, type Locale } from "@/lib/i18n";

const Ctx = createContext<{ t: Dict; locale: Locale }>({ t: dictionaries.ru, locale: "ru" });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ t: dictionaries[locale], locale }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
