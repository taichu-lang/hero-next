"use client";

import { defaultRangeExtractor, Range, useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { Loading } from "hero-next/effects";
import {
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

// useLayoutEffect emits an SSR warning; fall back to useEffect on the server.
// The component itself is client-only, but Next.js still runs its module
// evaluation during SSR of the shell.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Sentinel prefetch band, in pixels. Fetches trigger when a sentinel comes
// within this distance of the viewport, so the next page is loading before
// the user hits the edge. The auto-fill loop below uses the same value to
// decide whether the initial content leaves the sentinel already inside the
// band — if so, IntersectionObserver's isIntersecting never flips and we
// have to nudge the fetch manually.
const SENTINEL_ROOT_MARGIN_PX = 200;

export type InfinitePage<T> = T[];

export interface InfiniteSection<T> {
  key: string;
  fetch: (params: {
    before?: string;
    after?: string;
    limit: number;
    signal: AbortSignal;
  }) => Promise<InfinitePage<T>>;
  getItemKey: (item: T) => string;
  /**
   * When set, the first fetch uses these cursors and both directions are
   * probed by sentinels. When absent the first fetch is a fresh top-of-list
   * load and only the bottom direction is probed.
   */
  initialCursor?: { before?: string; after?: string };
  marginTop?: number;
  marginBottom?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  estimateItemSize?: number;
  showWhenEmpty?: boolean;
  emptyState?: ReactNode;
}

export interface InfiniteScrollViewHandle {
  scrollToSection: (key: string) => void;
  scrollToTop: () => void;
  /** Scroll to the last already-loaded row. Does not trigger a fetch. */
  scrollToBottom: () => void;
  /** Reset a section (or all sections if omitted) and re-run its initial fetch. */
  refresh: (sectionKey?: string) => void;
}

export interface InfiniteScrollViewProps<T> {
  sections: InfiniteSection<T>[];
  renderItem: (item: T, meta: { sectionKey: string; index: number }) => ReactNode;
  renderHeader?: (
    sectionKey: string,
    meta: { collapsed: boolean; collapsible: boolean; toggle: () => void },
  ) => ReactNode;
  limit?: number;
  estimateItemSize?: number;
  estimateHeaderSize?: number;
  overscan?: number;
  loadingIndicator?: ReactNode;
  className?: string;
  handleRef?: Ref<InfiniteScrollViewHandle>;
  ref?: Ref<HTMLDivElement>;
}

interface SectionState<T> {
  items: T[];
  topCursor?: string;
  bottomCursor?: string;
  hasMoreTop: boolean;
  hasMoreBottom: boolean;
  initialized: boolean;
  loadingInit: boolean;
  loadingTop: boolean;
  loadingBottom: boolean;
  collapsed: boolean;
  error: unknown;
}

type State<T> = Record<string, SectionState<T>>;

type Action<T> =
  | { type: "ensure"; key: string; initial: SectionState<T> }
  | { type: "reset"; key: string; initial: SectionState<T> }
  | { type: "remove"; key: string }
  | { type: "initStart"; key: string }
  | {
      type: "initDone";
      key: string;
      items: T[];
      topKey?: string;
      bottomKey?: string;
      hasMoreTop: boolean;
      hasMoreBottom: boolean;
    }
  | { type: "initError"; key: string; error: unknown }
  | { type: "loadTopStart"; key: string }
  | {
      type: "loadTopDone";
      key: string;
      items: T[];
      topKey?: string;
      hasMoreTop: boolean;
    }
  | { type: "loadTopError"; key: string; error: unknown }
  | { type: "loadBottomStart"; key: string }
  | {
      type: "loadBottomDone";
      key: string;
      items: T[];
      bottomKey?: string;
      hasMoreBottom: boolean;
    }
  | { type: "loadBottomError"; key: string; error: unknown }
  | { type: "toggleCollapsed"; key: string };

function makeInitialSectionState<T>(section: InfiniteSection<T>): SectionState<T> {
  const hasInitialCursor = section.initialCursor?.before != null || section.initialCursor?.after != null;
  return {
    items: [],
    topCursor: undefined,
    bottomCursor: undefined,
    // If jumped to middle, both directions may have more; otherwise assume
    // top-of-list (no more above). The initial fetch will refine this via
    // items.length === limit.
    hasMoreTop: hasInitialCursor,
    hasMoreBottom: true,
    initialized: false,
    loadingInit: false,
    loadingTop: false,
    loadingBottom: false,
    collapsed: !!section.defaultCollapsed,
    error: null,
  };
}

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "ensure":
      if (state[action.key]) return state;
      return { ...state, [action.key]: action.initial };
    case "reset":
      return { ...state, [action.key]: action.initial };
    case "remove": {
      if (!state[action.key]) return state;
      const next = { ...state };
      delete next[action.key];
      return next;
    }
    case "initStart": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: { ...s, loadingInit: true, error: null },
      };
    }
    case "initDone": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: {
          ...s,
          items: action.items,
          topCursor: action.topKey,
          bottomCursor: action.bottomKey,
          hasMoreTop: action.hasMoreTop,
          hasMoreBottom: action.hasMoreBottom,
          initialized: true,
          loadingInit: false,
          error: null,
        },
      };
    }
    case "initError": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: {
          ...s,
          initialized: true,
          loadingInit: false,
          error: action.error,
        },
      };
    }
    case "loadTopStart": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: { ...s, loadingTop: true, error: null },
      };
    }
    case "loadTopDone": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: {
          ...s,
          items: [...action.items, ...s.items],
          topCursor: action.topKey ?? s.topCursor,
          hasMoreTop: action.hasMoreTop,
          loadingTop: false,
          error: null,
        },
      };
    }
    case "loadTopError": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: { ...s, loadingTop: false, error: action.error },
      };
    }
    case "loadBottomStart": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: { ...s, loadingBottom: true, error: null },
      };
    }
    case "loadBottomDone": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: {
          ...s,
          items: [...s.items, ...action.items],
          bottomCursor: action.bottomKey ?? s.bottomCursor,
          hasMoreBottom: action.hasMoreBottom,
          loadingBottom: false,
          error: null,
        },
      };
    }
    case "loadBottomError": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: { ...s, loadingBottom: false, error: action.error },
      };
    }
    case "toggleCollapsed": {
      const s = state[action.key];
      if (!s) return state;
      return {
        ...state,
        [action.key]: { ...s, collapsed: !s.collapsed },
      };
    }
  }
}

