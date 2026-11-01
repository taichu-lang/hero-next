"use client";

import { Button, cn } from "@heroui/react";
import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Carousel, type CarouselState } from "./Carousel";

export type CarouselMediaSlide =
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

export interface CarouselMediaProps {
  slides: CarouselMediaSlide[];
  /** Autoplay interval in ms; pass 0 to disable autoplay. Defaults to 5000 */
  autoPlayInterval?: number;
  /** Whether to pause autoplay on hover. Defaults to true */
  pauseOnHover?: boolean;
  /** Whether to show the bottom indicators. Defaults to true */
  showIndicators?: boolean;
  /** Indicator style: "dots" (centered pills) or "progress" (full-width bars). Defaults to "dots" */
  indicatorVariant?: "dots" | "progress";
  /** Whether to show the prev/next buttons (visible on hover only). Defaults to true */
  showArrows?: boolean;
  /** Whether to show the play/pause and mute buttons (only relevant for video). Defaults to true */
  showControls?: boolean;
  /** Border radius class. Defaults to rounded-2xl */
  radius?: string;
  /** Aspect ratio class. Defaults to aspect-[16/9] */
  aspectRatio?: string;
  /** Accessible name for the carousel region. Defaults to the "Carousel.label" translation */
  ariaLabel?: string;
  className?: string;
  onChange?: (index: number) => void;
  /** Custom aria-label for the indicators */
  indicatorLabel?: (index: number, total: number) => string;
}

/**
 * Image/video carousel. Composes the generic `Carousel` and adds media
 * concerns: next/image rendering, video playback synced to the active slide,
 * mute/play-pause controls, hover scrim, counter badge and alt-text caption.
 */
export function CarouselMedia({
  slides,
  autoPlayInterval,
  pauseOnHover,
  showIndicators,
  indicatorVariant,
  showArrows,
  showControls = true,
  radius,
  aspectRatio,
  ariaLabel,
  className,
  onChange,
  indicatorLabel,
}: CarouselMediaProps) {
  const t = useTranslations("Carousel");
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const hasVideo = useMemo(() => slides.some((s) => s.type === "video"), [slides]);

  const handleChange = (n: number) => {
    setIndex(n);
    onChange?.(n);
  };

  // Play the active video, reset the others.
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
  }, [index, muted]);

  const nodes = slides.map((slide, i) =>
    slide.type === "image" ? (
      <Image
        key={slide.id}
        src={slide.src}
        alt={slide.alt ?? ""}
        priority={slide.priority}
        draggable={false}
        fill
        sizes="100vw"
        className="h-full w-full object-cover select-none"
      />
    ) : (
      <video
        key={slide.id}
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
    ),
  );

  const overlay = ({ hovered, paused, setPaused }: CarouselState): ReactNode => {
    const currentSlide = slides[index];
    const isCurrentVideo = currentSlide?.type === "video";
    return (
      <>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-300",
            "bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0)_25%,rgba(0,0,0,0)_60%,rgba(0,0,0,0.55)_100%)]",
            hovered ? "opacity-100" : "opacity-0",
          )}
        />

        <div
          className={cn(
            "pointer-events-none absolute top-4 right-4 z-10 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md",
            "transition-opacity duration-300",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          {index + 1} / {slides.length}
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

        {currentSlide && "alt" in currentSlide && currentSlide.alt && (
          <Caption text={currentSlide.alt} visible={hovered} />
        )}
      </>
    );
  };

  return (
    <Carousel
      slides={nodes}
      autoPlayInterval={autoPlayInterval}
      pauseOnHover={pauseOnHover}
      showIndicators={showIndicators}
      indicatorVariant={indicatorVariant}
      showArrows={showArrows}
      radius={radius}
      aspectRatio={aspectRatio}
      ariaLabel={ariaLabel}
      className={cn("bg-default-100", className)}
      onChange={handleChange}
      indicatorLabel={indicatorLabel}
      overlay={overlay}
    />
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

export default CarouselMedia;
