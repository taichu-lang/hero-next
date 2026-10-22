"use client";

import {
  ApplyToolCallResults,
  CollectMessageContents,
  MergeToolCallResults,
  Message,
  ToolCallContent,
  ToolResultContent,
} from "hero-next/chat";
import { createContext, useContext, useEffect, useState } from "react";
import { createStore, StoreApi, useStore } from "zustand";

type ChatStatus = "loading" | "idle" | "sending" | "streaming" | "error" | "interrupted";

export interface ChatContextValue {
  /**
   * The container element where the scroll listener is attached.
   */
  scrollElement: HTMLElement | null;

  status: ChatStatus;

  /**
   * Historical messages that have been completed.
   */
  messages: Message[];

  /**
   * The current streaming assistant message.
   */
  streamingMessage: Message | null;

  /**
   * Number of tool calls that have been requested but not finished yet in the current turn.
   */
  runningToolCalls: number;

  setStatus: (status: ChatStatus) => void;

  /**
   * Add user input, the message id will be generated. The server preprocesses the user input, so more than one
   * message might be received.
   */
  addUserMessage: (messages: Message[]) => void;

  /**
   * The generation starts. It belongs to each iteration.
   */
  onStream: (id: string, chunk: string) => void;

  /**
   * Current iteration done.
   */
  onStreamDone: (message: Message) => void;

  /**
   * Tools start running. Tools of one iteration run in parallel.
   */
  onToolCall: (calls: ToolCallContent) => void;

  /**
   * Attach streamed tool results to the matching ToolCallContent in `messages`, so the tool call card can show
   * the outcome. Results without a matching call are ignored.
   */
  onToolResult: (results: ToolResultContent[]) => void;

  /**
   * Hydrate the chat context with historical messages.
   */
  hydrate: (messages: Message[]) => void;
}

const createChatStore = (scroll: HTMLDivElement | null) =>
  createStore<ChatContextValue>()((set, get) => ({
    scrollElement: scroll,
    status: "idle",
    messages: [],
    streamingMessage: null,
    runningToolCalls: 0,

    setStatus: (s) => {
      // A turn that ends (or fails) has no running tools anymore.
      if (s === "idle" || s === "error" || s === "interrupted") {
        set({
          status: s,
          runningToolCalls: 0,
        });
      } else {
        set({ status: s as ChatStatus });
      }
    },

    addUserMessage: (messages: Message[]) => {
      if (get().status !== "sending") {
        throw new Error("invalid message order, chat context should be sending.");
      }

      set((state) => ({
        messages: [...state.messages, ...messages],
        status: "streaming",
      }));
    },

    onStream: (id: string, chunk: string) =>
      set((state) => {
        const lastMessage = state.streamingMessage || {
          contents: [{ type: "text", text: "" }],
          id: "",
          role: "assistant",
        };

        // The model is called only after all tools finish, so the first chunk means no tool is running.
        return {
          status: "streaming",
          runningToolCalls: 0,
          streamingMessage: {
            ...lastMessage,
            id,
            contents: [{ type: "text", text: CollectMessageContents(lastMessage) + chunk }],
          },
        };
      }),

    onStreamDone: (message: Message) =>
      set((state) => {
        return {
          messages: [...state.messages, message],
          streamingMessage: null,
        };
      }),

    onToolCall: () => set((state) => ({ runningToolCalls: state.runningToolCalls + 1 })),

    onToolResult: (results) =>
      set((state) => {
        const messages = ApplyToolCallResults(state.messages, results);
        return {
          runningToolCalls: Math.max(0, state.runningToolCalls - results.length),
          ...(messages ? { messages } : {}),
        };
      }),

    hydrate: (messages) => set({ messages: MergeToolCallResults(messages) }),
  }));

const ChatContext = createContext<StoreApi<ChatContextValue> | null>(null);

export function ChatContextProvider({
  scroll,
  children,
}: {
  scroll: HTMLDivElement | null;
  children: React.ReactNode;
}) {
  // A fresh store per Provider instance. Then, the key of ChatProvider changes, it will be remounted, and all
  // states in ChatContext will be reset, including the network connection. It's a pure way to clean up all the
  // states.
  const [store] = useState(() => createChatStore(scroll));

  // `scroll` starts as null (the ref callback hasn't fired on first render) and the store is only created once,
  // so later scroll updates must be pushed in explicitly or the virtualizer's getScrollElement() stays null
  // forever and getVirtualItems() never returns any rows.
  useEffect(() => {
    store.setState({ scrollElement: scroll });
  }, [store, scroll]);

  return <ChatContext.Provider value={store}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const store = useContext(ChatContext);
  if (!store) {
    throw new Error("useChatContext must be used within a ChatContextProvider");
  }

  return useStore(store);
}