type Row<T> =
  | { kind: "top-margin"; sectionKey: string; size: number }
  | { kind: "header"; sectionKey: string }
  | { kind: "top-sentinel"; sectionKey: string }
  | {
      kind: "item";
      sectionKey: string;
      item: T;
      itemIndex: number;
      itemKey: string;
    }
  | { kind: "bottom-sentinel"; sectionKey: string }
  | { kind: "loading-init"; sectionKey: string }
  | { kind: "empty"; sectionKey: string }
  | { kind: "bottom-margin"; sectionKey: string; size: number };

/**
 * InfiniteScrollView — data-managing virtualized list. Consumers pass a
 * fetch(before, after, limit) per section; the component owns pagination
 * state, both-direction sentinels, and scroll-anchor preservation on top
 * prepend. Header sticks per-section (largest-header-index-<=-startIndex
 * rangeExtractor trick).
 */
export function InfiniteScrollView<T>({
  sections,
  renderItem,
  renderHeader,
  limit = 30,
  estimateItemSize = 36,
  estimateHeaderSize = 32,
  overscan = 6,
  loadingIndicator = <Loading />,
  className,
  handleRef,
  ref,
}: InfiniteScrollViewProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as { current: HTMLDivElement | null }).current = node;
      }
    },
    [ref],
  );

  const [state, dispatch] = useReducer(reducer as (s: State<T>, a: Action<T>) => State<T>, {} as State<T>);

  // Latest values captured in refs so the fetch callbacks stay stable and
  // read fresh data at fire time (sentinel callbacks would otherwise close
  // over stale state / section defs).
  const sectionsRef = useRef(sections);
  const stateRef = useRef(state);
  const limitRef = useRef(limit);
  useEffect(() => {
    sectionsRef.current = sections;
  });
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    limitRef.current = limit;
  });

  // Concurrency guards — refs, not state, so bursts of IntersectionObserver
  // callbacks within the same frame all short-circuit before React commits.
  const inflightRef = useRef<Record<string, { init: boolean; top: boolean; bottom: boolean }>>({});
  const epochRef = useRef<Record<string, number>>({});
  const abortRef = useRef<
    Record<
      string,
      {
        init?: AbortController;
        top?: AbortController;
        bottom?: AbortController;
      }
    >
  >({});
  const knownKeysRef = useRef<Set<string>>(new Set());

  // Anchor-preservation queue for top-prepends. `loadTop` snapshots
  // scrollHeight into this ref just before dispatching, and a layout effect
  // reads it after commit, measures the new height, and applies the delta so
  // the user's visible content stays put. Using the earliest captured height
  // across all pending keys handles the case where two sections prepend in
  // the same batched render.
  const pendingTopAnchorRef = useRef<Record<string, number>>({});

  const getInflight = (key: string) => {
    return (inflightRef.current[key] ??= {
      init: false,
      top: false,
      bottom: false,
    });
  };
  const getAborts = (key: string) => {
    return (abortRef.current[key] ??= {});
  };

  const abortAll = useCallback((key: string) => {
    const aborts = abortRef.current[key];
    if (!aborts) return;
    aborts.init?.abort();
    aborts.top?.abort();
    aborts.bottom?.abort();
    aborts.init = undefined;
    aborts.top = undefined;
    aborts.bottom = undefined;
  }, []);

  const loadInit = useCallback((key: string) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section) return;
    const inflight = getInflight(key);
    if (inflight.init) return;
    inflight.init = true;

    const epoch = (epochRef.current[key] = (epochRef.current[key] ?? 0) + 1);
    const controller = new AbortController();
    getAborts(key).init = controller;

    dispatch({ type: "initStart", key });

    const currentLimit = limitRef.current;
    void (async () => {
      try {
        const items = await section.fetch({
          before: section.initialCursor?.before,
          after: section.initialCursor?.after,
          limit: currentLimit,
          signal: controller.signal,
        });
        if (epoch !== epochRef.current[key]) return;
        const topKey = items.length > 0 ? section.getItemKey(items[0]) : undefined;
        const bottomKey = items.length > 0 ? section.getItemKey(items[items.length - 1]) : undefined;
        const hasInitialCursor = section.initialCursor?.before != null || section.initialCursor?.after != null;
        // From-top load: nothing above. Middle-jump: assume both sides may
        // have more (a subsequent empty page will settle it). Bottom count
        // rule same as any page: full page means probably more.
        const hasMoreTop = hasInitialCursor && items.length > 0;
        const hasMoreBottom = items.length === currentLimit;
        dispatch({
          type: "initDone",
          key,
          items,
          topKey,
          bottomKey,
          hasMoreTop,
          hasMoreBottom,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (epoch !== epochRef.current[key]) return;
        dispatch({ type: "initError", key, error: err });
      } finally {
        if (epoch === epochRef.current[key]) {
          inflight.init = false;
          if (getAborts(key).init === controller) {
            getAborts(key).init = undefined;
          }
        }
      }
    })();
  }, []);

  const loadTop = useCallback((key: string) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section) return;
    const s = stateRef.current[key];
    if (!s || !s.hasMoreTop || !s.initialized) return;
    const inflight = getInflight(key);
    if (inflight.init || inflight.top) return;
    inflight.top = true;

    const epoch = epochRef.current[key] ?? 0;
    const controller = new AbortController();
    getAborts(key).top = controller;

    dispatch({ type: "loadTopStart", key });

    const currentLimit = limitRef.current;
    const beforeCursor = s.topCursor;
    void (async () => {
      try {
        const items = await section.fetch({
          before: beforeCursor,
          limit: currentLimit,
          signal: controller.signal,
        });
        if (epoch !== epochRef.current[key]) return;
        const topKey = items.length > 0 ? section.getItemKey(items[0]) : undefined;
        const hasMoreTop = items.length === currentLimit;

        // Scroll-anchor preservation: snapshot scrollHeight *before* dispatch
        // so the layout effect below can measure the post-commit height and
        // scrollBy the delta. Without this, prepending N rows shifts the
        // entire viewport downward by their combined estimated height.
        const scrollEl = scrollRef.current;
        if (scrollEl) {
          pendingTopAnchorRef.current[key] = scrollEl.scrollHeight;
        }
        dispatch({
          type: "loadTopDone",
          key,
          items,
          topKey,
          hasMoreTop,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (epoch !== epochRef.current[key]) return;
        dispatch({ type: "loadTopError", key, error: err });
      } finally {
        if (epoch === epochRef.current[key]) {
          inflight.top = false;
          if (getAborts(key).top === controller) {
            getAborts(key).top = undefined;
          }
        }
      }
    })();
  }, []);

  const loadBottom = useCallback((key: string) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section) return;
    const s = stateRef.current[key];
    if (!s || !s.hasMoreBottom || !s.initialized) return;
    const inflight = getInflight(key);
    if (inflight.init || inflight.bottom) return;
    inflight.bottom = true;

    const epoch = epochRef.current[key] ?? 0;
    const controller = new AbortController();
    getAborts(key).bottom = controller;

    dispatch({ type: "loadBottomStart", key });

    const currentLimit = limitRef.current;
    const afterCursor = s.bottomCursor;
    void (async () => {
      try {
        const items = await section.fetch({
          after: afterCursor,
          limit: currentLimit,
          signal: controller.signal,
        });
        if (epoch !== epochRef.current[key]) return;
        const bottomKey = items.length > 0 ? section.getItemKey(items[items.length - 1]) : undefined;
        const hasMoreBottom = items.length === currentLimit;
        dispatch({
          type: "loadBottomDone",
          key,
          items,
          bottomKey,
          hasMoreBottom,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (epoch !== epochRef.current[key]) return;
        dispatch({ type: "loadBottomError", key, error: err });
      } finally {
        if (epoch === epochRef.current[key]) {
          inflight.bottom = false;
          if (getAborts(key).bottom === controller) {
            getAborts(key).bottom = undefined;
          }
        }
      }
    })();
  }, []);

  const refresh = useCallback(
    (sectionKey?: string) => {
      const targets = sectionKey
        ? sectionsRef.current.filter((s) => s.key === sectionKey)
        : sectionsRef.current;
      for (const section of targets) {
        abortAll(section.key);
        const inflight = getInflight(section.key);
        inflight.init = false;
        inflight.top = false;
        inflight.bottom = false;
        epochRef.current[section.key] = (epochRef.current[section.key] ?? 0) + 1;
        dispatch({
          type: "reset",
          key: section.key,
          initial: makeInitialSectionState(section),
        });
      }
    },
    [abortAll],
  );

  const toggleCollapsed = useCallback((key: string) => {
    dispatch({ type: "toggleCollapsed", key });
  }, []);

  // Sync the `sections` prop with reducer state: add new keys, drop removed
  // keys, and abort in-flight fetches for the dropped ones.
  useEffect(() => {
    const currentKeys = new Set(sections.map((s) => s.key));
    for (const key of knownKeysRef.current) {
      if (!currentKeys.has(key)) {
        abortAll(key);
        delete abortRef.current[key];
        delete inflightRef.current[key];
        delete epochRef.current[key];
        dispatch({ type: "remove", key });
      }
    }
    for (const section of sections) {
      if (!knownKeysRef.current.has(section.key)) {
        dispatch({
          type: "ensure",
          key: section.key,
          initial: makeInitialSectionState(section),
        });
      }
    }
    knownKeysRef.current = currentKeys;
  }, [sections, abortAll]);

  // Trigger initial fetch for any section that has state but hasn't been
  // initialized yet. Runs after ensure/reset dispatches land.
  useEffect(() => {
    for (const section of sections) {
      const s = state[section.key];
      if (!s) continue;
      if (s.initialized || s.loadingInit) continue;
      if (s.error) continue;
      loadInit(section.key);
    }
  }, [sections, state, loadInit]);

  // Abort everything on unmount.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const key of Object.keys(abortRef.current)) {
        abortAll(key);
      }
    };
  }, [abortAll]);

  // Scroll-anchor pass. Runs after every commit — cheap short-circuit when
  // no top-prepend is pending. Using the minimum captured `before` across
  // pending keys correctly handles two sections prepending in the same
  // batched commit (delta is measured against the earliest pre-commit
  // height, so the aggregate is applied exactly once).
  useIsoLayoutEffect(() => {
    const pending = pendingTopAnchorRef.current;
    const keys = Object.keys(pending);
    if (keys.length === 0) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      for (const key of keys) delete pending[key];
      return;
    }
    let minBefore = Infinity;
    for (const key of keys) {
      if (pending[key] < minBefore) minBefore = pending[key];
      delete pending[key];
    }
    const delta = scrollEl.scrollHeight - minBefore;
    if (delta !== 0) scrollEl.scrollBy(0, delta);
  });

  // Auto-fill until scrollable. IntersectionObserver only fires on
  // `isIntersecting` transitions — if the initial page leaves the bottom
  // sentinel already inside the rootMargin band (short list in a tall
  // container), it never flips back out and `loadBottom` never runs. Nudge
  // it here whenever content isn't tall enough to push the sentinel past
  // the prefetch band.
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (scrollEl.scrollHeight > scrollEl.clientHeight + SENTINEL_ROOT_MARGIN_PX) return;
    for (const section of sections) {
      const s = state[section.key];
      if (!s?.initialized || !s.hasMoreBottom) continue;
      if (s.loadingInit || s.loadingBottom) continue;
      loadBottom(section.key);
    }
  }, [sections, state, loadBottom]);

  const { rows, headerIndexBySection, headerIndices } = useMemo(() => {
    const rows: Row<T>[] = [];
    const headerMap = new Map<string, number>();
    const headers: number[] = [];

    sections.forEach((section, sectionIdx) => {
      const s = state[section.key];
      if (!s) return;
      if (section.showWhenEmpty === false && s.initialized && s.items.length === 0) {
        return;
      }

      if (sectionIdx > 0 && (section.marginTop ?? 0) > 0) {
        rows.push({
          kind: "top-margin",
          sectionKey: section.key,
          size: section.marginTop!,
        });
      }

      if (renderHeader) {
        const headerIdx = rows.length;
        headerMap.set(section.key, headerIdx);
        headers.push(headerIdx);
        rows.push({ kind: "header", sectionKey: section.key });
      }

      if (!s.collapsed) {
        if (s.loadingInit && s.items.length === 0) {
          rows.push({ kind: "loading-init", sectionKey: section.key });
        } else {
          if (s.hasMoreTop) {
            rows.push({ kind: "top-sentinel", sectionKey: section.key });
          }
          for (let i = 0; i < s.items.length; i++) {
            const item = s.items[i];
            rows.push({
              kind: "item",
              sectionKey: section.key,
              item,
              itemIndex: i,
              itemKey: section.getItemKey(item),
            });
          }
          if (s.hasMoreBottom) {
            rows.push({ kind: "bottom-sentinel", sectionKey: section.key });
          }
          if (s.items.length === 0 && !s.hasMoreTop && !s.hasMoreBottom && section.emptyState !== undefined) {
            rows.push({ kind: "empty", sectionKey: section.key });
          }
        }
      }

      if ((section.marginBottom ?? 0) > 0) {
        rows.push({
          kind: "bottom-margin",
          sectionKey: section.key,
          size: section.marginBottom!,
        });
      }
    });

    return { rows, headerIndexBySection: headerMap, headerIndices: headers };
  }, [sections, state, renderHeader]);

  // Currently sticky header index; written from rangeExtractor, read at row
  // render time. A ref (not state) so scrolling never re-renders the list.
  const activeStickyRef = useRef<number>(headerIndices[0] ?? 0);

  const rangeExtractor = useCallback(
    (range: Range) => {
      if (headerIndices.length === 0) return defaultRangeExtractor(range);
      let active = headerIndices[0];
      for (let i = headerIndices.length - 1; i >= 0; i--) {
        if (headerIndices[i] <= range.startIndex) {
          active = headerIndices[i];
          break;
        }
      }
      activeStickyRef.current = active;
      const merged = new Set([active, ...defaultRangeExtractor(range)]);
      return [...merged].sort((a, b) => a - b);
    },
    [headerIndices],
  );

  const perSectionItemEstimate = useMemo(() => {
    const map = new Map<string, number>();
    for (const section of sections) {
      map.set(section.key, section.estimateItemSize ?? estimateItemSize);
    }
    return map;
  }, [sections, estimateItemSize]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const row = rows[i];
      switch (row.kind) {
        case "top-margin":
        case "bottom-margin":
          return row.size;
        case "header":
          return estimateHeaderSize;
        case "top-sentinel":
        case "bottom-sentinel":
          return 1;
        case "loading-init":
        case "empty":
          return estimateItemSize;
        case "item":
          return perSectionItemEstimate.get(row.sectionKey) ?? estimateItemSize;
      }
    },
    overscan,
    getItemKey: (i) => {
      const row = rows[i];
      switch (row.kind) {
        case "top-margin":
          return `mt:${row.sectionKey}`;
        case "header":
          return `h:${row.sectionKey}`;
        case "top-sentinel":
          return `st:${row.sectionKey}`;
        case "item":
          return `i:${row.sectionKey}:${row.itemKey}`;
        case "bottom-sentinel":
          return `sb:${row.sectionKey}`;
        case "loading-init":
          return `li:${row.sectionKey}`;
        case "empty":
          return `e:${row.sectionKey}`;
        case "bottom-margin":
          return `mb:${row.sectionKey}`;
      }
    },
    rangeExtractor,
  });

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToSection: (key) => {
        const idx = headerIndexBySection.get(key);
        if (idx != null) {
          virtualizer.scrollToIndex(idx, { align: "start" });
        }
      },
      scrollToTop: () => virtualizer.scrollToIndex(0, { align: "start" }),
      scrollToBottom: () => {
        if (rows.length === 0) return;
        virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
      },
      refresh,
    }),
    [virtualizer, headerIndexBySection, refresh, rows.length],
  );

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={setScrollRef} className={clsx("relative overflow-y-auto", className)}>
      <div
        style={{
          height: `${totalSize}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((vi) => {
          const row = rows[vi.index];
          const isActiveHeader = row.kind === "header" && vi.index === activeStickyRef.current;

          const baseStyle: React.CSSProperties = isActiveHeader
            ? {
                position: "sticky",
                top: 0,
                left: 0,
                width: "100%",
                zIndex: 1,
              }
            : {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              };

          return (
            <div
              key={vi.key}
              data-index={vi.index}
              data-kind={row.kind}
              data-section={row.sectionKey}
              ref={virtualizer.measureElement}
              style={baseStyle}
            >
              <RowView
                row={row}
                state={state[row.sectionKey]}
                renderItem={renderItem}
                renderHeader={renderHeader}
                scrollRef={scrollRef}
                collapsible={!!sections.find((s) => s.key === row.sectionKey)?.collapsible}
                emptyState={sections.find((s) => s.key === row.sectionKey)?.emptyState}
                loadingIndicator={loadingIndicator}
                onToggleCollapsed={toggleCollapsed}
                onLoadTop={loadTop}
                onLoadBottom={loadBottom}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowView<T>({
  row,
  state,
  renderItem,
  renderHeader,
  scrollRef,
  collapsible,
  emptyState,
  loadingIndicator,
  onToggleCollapsed,
  onLoadTop,
  onLoadBottom,
}: {
  row: Row<T>;
  state: SectionState<T> | undefined;
  renderItem: InfiniteScrollViewProps<T>["renderItem"];
  renderHeader: InfiniteScrollViewProps<T>["renderHeader"];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  collapsible: boolean;
  emptyState: ReactNode;
  loadingIndicator: ReactNode;
  onToggleCollapsed: (key: string) => void;
  onLoadTop: (key: string) => void;
  onLoadBottom: (key: string) => void;
}) {
  switch (row.kind) {
    case "top-margin":
    case "bottom-margin":
      return <div style={{ height: row.size }} />;
    case "header": {
      if (!renderHeader) return null;
      return (
        <>
          {renderHeader(row.sectionKey, {
            collapsed: !!state?.collapsed,
            collapsible,
            toggle: () => {
              if (collapsible) onToggleCollapsed(row.sectionKey);
            },
          })}
        </>
      );
    }
    case "top-sentinel":
      return (
        <Sentinel
          scrollRef={scrollRef}
          sectionKey={row.sectionKey}
          onLoadMore={onLoadTop}
          isLoading={!!state?.loadingTop}
          loadingIndicator={loadingIndicator}
        />
      );
    case "bottom-sentinel":
      return (
        <Sentinel
          scrollRef={scrollRef}
          sectionKey={row.sectionKey}
          onLoadMore={onLoadBottom}
          isLoading={!!state?.loadingBottom}
          loadingIndicator={loadingIndicator}
        />
      );
    case "item":
      return (
        <>
          {renderItem(row.item, {
            sectionKey: row.sectionKey,
            index: row.itemIndex,
          })}
        </>
      );
    case "loading-init":
      return <div className="flex items-center justify-center">{loadingIndicator}</div>;
    case "empty":
      return <>{emptyState}</>;
  }
}

function Sentinel({
  scrollRef,
  sectionKey,
  onLoadMore,
  isLoading,
  loadingIndicator,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sectionKey: string;
  onLoadMore: (key: string) => void;
  isLoading: boolean;
  loadingIndicator: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore(sectionKey);
          }
        }
      },
      { root, rootMargin: `${SENTINEL_ROOT_MARGIN_PX}px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRef, onLoadMore, sectionKey]);

  return (
    <div ref={sentinelRef} className="flex min-h-1 items-center justify-center">
      {isLoading && loadingIndicator}
    </div>
  );
}
