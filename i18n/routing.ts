import { defineRouting } from "next-intl/routing";

export const Locales = ["en", "zh"];
export const LocalSymbols: Record<
  string,
  {
    name: string;
    flag: string;
  }
> = {
  en: { name: "English", flag: "🇬🇧" },
  zh: { name: "中文", flag: "🇨🇳" },
  ru: { name: "Русский", flag: "🇷🇺" },
  ar: { name: "العربية", flag: "🇸🇦" },
  es: { name: "Español", flag: "🇪🇸" },
  pt: { name: "Português", flag: "🇵🇹" },
  tr: { name: "Türkçe", flag: "🇹🇷" },
  id: { name: "Indonesia", flag: "🇮🇩" },
  ja: { name: "日本語", flag: "🇯🇵" },
  ko: { name: "한국어", flag: "🇰🇷" },
};

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: Locales,

  // Used when no locale matches
  defaultLocale: "zh",
});
