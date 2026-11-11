"use client";

import { cn } from "@heroui/styles";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChatViewProvider,
  getTurnKey,
  useActiveTurn,
  useChatView,
  useChatViewScrollElement,
} from "hero-next/chat";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatTurn } from "./ChatTurn";

// The pin logic reads and writes scrollTop, so it has to run before paint. The list never renders anything on
// the server, but React still warns about useLayoutEffect there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// How close to the bottom counts as "at the bottom" when deciding whether to resume following it.
const BOTTOM_THRESHOLD = 8;

// What the scrollbar is currently tied to. Either mode is released by the first deliberate scroll gesture;
// "bottom" re-engages once the user scrolls back down to the end.
type Stick = { mode: "message"; id: string } | { mode: "bottom" };

export interface ChatTurnListHandler {
  // Let scrollbar to be sticky to the given message.
  stickToMessage: (id: string) => void;

  // Let scrollbar to be sticky to the bottom, so a streaming message keeps scrolling itself into view.
  scrollToBottom: () => void;
}

export function ChatTurnList({
  handleRef,
  topInset,
  scrollPositionListener,
}: {
  handleRef?: React.Ref<ChatTurnListHandler>;

  /**
   * Blank space to keep above the pinned message, ex: the height of a sticky header. Defaults to the distance
   * between the top of the scrollable content and the list itself, which is exactly the header in the usual
   * layout.
   */
  topInset?: number;

  /**
   * Fired whenever the scroll container's "at (near) bottom" state changes, for callers that render UI
   * outside this list (e.g. a "jump to latest" button) and need to know without holding a ref into the DOM.
   */
  scrollPositionListener?: (bottom: boolean) => void;
}) {
  // The list is virtualized by turn: one turn is everything the agent produced for one user input
  // (the user message plus every iteration's assistant output), so its row owns the whole exchange.
  // The rows are the finished turns of the conversation, followed by the turn in flight, if any.
  const scrollElement = useChatViewScrollElement();
  const turns = useChatView((s) => s.turns);
  const activeTurn = useActiveTurn((s) => s.turn);
  const draft = useActiveTurn((s) => s.draft);
  const items = useMemo(() => (activeTurn ? [...turns, activeTurn] : turns), [turns, activeTurn]);

  const listRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  // What the scrollbar is tied to, and whether we are still holding it there. "message" holds the id of the
  // turn's first user message (the turn id while streaming) rather than an index: stickToMessage() is called
  // from the same event that pushes the turn into the store, so at that point `turns` here is still the previous
  // render's array, and loading older turns later shifts every index anyway.
  //
  // It starts out following the bottom so the list opens on the newest message: the history arrives after mount
  // (hydrate runs in an effect) and the rows are only measured once they render, so the end of the list keeps
  // moving for several commits. Holding "bottom" rides all of them out. The first scroll gesture releases it and
  // stickToMessage() replaces it, exactly as for a pin requested at runtime.
  const stickRef = useRef<Stick | null>({ mode: "bottom" });
  const heldRef = useRef(true);

  // The last scrollTop this component wrote. Scroll events are dispatched at most once per frame and always
  // after the write that caused them, so a scroll landing anywhere else came from the user — dragging the
  // scrollbar, typically, which fires none of the gesture events below.
  const appliedRef = useRef<number | null>(null);

  // Bumped by the imperative handles. They only write refs, which on their own would not schedule anything —
  // and outside a streaming turn there is no other render to piggyback on, so the effect below would never run.
  const [stickTick, setStickTick] = useState(0);

  // Blank space appended after the last message. Without it the last turn is shorter than the viewport, the
  // browser clamps scrollTop to `scrollHeight - clientHeight`, and the pinned message slides back down (on a
  // fresh conversation, all the way back to the first message).
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

  const getItemKey = useCallback((index: number) => getTurnKey(items[index]), [items]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    // A flat estimate for every row: the room the last turn needs to stay pinned is reserved by the spacer below
    // the list, not by inflating the streaming bubble. Inflating it would make the list shrink by a whole
    // viewport the moment the first token lands, which drags the scroll position with it.
    estimateSize: () => 120,
    overscan: 5,
    getItemKey,
    measureElement: (el) => el.getBoundingClientRect().height,

    // We want to stick to the newly user message by default, so disable the following two options.
    //
    // anchorTo: "end",
    // followOnAppend: true,

    // measureElement runs in React's commit phase (ref callback). When the measured size differs from the
    // estimate and anchorTo === "end", the virtualizer syncs scrollTop and then calls notify(sync=true). With
    // useFlushSync=true (the default), that calls flushSync(rerender) from inside a lifecycle method — which
    // React refuses whenever it's already rendering (streaming chat re-renders the parent on every token). Turn
    // it off; the async rerender is one frame later but visually identical.
    useFlushSync: false,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = useMemo(
    () => virtualizer.getTotalSize(),
    // getTotalSize reads virtualizer internals that change on measure; call it every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [virtualizer, virtualItems, items.length],
  );

  const stickToMessage = useCallback((id: string) => {
    // The store was updated in this same event, so `messages` is still the previous array here. Record the id
    // only; the layout effect resolves it to a row once the new list has been committed.
    stickRef.current = { mode: "message", id };
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

  // Last value handed to scrollPositionListener, so the listener only hears about actual transitions and not
  // about every streamed token.
  const reportedRef = useRef<boolean | null>(null);

  // "At the bottom" moves whenever scrollTop, scrollHeight or clientHeight changes, but only the first of those
  // fires an event: collapsing the spacer while parked at scrollTop === 0, growing the list under a held pin and
  // resizing the viewport all change the answer silently. So this is called from the scroll handler *and* after
  // every commit.
  const reportBottom = useCallback(() => {
    if (!scrollElement) return;
    const distance = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop;
    const bottom = distance <= BOTTOM_THRESHOLD;
    if (reportedRef.current === bottom) return;
    reportedRef.current = bottom;
    scrollPositionListener?.(bottom);
  }, [scrollElement, scrollPositionListener]);

  // Any deliberate scroll gesture releases the pin: from then on the list behaves like a plain scroll container
  // again. Programmatic scrollTop writes don't fire these events, so they can't release it by accident.
  useEffect(() => {
    if (!scrollElement) return;
    const release = () => {
      heldRef.current = false;
    };
    // The composer sits inside the scroll container, so every keystroke while typing the next message
    // bubbles here. Typing is not a scroll gesture; only keys aimed at the list itself release the pin.
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      release();
    };
    const onScroll = () => {
      reportBottom();

      const distance = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop;
      const atBottom = distance <= BOTTOM_THRESHOLD;

      if (heldRef.current) {
        const applied = appliedRef.current;
        if (applied !== null && Math.abs(scrollElement.scrollTop - applied) > BOTTOM_THRESHOLD) {
          // A position we didn't write. In bottom mode, landing exactly on the end is the browser clamping
          // scrollTop after a re-measure shrank the content (estimate vs. real row height, markdown
          // reflow) — that's the pin being corrected, not a gesture, so keep holding and resync. Anything
          // else is a user drag: release.
          if (stickRef.current?.mode === "bottom" && atBottom) {
            appliedRef.current = scrollElement.scrollTop;
          } else {
            release();
          }
        }
        // No return after release: fall through so this same event can re-engage bottom mode.
      }

      // Bottom-following is the one mode that can be picked back up: scrolling down to the end again means the
      // user wants to keep watching it.
      if (!heldRef.current && stickRef.current?.mode === "bottom" && atBottom) {
        heldRef.current = true;
        appliedRef.current = scrollElement.scrollTop;
      }
    };
    const opts = { passive: true } as const;
    scrollElement.addEventListener("wheel", release, opts);
    scrollElement.addEventListener("touchmove", release, opts);
    scrollElement.addEventListener("keydown", onKeyDown);
    scrollElement.addEventListener("scroll", onScroll, opts);

    return () => {
      scrollElement.removeEventListener("wheel", release);
      scrollElement.removeEventListener("touchmove", release);
      scrollElement.removeEventListener("keydown", onKeyDown);
      scrollElement.removeEventListener("scroll", onScroll);
    };
  }, [scrollElement, reportBottom]);

  // Hold the scrollbar where it was asked to stay. This runs after every commit — including every streamed token
  // and the commit that lands the finished turn from the active turn into the conversation — so the position survives all
  // of them.
  useIsomorphicLayoutEffect(() => {
    const scrollEl = scrollElement;
    const listEl = listRef.current;
    const anchor = stickRef.current;
    if (!scrollEl || !listEl || !anchor || !heldRef.current) return;

    if (anchor.mode === "bottom") {
      // Reserved space only exists to let a message reach the top; following the bottom would just park the
      // viewport on that blank block.
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

    // Resolve the anchor on every run: tracking it by message id means loading older turns, which shifts every
    // index, doesn't strand it on a different row.
    const anchorIndex = items.findIndex((t) => t.messages.some((m) => m.id === anchor.id));
    if (anchorIndex < 0) return;

    // getTotalSize() refreshes the measurements that measurementsCache reads.
    const total = virtualizer.getTotalSize();
    const anchorStart = virtualizer.measurementsCache[anchorIndex]?.start;
    if (anchorStart === undefined) return;

    // Offset of the list inside the scrollable content, ex: everything a sticky header occupies above it.
    const listTop =
      listEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    const inset = topInset ?? listTop;
    const wanted = Math.max(0, listTop + anchorStart - inset);

    // Whatever sits after the list inside the scroll container, ex: the composer. It counts towards the room
    // below the anchor just like the spacer does.
    const below = Math.max(
      0,
      scrollEl.scrollHeight - (listTop + total + (spacerRef.current?.offsetHeight ?? 0)),
    );

    // `wanted` is only reachable while scrollHeight - clientHeight >= wanted. Reserve the difference.
    const needed = Math.max(0, Math.ceil(wanted + scrollEl.clientHeight - (listTop + total + below)));
    if (Math.abs(needed - spacer) > 1) {
      // Runs before paint, so the re-render this schedules lands in the same frame and the scroll below is
      // applied against the new height.
      setSpacer(needed);
      return;
    }

    if (Math.abs(scrollEl.scrollTop - wanted) > 1) {
      scrollEl.scrollTop = wanted;
    }
    appliedRef.current = scrollEl.scrollTop;
  }, [items, draft, scrollElement, virtualizer, totalSize, viewportHeight, spacer, topInset, stickTick]);

  // Declared after the pin effect so it reads the position the pin just settled on. No dependency array: the
  // answer depends on three measurements the render output doesn't carry, and the ref above keeps the listener
  // from hearing anything it already knows.
  useIsomorphicLayoutEffect(reportBottom);

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
          const turn = items[vi.index];
          const streaming = turn === activeTurn;
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
              <ChatTurn turn={turn} draft={streaming ? draft : null} />
            </div>
          );
        })}
      </div>
      {/* Spacer is used to pin the newly user message to the top. */}
      <div ref={spacerRef} aria-hidden style={{ height: `${spacer}px`, flexShrink: 0 }} />
    </div>
  );
}

export function ChatScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // `overflowAnchor: none` — the list owns its scroll position (see the pin logic in ChatMessageList), and
  // browser scroll anchoring would fight it as the absolutely positioned rows are re-measured.
  return (
    <div
      ref={setContainer}
      className={cn("flex h-full flex-col overflow-y-auto", className)}
      style={{ overflowAnchor: "none" }}
    >
      <ChatViewProvider key={pathname} scroll={container}>
        {children}
      </ChatViewProvider>
    </div>
  );
}
