// src/components/WindCompass.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface WindCompassProps {
  /** Wind direction in meteorological degrees (0 = from North, 90 = from East) */
  directionDeg: number | null | undefined;
  /** Optional wind speed to show in center, in mph */
  speedMph?: number | null;
}

const DIRECTIONS = [
  { label: "N", angle: 0 },
  { label: "NE", angle: 45 },
  { label: "E", angle: 90 },
  { label: "SE", angle: 135 },
  { label: "S", angle: 180 },
  { label: "SW", angle: 225 },
  { label: "W", angle: 270 },
  { label: "NW", angle: 315 },
];

function degToCardinal(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return "--";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

/**
 * A compact wind compass with a centered arrow and heading pointer.
 * Arrow points to where wind is BLOWING TOWARD (heading), while degrees are FROM.
 */
export function WindCompass({ directionDeg, speedMph }: WindCompassProps) {
  const hasDir = directionDeg != null && !Number.isNaN(directionDeg);

  // Meteorological degrees are "from" direction; for display we often want
  // an arrow pointing where it's blowing TO, which is +180°.
  const headingDeg = hasDir ? (directionDeg! + 180) % 360 : 0;

  const cardinal = degToCardinal(directionDeg ?? null);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "relative h-20 w-20 rounded-full border border-border bg-gradient-to-b from-background/80 to-background shadow-inner"
        )}
      >
        {/* Direction labels around edge */}
        {DIRECTIONS.map((d) => {
          const rad = (d.angle - 90) * (Math.PI / 180); // rotate so 0° = top
          const r = 38; // label radius (px)
          const x = 40 + r * Math.cos(rad);
          const y = 40 + r * Math.sin(rad);

          return (
            <span
              key={d.label}
              className="pointer-events-none absolute text-[0.6rem] text-muted-foreground"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {d.label}
            </span>
          );
        })}

        {/* Center dot */}
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />

        {/* Arrow from center, properly centered + rotated */}
        {hasDir && (
          <div
            className="absolute left-1/2 top-1/2 origin-[50%_100%]"
            style={{ transform: `translate(-50%, -100%) rotate(${headingDeg}deg)` }}
          >
            {/* Arrow shaft + head */}
            <div className="h-8 w-[2px] bg-primary" />
            <div className="mx-auto h-0 w-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-primary" />
          </div>
        )}
      </div>

      {/* Text readout */}
      <div className="flex flex-col items-center text-[0.7rem] text-muted-foreground">
        <span>
          {hasDir ? `${Math.round(directionDeg!)}° ${cardinal}` : "Wind dir —"}
        </span>
        {speedMph != null && !Number.isNaN(speedMph) && (
          <span className="text-foreground">{speedMph.toFixed(1)} mph</span>
        )}
      </div>
    </div>
  );
}
