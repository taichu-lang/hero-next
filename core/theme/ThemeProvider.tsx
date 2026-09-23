"use client";

import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children, ...themeProps }: ThemeProviderProps) {
  return <NextThemesProvider {...themeProps}>{children}</NextThemesProvider>;
}
