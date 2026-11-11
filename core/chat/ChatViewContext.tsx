"use client";

import { createContext, useContext, useState } from "react";
import { createStore, StoreApi, useStore } from "zustand";
import { ActiveTurnContext, createActiveTurnStore } from "./ActiveTurnContext";
import { MergeToolCallResults, Turn } from "./type";

/**
 * The chat: the turns that are finished. It knows nothing about requests or streaming — the
 * turn in flight lives in ActiveTurnContext and is appended here once it settles.
 */
export interface ChatViewState {
  /**
   * Finished turns, oldest first. One turn is everything the agent produced for one user input.
   */
  turns: Turn[];

  /**
   * The history of the conversation is being fetched.
   */
  loading: boolean;

  actions: ChatViewActions;
}

export interface ChatViewActions {
  setLoading: (loading: boolean) => void;

  /**
   * Replace the turns with the persisted history. The history stores a tool result as a message of its
   * own, apart from the call; here it is attached to the call, which is the shape the streaming path
   * produces too (see ApplyToolCallResults), so the tool call card renders the same in both.
   */
  hydrate: (turns: Turn[]) => void;

  /**
   * Land a turn that has just settled. Called by the active turn store, not by UI.
   */
  appendTurn: (turn: Turn) => void;
}

export type ChatViewStore = StoreApi<ChatViewState>;

export function createChatViewStore(): ChatViewStore {
  return createStore<ChatViewState>()((set) => ({
    turns: [],
    loading: false,
    actions: {
      setLoading: (loading) => set({ loading }),
      hydrate: (turns) =>
        set({ turns: turns.map((turn) => ({ ...turn, messages: MergeToolCallResults(turn.messages) })) }),
      appendTurn: (turn) => set((state) => ({ turns: [...state.turns, turn] })),
    },
  }));
}

export const ChatViewContext = createContext<ChatViewStore | null>(null);

// Used when a consumer renders outside a ChatContextProvider, so the hooks return inert defaults
// instead of throwing.
const fallbackStore = createChatViewStore();

export function useChatView<T>(selector: (state: ChatViewState) => T): T {
  return useStore(useContext(ChatViewContext) ?? fallbackStore, selector);
}

export function useChatViewActions(): ChatViewActions {
  return useChatView((s) => s.actions);
}

// The container element where the list attaches its scroll listener.
const ChatViewScrollContext = createContext<HTMLElement | null>(null);

export function useChatViewScrollElement(): HTMLElement | null {
  return useContext(ChatViewScrollContext);
}

/**
 * Owns the chat state of one conversation page: the finished turns (ConversationContext) and the
 * turn in flight (ActiveTurnContext), which hands its turn over to the former when it settles.
 *
 * The stores are created once per Provider instance. When the key of the Provider changes it is
 * remounted and all state is dropped, including the in-flight request's controller — a pure way to
 * clean up everything.
 */
export function ChatViewProvider({
  scroll,
  children,
}: {
  scroll: HTMLElement | null;
  children: React.ReactNode;
}) {
  const [stores] = useState(() => {
    const chat = createChatViewStore();
    const activeTurn = createActiveTurnStore((turn) => chat.getState().actions.appendTurn(turn));
    return { chat, activeTurn };
  });

  return (
    <ChatViewScrollContext.Provider value={scroll}>
      <ChatViewContext.Provider value={stores.chat}>
        <ActiveTurnContext.Provider value={stores.activeTurn}>{children}</ActiveTurnContext.Provider>
      </ChatViewContext.Provider>
    </ChatViewScrollContext.Provider>
  );
}
