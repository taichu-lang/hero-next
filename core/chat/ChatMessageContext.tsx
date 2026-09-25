"use client";

import { createContext, useContext } from "react";
import { Message } from "./type";

export interface ChatMessageContextValue {
  message: Message;
}

export const ChatMessageContext = createContext<ChatMessageContextValue | null>(
  null,
);

export function useChatMessageContext(): ChatMessageContextValue {
  const ctx = useContext(ChatMessageContext);
  if (!ctx) {
    throw new Error(
      "useChatMessageContext must be used within a ChatMessageContextProvider",
    );
  }

  return ctx;
}

export function ChatMessageContextProvider({
  children,
  message,
}: {
  children: React.ReactNode;
  message: Message;
}) {
  return (
    <ChatMessageContext.Provider value={{ message }}>
      {children}
    </ChatMessageContext.Provider>
  );
}
