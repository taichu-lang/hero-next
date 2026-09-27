import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

export async function getTranslations(locale?: string) {
  if (!locale) {
    const paramValue = await rootParams.locale();
    locale = paramValue;
  }

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
}
