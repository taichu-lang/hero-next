"use client";

import { Button, cn } from "@heroui/react";
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type CarouselSlide =
  | {
      id: string | number;
      type: "image";
      src: string;
      alt?: string;
      priority?: boolean;
    }
  | {
      id: string | number;
      type: "video";
      src: string;
      poster?: string;
      controls?: boolean;
      loop?: boolean;
    };

export interface CarouselProps {
  slides: CarouselSlide[];
  /** Autoplay interval in ms; pass 0 to disable autoplay. Defaults to 5000 */
  autoPlayInterval?: number;
  /** Whether to pause autoplay on hover. Defaults to true */
  pauseOnHover?: boolean;
  /** Whether to show the bottom indicators. Defaults to true */
  showIndicators?: boolean;
  /** Whether to show the prev/next buttons (visible on hover only). Defaults to true */
  showArrows?: boolean;
  /** Whether to show the play/pause and mute buttons (only relevant for video). Defaults to true */
  showControls?: boolean;
  /** Border radius class. Defaults to rounded-2xl */
  radius?: string;
  /** Aspect ratio class. Defaults to aspect-[16/9] */
  aspectRatio?: string;
  className?: string;
  onChange?: (index: number) => void;
  /** Custom aria-label for the indicators */
  indicatorLabel?: (index: number, total: number) => string;
}

export function Carousel({
  slides,
  autoPlayInterval = 5000,
  pauseOnHover = true,
  showIndicators = true,
  showArrows = true,
  showControls = true,
  radius = "rounded-2xl",
  aspectRatio = "aspect-[16/9]",
  className,
  onChange,
  indicatorLabel,
}: CarouselProps) {
  const t = useTranslations("Carousel");
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const touchStartX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const go = useCallback(
    (next: number) => {
      if (total === 0) return;
      const n = ((next % total) + total) % total;
      setIndex(n);
      onChange?.(n);
    },
    [total, onChange],
  );

  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  useEffect(() => {
    if (!autoPlayInterval || total < 2) return;
    if (paused) return;
    if (pauseOnHover && hovered) return;
    const t = setInterval(() => {
      setIndex((i) => {
        const n = (i + 1) % total;
        onChange?.(n);
        return n;
      });
    }, autoPlayInterval);
    return () => clearInterval(t);
  }, [autoPlayInterval, total, paused, pauseOnHover, hovered, onChange]);

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === index) {
        v.muted = muted;
        const p = v.play();
        if (p && typeof p.catch === "function")
          p.catch(() => {
            /* autoplay may be blocked by the browser */
          });
      } else {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {}
      }
    });
  }, [index, muted, total]);

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

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  const currentSlide = slides[index];
  const hasVideo = useMemo(() => slides.some((s) => s.type === "video"), [slides]);
  const isCurrentVideo = currentSlide?.type === "video";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={t("label")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={cn(
        "group bg-default-100 relative w-full overflow-hidden outline-none",
        "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2",
        radius,
        aspectRatio,
        className,
      )}
    >
      <div
        className="flex h-full w-full transition-transform duration-500 ease-out"
        style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className="relative h-full w-full shrink-0"
            aria-hidden={i !== index}
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${total}`}
          >
            {slide.type === "image" ? (
              <Image
                src={slide.src}
                alt={slide.alt ?? ""}
                draggable={false}
                fill
                sizes="100vw"
                className="h-full w-full object-cover select-none"
              />
            ) : (
              <video
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={slide.src}
                poster={slide.poster}
                loop={slide.loop ?? true}
                muted={muted}
                playsInline
                preload="metadata"
                controls={false}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          "bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0)_25%,rgba(0,0,0,0)_60%,rgba(0,0,0,0.55)_100%)]",
          hovered ? "opacity-100" : "opacity-0",
        )}
      />

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

      <div
        className={cn(
          "pointer-events-none absolute top-4 right-4 z-10 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md",
          "transition-opacity duration-300",
          hovered ? "opacity-100" : "opacity-0",
        )}
      >
        {index + 1} / {total}
      </div>

      {showControls && hasVideo && (
        <div
          className={cn(
            "absolute top-4 left-4 z-10 flex gap-2 transition-opacity duration-300",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <Button
            isIconOnly
            size="sm"
            aria-label={paused ? t("resume") : t("pause")}
            onPress={() => setPaused((p) => !p)}
            className="bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
          >
            {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
          </Button>
          {isCurrentVideo && (
            <Button
              isIconOnly
              size="sm"
              aria-label={muted ? t("unmute") : t("mute")}
              onPress={() => setMuted((m) => !m)}
              className="bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
            >
              {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
            </Button>
          )}
        </div>
      )}

      {showIndicators && total > 1 && (
        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2 px-4">
          {slides.map((s, i) => {
            const active = i === index;
            const label = indicatorLabel ? indicatorLabel(i, total) : t("goToSlide", { index: i + 1, total });
            return (
              <button
                key={s.id}
                type="button"
                aria-label={label}
                aria-current={active}
                onClick={() => go(i)}
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

      {currentSlide && "alt" in currentSlide && currentSlide.alt && (
        <Caption text={currentSlide.alt} visible={hovered} />
      )}
    </div>
  );
}

function Caption({ text, visible }: { text: string; visible: boolean }): ReactNode {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-10 left-1/2 z-10 max-w-[80%] -translate-x-1/2",
        "truncate rounded-full bg-black/40 px-3 py-1 text-sm text-white backdrop-blur-md",
        "transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {text}
    </div>
  );
}

export default Carousel;
