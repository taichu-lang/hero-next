import { Message } from "hero-next/chat";
import { createContext, useContext, useEffect, useState } from "react";
import { createStore, StoreApi, useStore } from "zustand";

type ChatStatus = "idle" | "sending" | "streaming";
type StopReason = "interrupted" | "error" | "done";

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
   * @returns The index of the message in the messages array.
   */
  addUserMessage: (message: Message, assistant_id: string) => number;

  onStream: (messageID: string, chunk: string) => void;

  // The streaming might be stopped in three cases:
  //
  // - User interrupted. In this case, `message` is null.
  // - This turn is completed, `message` is the completed message of this turn.
  // - Something error, ex: the connection is closed.
  //
  stopStreaming: (reason?: StopReason, message?: Message) => void;

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
    status: "idle",
    messages: [],
    streamingMessage: null,

    addUserMessage: (message: Message, assistant_id: string): number => {
      if (get().status !== "idle") {
        throw new Error("invalid message order, chat context should be idle.");
      }

      const index = get().messages.length;

      set((state) => ({
        messages: [...state.messages, message],
        streamingMessage: {
          message_id: assistant_id,
          role: "assistant",
          content: "",
        },
        status: "sending",
      }));

      return index;
    },

    onStream: (messageID: string, chunk: string) =>
      set((state) => {
        const lastMessage = state.streamingMessage;
        if (!lastMessage || lastMessage.role !== "assistant") {
          return state;
        }

        return {
          streamingMessage: {
            ...lastMessage,
            content: lastMessage.content + chunk,
            message_id: messageID,
          },
          status: "streaming",
        };
      }),

    // Client uses AbortController to interrupt the streaming. Once the AbortController is aborted, client drops
    // the connection, which means client does not receive any more data from the server. However, the server
    // might not close the connection to llm provider immediately. We can not get the balance after abort the
    // connection, as there is a time delay between the aborting and usage calculation in the server side. The
    // balance should be updated after the next turn.
    stopStreaming: (reason?: StopReason, message?: Message) =>
      set((state) => {
        const streamingMessage = state.streamingMessage;
        if (!streamingMessage) {
          return {};
        }

        switch (reason) {
          case "interrupted":
            streamingMessage.interrupted = true;
            break;

          case "error":
            streamingMessage.hasError = true;
            break;

          default:
            break;
        }

        return {
          messages: [...state.messages, message || { ...streamingMessage }],
          streamingMessage: null,
          status: "idle",
        };
      }),

    appendMessage: (messages) => set((state) => ({ messages: [...state.messages, ...messages] })),

    prependMessage: (messages) => set((state) => ({ messages: [...messages, ...state.messages] })),

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
