"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaOptionsType } from "embla-carousel"; // ✅ REAL TYPE SOURCE
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CarouselApi = ReturnType<typeof useEmblaCarousel>[1];

type CarouselContextType = {
  api: CarouselApi | null;
  scrollPrev: () => void;
  scrollNext: () => void;
};

const CarouselContext = React.createContext<CarouselContextType | null>(null);

export const useCarousel = () => {
  const ctx = React.useContext(CarouselContext);
  if (!ctx) throw new Error("useCarousel must be used within <Carousel />");
  return ctx;
};

export interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  opts?: EmblaOptionsType; // ✅ valid now
}

export const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  ({ className, children, opts, ...props }, ref) => {
    const [viewportRef, api] = useEmblaCarousel(opts);

    const scrollPrev = React.useCallback(() => {
      api?.scrollPrev();
    }, [api]);

    const scrollNext = React.useCallback(() => {
      api?.scrollNext();
    }, [api]);

    const value = React.useMemo(
      () => ({ api, scrollPrev, scrollNext }),
      [api, scrollPrev, scrollNext]
    );

    return (
      <CarouselContext.Provider value={value}>
        <div ref={ref} className={cn("relative", className)} {...props}>
          <div ref={viewportRef} className="overflow-hidden">
            {/* Slides wrapper */}
            <div className="flex -ml-4">{children}</div>
          </div>
        </div>
      </CarouselContext.Provider>
    );
  }
);
Carousel.displayName = "Carousel";

export const CarouselItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("min-w-0 shrink-0 grow-0 basis-full pl-4", className)}
    {...props}
  />
));
CarouselItem.displayName = "CarouselItem";

export const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { scrollPrev } = useCarousel();
  return (
    <button
      ref={ref}
      type="button"
      onClick={scrollPrev}
      className={cn(
        "absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 border border-border shadow hover:bg-background",
        className
      )}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="sr-only">Previous slide</span>
    </button>
  );
});
CarouselPrevious.displayName = "CarouselPrevious";

export const CarouselNext = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { scrollNext } = useCarousel();
  return (
    <button
      ref={ref}
      type="button"
      onClick={scrollNext}
      className={cn(
        "absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 border border-border shadow hover:bg-background",
        className
      )}
      {...props}
    >
      <ChevronRight className="h-4 w-4" />
      <span className="sr-only">Next slide</span>
    </button>
  );
});
CarouselNext.displayName = "CarouselNext";
