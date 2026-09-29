"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageContextProvider,
  ChatMessageMetadata,
  Message,
  useChatMessageContext,
} from "hero-next/chat";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import { ChatContextProvider, useChatContext } from "./ChatContext";

// The pin logic reads and writes scrollTop, so it has to run before paint.
// The list never renders anything on the server, but React still warns about
// useLayoutEffect there.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// How close to the bottom counts as "at the bottom" when deciding whether to
// resume following it.
const BOTTOM_THRESHOLD = 8;

// What the scrollbar is currently tied to. Either mode is released by the
// first deliberate scroll gesture; "bottom" re-engages once the user scrolls
// back down to the end.
type Stick =
  { mode: "message"; index: number; key: string | null } | { mode: "bottom" };

export interface ChatMessageListHandler {
  // Let scrollbar to be sticky to the given message.
  stickToMessage: (index: number) => void;

  // Let scrollbar to be sticky to the bottom, so a streaming message keeps
  // scrolling itself into view.
  scrollToBottom: () => void;
}

export function ChatMessageList({
  handleRef,
  topInset,
}: {
  handleRef?: React.Ref<ChatMessageListHandler>;
  /**
   * Blank space to keep above the pinned message, ex: the height of a sticky
   * header. Defaults to the distance between the top of the scrollable content
   * and the list itself, which is exactly the header in the usual layout.
   */
  topInset?: number;
}) {
  const { messages, scrollElement, streamingMessage } = useChatContext();

  const listRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  // What the scrollbar is tied to, and whether we are still holding it there.
  // For "message", `key` is resolved lazily: stickToMessage() is called from
  // the same event that pushes the message into the store, so at that point
  // `messages` here is still the previous render's array.
  const stickRef = useRef<Stick | null>(null);
  const heldRef = useRef(false);

  // The last scrollTop this component wrote. Scroll events are dispatched at
  // most once per frame and always after the write that caused them, so a
  // scroll landing anywhere else came from the user — dragging the scrollbar,
  // typically, which fires none of the gesture events below.
  const appliedRef = useRef<number | null>(null);

  // Bumped by the imperative handles. They only write refs, which on their own
  // would not schedule anything — and outside a streaming turn there is no
  // other render to piggyback on, so the effect below would never run.
  const [stickTick, setStickTick] = useState(0);

  // Blank space appended after the last message. Without it the last turn is
  // shorter than the viewport, the browser clamps scrollTop to
  // `scrollHeight - clientHeight`, and the pinned message slides back down
  // (on a fresh conversation, all the way back to the first message).
  const [spacer, setSpacer] = useState(0);

  const [viewportHeight, setViewportHeight] = useState(600);

  // Re-run the pin logic whenever the viewport is resized.
  useEffect(() => {
    if (!scrollElement) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    ro.observe(scrollElement);
    return () => ro.disconnect();
  }, [scrollElement]);

  const messageCount = messages.length + (streamingMessage ? 1 : 0);
  const getItem = useCallback(
    (index: number): Message =>
      index < messages.length ? messages[index] : streamingMessage!,
    [messages, streamingMessage],
  );
  const isStreaming = useCallback(
    (index: number) => {
      return streamingMessage !== null && index === messages.length;
    },
    [streamingMessage, messages],
  );
  const getItemKey = useCallback(
    (index: number) => getItem(index).message_id,
    [getItem],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messageCount,
    getScrollElement: () => scrollElement,
    // A flat estimate for every row: the room the last turn needs to stay
    // pinned is reserved by the spacer below the list, not by inflating the
    // streaming bubble. Inflating it would make the list shrink by a whole
    // viewport the moment the first token lands, which drags the scroll
    // position with it.
    estimateSize: () => 120,
    overscan: 5,
    getItemKey,
    measureElement: (el) => el.getBoundingClientRect().height,

    // We want to stick to the newly user message by default, so disable the
    // following two options.
    //
    // anchorTo: "end",
    // followOnAppend: true,

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

  const stickToMessage = useCallback((index: number) => {
    // The store was updated in this same event, so `messages` is still the
    // previous array here. Record the index only; the layout effect resolves
    // it to a message id once the new list has been committed.
    stickRef.current = { mode: "message", index, key: null };
    heldRef.current = true;
    appliedRef.current = null;
    setStickTick((n) => n + 1);
  }, []);

  const scrollToBottom = useCallback(() => {
    stickRef.current = { mode: "bottom" };
    heldRef.current = true;
    appliedRef.current = null;
    setStickTick((n) => n + 1);
  }, []);

  useImperativeHandle(handleRef, () => ({ stickToMessage, scrollToBottom }));

  // Any deliberate scroll gesture releases the pin: from then on the list
  // behaves like a plain scroll container again. Programmatic scrollTop writes
  // don't fire these events, so they can't release it by accident.
  useEffect(() => {
    if (!scrollElement) return;
    const release = () => {
      heldRef.current = false;
    };
    const onScroll = () => {
      if (heldRef.current) {
        const applied = appliedRef.current;
        if (
          applied !== null &&
          Math.abs(scrollElement.scrollTop - applied) > BOTTOM_THRESHOLD
        ) {
          release();
        }
        return;
      }
      // Bottom-following is the one mode that can be picked back up: scrolling
      // down to the end again means the user wants to keep watching it.
      if (stickRef.current?.mode !== "bottom") return;
      const distance =
        scrollElement.scrollHeight -
        scrollElement.clientHeight -
        scrollElement.scrollTop;
      if (distance <= BOTTOM_THRESHOLD) {
        heldRef.current = true;
      }
    };
    const opts = { passive: true } as const;
    scrollElement.addEventListener("wheel", release, opts);
    scrollElement.addEventListener("touchmove", release, opts);
    scrollElement.addEventListener("keydown", release);
    scrollElement.addEventListener("scroll", onScroll, opts);
    return () => {
      scrollElement.removeEventListener("wheel", release);
      scrollElement.removeEventListener("touchmove", release);
      scrollElement.removeEventListener("keydown", release);
      scrollElement.removeEventListener("scroll", onScroll);
    };
  }, [scrollElement]);

  // Hold the scrollbar where it was asked to stay. This runs after every
  // commit — including every streamed token and the commit that moves the
  // finished assistant message from `streamingMessage` into `messages` — so
  // the position survives all of them.
  useIsomorphicLayoutEffect(() => {
    const scrollEl = scrollElement;
    const listEl = listRef.current;
    const anchor = stickRef.current;
    if (!scrollEl || !listEl || !anchor || !heldRef.current) return;

    if (anchor.mode === "bottom") {
      // Reserved space only exists to let a message reach the top; following
      // the bottom would just park the viewport on that blank block.
      if (spacer !== 0) {
        setSpacer(0);
        return;
      }
      const bottom = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (Math.abs(scrollEl.scrollTop - bottom) > 1) {
        scrollEl.scrollTop = bottom;
      }
      appliedRef.current = scrollEl.scrollTop;
      return;
    }

    // Track the anchor by message id so that loading older messages, which
    // shifts every index, doesn't strand it on a different message.
    if (anchor.key === null) {
      anchor.key = messages[anchor.index]?.message_id ?? null;
      if (anchor.key === null) return;
    } else {
      const found = messages.findIndex((m) => m.message_id === anchor.key);
      if (found < 0) return;
      anchor.index = found;
    }

    // getTotalSize() refreshes the measurements that measurementsCache reads.
    const total = virtualizer.getTotalSize();
    const anchorStart = virtualizer.measurementsCache[anchor.index]?.start;
    if (anchorStart === undefined) return;

    // Offset of the list inside the scrollable content, ex: everything a
    // sticky header occupies above it.
    const listTop =
      listEl.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop;
    const inset = topInset ?? listTop;
    const wanted = Math.max(0, listTop + anchorStart - inset);

    // Whatever sits after the list inside the scroll container, ex: the
    // composer. It counts towards the room below the anchor just like the
    // spacer does.
    const below = Math.max(
      0,
      scrollEl.scrollHeight -
        (listTop + total + (spacerRef.current?.offsetHeight ?? 0)),
    );

    // `wanted` is only reachable while
    // scrollHeight - clientHeight >= wanted. Reserve the difference.
    const needed = Math.max(
      0,
      Math.ceil(wanted + scrollEl.clientHeight - (listTop + total + below)),
    );
    if (Math.abs(needed - spacer) > 1) {
      // Runs before paint, so the re-render this schedules lands in the same
      // frame and the scroll below is applied against the new height.
      setSpacer(needed);
      return;
    }

    if (Math.abs(scrollEl.scrollTop - wanted) > 1) {
      scrollEl.scrollTop = wanted;
    }
    appliedRef.current = scrollEl.scrollTop;
  }, [
    messages,
    streamingMessage,
    scrollElement,
    virtualizer,
    totalSize,
    viewportHeight,
    spacer,
    topInset,
    stickTick,
  ]);

  return (
    <div className={"flex h-full w-full flex-col"}>
      <div
        ref={listRef}
        style={{
          height: `${totalSize}px`,
          position: "relative",
          width: "100%",
          flexShrink: 0,
        }}
      >
        {virtualItems.map((vi) => {
          const message = getItem(vi.index);
          const streaming = isStreaming(vi.index);
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
                  <AssistantMessage streaming={streaming} />
                )}
              </ChatMessageContextProvider>
            </div>
          );
        })}
      </div>
      <div
        ref={spacerRef}
        aria-hidden
        style={{ height: `${spacer}px`, flexShrink: 0 }}
      />
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

  // `overflowAnchor: none` — the list owns its scroll position (see the pin
  // logic in ChatMessageList), and browser scroll anchoring would fight it as
  // the absolutely positioned rows are re-measured.
  return (
    <div
      ref={setContainer}
      className={clsx("flex h-full flex-col overflow-y-auto", className)}
      style={{ overflowAnchor: "none" }}
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
      <ChatMessageBubble variant="filled" radius="lg">
        {message.content}
      </ChatMessageBubble>
      <ChatMessageMetadata reveal="hover" />
    </ChatMessage>
  );
}

function AssistantMessage({ streaming = false }: { streaming?: boolean }) {
  const { message } = useChatMessageContext();

  return (
    <ChatMessage role="assistant">
      <ChatMessageBubble>
        <Streamdown controls={false} isAnimating={streaming}>
          {message.content}
        </Streamdown>
      </ChatMessageBubble>
      {streaming || <ChatMessageMetadata />}
    </ChatMessage>
  );
}
