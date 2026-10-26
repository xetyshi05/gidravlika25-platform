"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Photo } from "@/components/ui/photo";
import { fallbackGallerySlides, type SiteMediaSlide } from "@/lib/site-media";

export type GallerySlide = SiteMediaSlide;

type ProductionGalleryProps = {
  slides?: readonly GallerySlide[];
  className?: string;
  ariaLabel?: string;
};

export function ProductionGallery({
  slides = fallbackGallerySlides,
  className,
  ariaLabel = "Фотографии производства",
}: ProductionGalleryProps) {
  const slideCount = slides.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const changeSlide = useCallback(
    (nextIndex: number) => {
      if (isAnimating || nextIndex === activeIndex) {
        return;
      }

      setPreviousIndex(activeIndex);
      setActiveIndex(nextIndex);
      setIsAnimating(true);
    },
    [activeIndex, isAnimating],
  );

  const showNext = useCallback(() => {
    changeSlide((activeIndex + 1) % slideCount);
  }, [activeIndex, changeSlide, slideCount]);

  const showPrevious = useCallback(() => {
    changeSlide((activeIndex - 1 + slideCount) % slideCount);
  }, [activeIndex, changeSlide, slideCount]);

  useEffect(() => {
    if (isPaused || isAnimating) {
      return;
    }

    const intervalId = window.setInterval(showNext, 3000);
    return () => window.clearInterval(intervalId);
  }, [isAnimating, isPaused, showNext]);

  useEffect(() => {
    if (!isAnimating) {
      return;
    }

    const animationId = window.setTimeout(() => {
      setPreviousIndex(null);
      setIsAnimating(false);
    }, 360);

    return () => window.clearTimeout(animationId);
  }, [isAnimating]);

  const activeSlide = slides[activeIndex];
  const previousSlide = previousIndex === null ? null : slides[previousIndex];
  // WEB-07: only the next slide is fetched ahead (lazily, once the gallery is
  // near the viewport), not every slide at full size when the page opens.
  const nextSlide = slideCount > 1 ? slides[(activeIndex + 1) % slideCount] : null;
  return (
    <section
      className={`relative aspect-[3/2] overflow-hidden border border-slate-200 bg-white ${className ?? ""}`}
      aria-roledescription="карусель"
      aria-label={ariaLabel}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      {previousSlide ? (
        <div className="absolute inset-0 production-slide-exit" aria-hidden="true">
          <Photo
            src={previousSlide.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : null}
      {nextSlide && nextSlide !== previousSlide ? (
        <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden="true">
          <Photo
            key={nextSlide.src}
            src={nextSlide.src}
            alt=""
            fill
            loading="lazy"
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : null}
      <div className={`absolute inset-0 ${isAnimating ? "production-slide-enter" : ""}`}>
        <Photo
          src={activeSlide.src}
          alt={activeSlide.alt}
          fill
          priority={activeIndex === 0}
          sizes="(min-width: 1024px) 42vw, 100vw"
          className="object-cover"
        />
      </div>

      <button
        type="button"
        onClick={showPrevious}
        className="absolute left-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center bg-white/35 text-slate-700/70 transition-colors duration-200 ease-out hover:bg-white/85 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand sm:left-4"
        aria-label="Предыдущая фотография"
      >
        <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={showNext}
        className="absolute right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center bg-white/35 text-slate-700/70 transition-colors duration-200 ease-out hover:bg-white/85 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand sm:right-4"
        aria-label="Следующая фотография"
      >
        <IconChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>

      <div
        className="absolute bottom-5 left-5 right-5 z-10 flex gap-2 sm:bottom-8 sm:left-8 sm:right-8"
        aria-label="Выбор фотографии"
      >
        {slides.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => changeSlide(index)}
            className={`h-1.5 flex-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand ${index === activeIndex ? "bg-brand" : "bg-white/75 hover:bg-white"}`}
            aria-label={`Показать: ${slide.title}`}
            aria-current={index === activeIndex ? "true" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
