"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageContextProvider,
  ChatMessageMetadata,
  useChatMessageContext,
} from "hero-next/chat";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { ChatContextProvider, useChatContext } from "./ChatContext";

export interface ChatMessageListProps {
  density?: "compact" | "balanced";
}

export function ChatMessageList({
  density = "balanced",
}: ChatMessageListProps) {
  const { messages, scrollElement } = useChatContext();
  const [initialSettled, setInitialSettled] = useState(false);

  // Release the initial-load auto-stick after two animation frames. One rAF
  // gives the virtualizer a paint to run measureElement on the currently
  // rendered bubbles; the second rAF ensures any resize-triggered re-render
  // has also flushed.
  useEffect(() => {
    if (initialSettled || messages.length === 0) return;
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setInitialSettled(true));
    });
    return () => cancelAnimationFrame(t);
  }, [initialSettled, messages.length]);

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
  const totalSize = useMemo(
    () => virtualizer.getTotalSize(),
    // getTotalSize reads virtualizer internals that change on measure; call
    // it every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [virtualizer, virtualItems, messages.length],
  );

  return (
    <div
      className={clsx("flex h-full w-full flex-col", {
        "gap-2": density === "compact",
        "gap-3": density === "balanced",
      })}
    >
      <div
        style={{
          height: `${totalSize}px`,
          position: "relative",
          width: "100%",
        }}
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
                {message.role === "user" ? (
                  <UserMessage />
                ) : (
                  <AssistantMessage />
                )}
              </ChatMessageContextProvider>
            </div>
          );
        })}
      </div>
      <StreamingMessage />
    </div>
  );
}

export function ChatScrollArea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();

  return (
    <div
      ref={setContainer}
      className={clsx("flex h-full flex-col overflow-y-auto", className)}
    >
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
      <ChatMessageBubble variant="filled">{message.content}</ChatMessageBubble>
      <ChatMessageMetadata reveal="hover" />
    </ChatMessage>
  );
}

function AssistantMessage() {
  const { message } = useChatMessageContext();

  return (
    <ChatMessage role="assistant">
      <ChatMessageBubble>
        <Streamdown controls={false} isAnimating={false}>
          {message.content}
        </Streamdown>
      </ChatMessageBubble>
      <ChatMessageMetadata />
    </ChatMessage>
  );
}

function StreamingMessage() {
  const { streamingMessage } = useChatContext();
  if (!streamingMessage) {
    return null;
  }

  if (streamingMessage.content === "") {
    // loading.
  }

  return (
    <div>
      <ChatMessageBubble>
        <Streamdown controls={false} isAnimating={true}>
          {streamingMessage.content}
        </Streamdown>
      </ChatMessageBubble>
    </div>
  );
}
