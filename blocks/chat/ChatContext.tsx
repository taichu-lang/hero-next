import { Message } from "hero-next/chat";
import { createContext, useContext, useState } from "react";
import { createStore, StoreApi } from "zustand";

export interface ChatContextValue {
  /**
   * The container element where the scroll listener is attached.
   */
  scrollElement: HTMLElement | null;

  /**
   * Historical messages that have been completed.
   */
  messages: Message[];

  /**
   * The current streaming assistant message.
   */
  streamingMessage: Message | null;

  /**
   * Add new messages.
   */
  appendMessage: (messages: Message[]) => void;

  /**
   * Add previous messages.
   */
  prependMessage: (messages: Message[]) => void;

  /**
   * Hydrate the chat context with historical messages.
   */
  hydrate: (messages: Message[]) => void;
}

const createChatStore = (scroll: HTMLDivElement | null) =>
  createStore<ChatContextValue>()((set, get) => ({
    scrollElement: scroll,
    messages: [],
    streamingMessage: null,

    appendMessage: (messages) =>
      set((state) => ({ messages: [...state.messages, ...messages] })),
    prependMessage: (messages) =>
      set((state) => ({ messages: [...messages, ...state.messages] })),
    hydrate: (messages) => set({ messages }),
  }));

const ChatContext = createContext<StoreApi<ChatContextValue> | null>(null);

export function ChatContextProvider({
  scroll,
  children,
}: {
  scroll: HTMLDivElement | null;
  children: React.ReactNode;
}) {
  // A fresh store per Provider instance. Then, the key of ChatProvider changes, it will be remounted,
  // and all states in ChatContext will be reset, including the network connection. It's a pure way
  // to clean up all the states.
  const [store] = useState(() => createChatStore(scroll));
  return <ChatContext.Provider value={store}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatContextProvider");
  }

  return ctx;
}
