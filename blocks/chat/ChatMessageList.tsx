"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import {
  ChatMessage,
  ChatMessageContextProvider,
  ChatMessageMetadata,
  useChatMessageContext,
} from "hero-next/chat";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { ChatContextProvider, useChatContext } from "./ChatContext";

export interface ChatMessageListProps {
  density?: "compact" | "balanced";
  children: React.ReactNode;
}

export function ChatMessageList({
  density = "balanced",
  children,
}: ChatMessageListProps) {
  const { messages, streamingMessage, scrollElement } =
    useChatContext().getState();

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => messages[index].message_id,
    anchorTo: "end",
    followOnAppend: true,
    // measureElement runs in React's commit phase (ref callback). When the
    // measured size differs from the estimate and anchorTo === "end", the
    // virtualizer syncs scrollTop and then calls notify(sync=true). With
    // useFlushSync=true (the default), that calls flushSync(rerender) from
    // inside a lifecycle method — which React refuses whenever it's already
    // rendering (streaming chat re-renders the parent on every token). Turn
    // it off; the async rerender is one frame later but visually identical.
    useFlushSync: false,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={clsx("flex min-h-0 w-full flex-col", {
        "gap-2": density === "compact",
        "gap-3": density === "balanced",
      })}
    >
      {virtualItems.map((vi) => {
        const message = messages[vi.index];
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <ChatMessageContextProvider message={message}>
              {message.role === "user" ? <UserMessage /> : <AssistantMessage />}
            </ChatMessageContextProvider>
          </div>
        );
      })}
    </div>
  );
}

export function ChatScrollArea({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();

  return (
    <div ref={setContainer} className="flex-1 overflow-y-auto">
      <ChatContextProvider key={pathname} scroll={container}>
        {children}
      </ChatContextProvider>
    </div>
  );
}

function UserMessage() {
  const { message } = useChatMessageContext();
  return (
    <ChatMessage role="user">
      {message.content}
      <ChatMessageMetadata reveal="hover" />
    </ChatMessage>
  );
}

function AssistantMessage() {
  const { message } = useChatMessageContext();

  return (
    <ChatMessage role="assistant">
      <Streamdown controls={false} isAnimating={true}>
        {message.content}
      </Streamdown>
      <ChatMessageMetadata />
    </ChatMessage>
  );
}
