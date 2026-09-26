"use client";

import { I18nProvider } from "@heroui/react";
import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export interface ProvidersProps {
  children: React.ReactNode;
  locale: string;
  theme?: ThemeProviderProps;
}

export function ThemeProvider({ children, locale, theme }: ProvidersProps) {
  return (
    <I18nProvider locale={locale}>
      <NextThemesProvider {...theme}>{children}</NextThemesProvider>
    </I18nProvider>
  );
}
