import "server-only";
import { currentLocale } from "../auth";
import { dictionaries } from ".";

export async function getT() {
  const locale = await currentLocale();
  return { t: dictionaries[locale], locale };
}
