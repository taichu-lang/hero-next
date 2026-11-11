"use client";

import { createContext, useContext, useMemo } from "react";
import { Turn } from "./type";

export interface TurnContextValue {
  turn: Turn;
}

export const TurnContext = createContext<TurnContextValue | null>(null);

export function useTurnContext(): TurnContextValue {
  const ctx = useContext(TurnContext);
  if (!ctx) {
    throw new Error("useTurnContext must be used within a TurnContextProvider");
  }

  return ctx;
}

export function TurnContextProvider({ children, turn }: { children: React.ReactNode; turn: Turn }) {
  const value = useMemo(() => ({ turn }), [turn]);
  return <TurnContext.Provider value={value}>{children}</TurnContext.Provider>;
}
