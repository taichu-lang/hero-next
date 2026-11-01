"use client";

import { Button, cn } from "@heroui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  type TouchEvent,
} from "react";

/** Live carousel state passed to the `overlay` render prop. */
export interface CarouselState {
  index: number;
  total: number;
  /** 0..1 autoplay progress of the current slide (drives the "progress" indicator) */
  progress: number;
  hovered: boolean;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
  goTo: (index: number) => void;
  prev: () => void;
  next: () => void;
}

export interface CarouselProps {
  /** Slide content. Each node is rendered as one full-size slide. */
  slides: ReactNode[];
  /** Autoplay interval in ms; pass 0 to disable autoplay. Defaults to 5000 */
  autoPlayInterval?: number;
  /** Whether to pause autoplay on hover. Defaults to true */
  pauseOnHover?: boolean;
  /** Transition between slides. Defaults to "slide" */
  animation?: "slide" | "fade";
  /** Whether to show the bottom indicators. Defaults to true */
  showIndicators?: boolean;
  /** Indicator style: "dots" (centered pills) or "progress" (full-width bars). Defaults to "dots" */
  indicatorVariant?: "dots" | "progress";
  /** Custom aria-label for the indicators */
  indicatorLabel?: (index: number, total: number) => string;
  /** Whether to show the prev/next buttons (visible on hover only). Defaults to true */
  showArrows?: boolean;
  /** Border radius class. Defaults to rounded-2xl */
  radius?: string;
  /** Aspect ratio class. Defaults to aspect-[16/9]; pass "" for content-sized height */
  aspectRatio?: string;
  /** Accessible name for the carousel region. Defaults to the "Carousel.label" translation */
  ariaLabel?: string;
  className?: string;
  onChange?: (index: number) => void;
  /** Extra content rendered above the slides (media controls, captions...). Receives live carousel state. */
  overlay?: ReactNode | ((state: CarouselState) => ReactNode);
}

/**
 * Generic carousel over arbitrary ReactNode slides.
 *
 * Owns index/autoplay state, keyboard + touch navigation, arrows and
 * indicators. Media handling (images, videos, playback controls) lives in
 * `CarouselMedia`, which composes this component.
 */
export function Carousel({
  slides,
  autoPlayInterval = 5000,
  pauseOnHover = true,
  animation = "slide",
  showIndicators = true,
  indicatorVariant = "dots",
  indicatorLabel,
  showArrows = true,
  radius = "rounded-2xl",
  aspectRatio = "aspect-[16/9]",
  ariaLabel,
  className,
  onChange,
  overlay,
}: CarouselProps) {
  const t = useTranslations("Carousel");
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const indexRef = useRef(index);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(0);

  // Keep the latest callbacks/state in refs so the rAF loop and goTo stay
  // stable and don't restart on every consumer render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const goTo = useCallback(
    (i: number) => {
      if (total === 0) return;
      const n = ((i % total) + total) % total;
      elapsedRef.current = 0;
      setProgress(0);
      setIndex(n);
      onChangeRef.current?.(n);
    },
    [total],
  );

  const prev = useCallback(() => goTo(indexRef.current - 1), [goTo]);
  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);

  // rAF-driven autoplay: accumulating elapsed time in a ref makes hover/pause
  // a simple "stop accumulating", and yields the 0..1 progress consumed by
  // the "progress" indicator variant.
  const running = autoPlayInterval > 0 && total > 1 && !paused && !(pauseOnHover && hovered);
  useEffect(() => {
    if (!running) return;
    lastTickRef.current = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      elapsedRef.current += delta;
      if (elapsedRef.current >= autoPlayInterval) {
        goTo(indexRef.current + 1);
      } else {
        setProgress(elapsedRef.current / autoPlayInterval);
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [running, autoPlayInterval, goTo]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      setPaused((p) => !p);
    }
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  const slideAria = (i: number) => ({
    "aria-hidden": i !== index,
    "aria-roledescription": "slide",
    "aria-label": `${i + 1} / ${total}`,
  });

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel ?? t("label")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={cn(
        "group relative w-full overflow-hidden outline-none",
        "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2",
        radius,
        aspectRatio,
        className,
      )}
    >
      {animation === "slide" ? (
        <div
          className="flex h-full w-full transition-transform duration-500 ease-out"
          style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              data-active={i === index || undefined}
              className="group/slide relative h-full w-full shrink-0"
              {...slideAria(i)}
            >
              {slide}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative h-full w-full">
          {slides.map((slide, i) => (
            <div
              key={i}
              data-active={i === index || undefined}
              className={cn(
                "group/slide absolute inset-0 transition-opacity duration-700 ease-out",
                i === index ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              {...slideAria(i)}
            >
              {slide}
            </div>
          ))}
        </div>
      )}

      {showArrows && total > 1 && (
        <>
          <Button
            isIconOnly
            aria-label={t("previous")}
            onPress={prev}
            className={cn(
              "absolute top-1/2 left-3 z-10 -translate-y-1/2 backdrop-blur-md",
              "bg-white/20 text-white hover:bg-white/30",
              "transition-all duration-300",
              hovered ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
            )}
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
          <Button
            isIconOnly
            aria-label={t("next")}
            onPress={next}
            className={cn(
              "absolute top-1/2 right-3 z-10 -translate-y-1/2 backdrop-blur-md",
              "bg-white/20 text-white hover:bg-white/30",
              "transition-all duration-300",
              hovered ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0",
            )}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        </>
      )}

      {showIndicators && total > 1 && (
        <div
          className={cn(
            "absolute inset-x-0 z-10",
            indicatorVariant === "progress"
              ? "bottom-0 flex gap-2 p-5"
              : "bottom-4 flex justify-center gap-2 px-4",
          )}
        >
          {slides.map((_, i) => {
            const active = i === index;
            const label = indicatorLabel ? indicatorLabel(i, total) : t("goToSlide", { index: i + 1, total });
            if (indicatorVariant === "progress") {
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={label}
                  aria-current={active}
                  onClick={() => goTo(i)}
                  className="flex h-5 flex-1 cursor-pointer items-center"
                >
                  <span className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                    <span
                      className="block h-full rounded-full bg-white"
                      style={{ width: i < index ? "100%" : active ? `${progress * 100}%` : "0%" }}
                    />
                  </span>
                </button>
              );
            }
            return (
              <button
                key={i}
                type="button"
                aria-label={label}
                aria-current={active}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 ease-out",
                  "focus-visible:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
                  active
                    ? "w-8 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                    : "w-1.5 bg-white/50 hover:bg-white/80",
                )}
              />
            );
          })}
        </div>
      )}

      {typeof overlay === "function"
        ? overlay({ index, total, progress, hovered, paused, setPaused, goTo, prev, next })
        : overlay}
    </div>
  );
}
