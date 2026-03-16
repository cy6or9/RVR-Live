// src/components/RiverBottomBar.tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WindCompass } from "@/components/WindCompass";
import { DeviceCompass } from "@/components/DeviceCompass";

interface RiverBottomBarProps {
  // station or location name (optional)
  locationName?: string | null;

  // Weather basics
  tempF?: number | null;
  windSpeedMph?: number | null;
  windGustMph?: number | null;
  windDirDeg?: number | null;
  conditionLabel?: string | null; // e.g. "Light Rain"

  // Precipitation (last 24h or next 24h summary)
  precipIn?: number | null; // inches, can be null

  // AQI info
  aqi?: number | null;
  aqiCategory?: string | null;

  // Find Me action
  onFindMe?: () => void;
  
  // Compass mode
  useDeviceCompass?: boolean;
}

/**
 * Bottom bar under the map:
 * [ Temp & weather ]  [ Wind compass + precip ]  [ Find Me button ]
 * AQI gradient ruler is attached underneath, no spacing.
 */
export function RiverBottomBar({
  locationName,
  tempF,
  windSpeedMph,
  windGustMph,
  windDirDeg,
  conditionLabel,
  precipIn,
  aqi,
  aqiCategory,
  onFindMe,
  useDeviceCompass = false,
}: RiverBottomBarProps) {
  const [showDeviceCompass, setShowDeviceCompass] = React.useState(useDeviceCompass);
  
  const displayTemp =
    tempF != null && !Number.isNaN(tempF) ? `${tempF.toFixed(1)}°F` : "--°F";
  const displayWind =
    windSpeedMph != null && !Number.isNaN(windSpeedMph)
      ? `${windSpeedMph.toFixed(1)} mph`
      : "— mph";
  const displayGust =
    windGustMph != null && !Number.isNaN(windGustMph)
      ? `${windGustMph.toFixed(1)} mph`
      : "— mph";
  const displayCond = conditionLabel || "—";

  const displayPrecip =
    precipIn != null && !Number.isNaN(precipIn)
      ? `${precipIn.toFixed(2)}" last 24h`
      : "Precip data —";

  const displayAqi =
    aqi != null && !Number.isNaN(aqi) ? Math.round(aqi).toString() : "—";

  const category = aqiCategory || "Unknown";

  return (
    <section className="w-full">
      {/* Main info bar that should sit directly under the map */}
      <div className="w-full border-t border-border bg-card px-3 py-2 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-stretch">
          {/* Left: Temp + weather summary */}
          <div className="flex flex-col justify-center gap-1 text-xs md:text-sm">
            {locationName && (
              <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                {locationName}
              </div>
            )}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-semibold">{displayTemp}</span>
              <div className="text-muted-foreground flex flex-col gap-0.5">
                <span className="flex items-center gap-1">
                  <span>💨</span>
                  <span>{displayWind}</span>
                </span>
                <span className="text-[0.65rem] text-muted-foreground/80 ml-6">
                  Gust: {displayGust}
                </span>
              </div>
            </div>
            <div className="text-muted-foreground text-[0.75rem]">
              {displayCond}
            </div>
          </div>

          {/* Center: Wind compass + precip box underneath + toggle button */}
          <div className="flex flex-col items-center justify-center gap-1">
            {showDeviceCompass ? (
              <DeviceCompass 
                windDirectionDeg={windDirDeg}
                windSpeedMph={windSpeedMph}
                size={140}
              />
            ) : (
              <WindCompass directionDeg={windDirDeg} speedMph={windSpeedMph} />
            )}
            
            <button
              onClick={() => setShowDeviceCompass(!showDeviceCompass)}
              className="text-[0.65rem] text-cyan-400 hover:text-cyan-300 underline transition-colors"
            >
              {showDeviceCompass ? '← Static Compass' : 'Device Compass →'}
            </button>
            
            <div className="mt-1 rounded-md border border-border bg-background/70 px-2 py-1 text-[0.7rem] text-muted-foreground">
              🌧 {displayPrecip}
            </div>
          </div>

          {/* Right: Find Me button, in the bar */}
          <div className="flex items-center justify-end">
            <Button
              size="locate"
              className="min-w-[7rem]"
              onClick={onFindMe}
              type="button"
            >
              Find Me
            </Button>
          </div>
        </div>
      </div>

      {/* AQI gradient ruler attached directly to bottom of the bar */}
      <div className="w-full border-t border-border bg-background px-3 pb-2 pt-1">
        <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground mb-1">
          <span>
            AQI:{" "}
            <span className="font-semibold text-foreground">{displayAqi}</span>{" "}
            {category !== "Unknown" && `(${category})`}
          </span>
          <span>Air Quality</span>
        </div>

        {/* Gradient ruler with ticks, kept thin */}
        <div className="relative h-4 w-full rounded-full bg-gradient-to-r from-[#00e400] via-[#ffff00] via-[#ff7e00] via-[#ff0000] via-[#8f3f97] to-[#7e0023]">
          {/* Tick marks */}
          {[
            { value: 0, label: "0" },
            { value: 50, label: "50" },
            { value: 100, label: "100" },
            { value: 150, label: "150" },
            { value: 200, label: "200" },
            { value: 300, label: "300" },
            { value: 500, label: "500" },
          ].map((tick) => (
            <div
              key={tick.value}
              className="absolute top-0 h-full"
              style={{ left: `${(tick.value / 500) * 100}%` }}
            >
              <div className="mx-auto h-full w-[1px] bg-black/40" />
              <div className="mt-0.5 translate-x-[-50%] text-[0.6rem] text-black drop-shadow-sm">
                {tick.label}
              </div>
            </div>
          ))}

          {/* Numerical overlay marker for current AQI */}
          {aqi != null && !Number.isNaN(aqi) && (
            <div
              className="absolute top-[-4px]"
              style={{
                left: `${Math.max(0, Math.min(100, (aqi / 500) * 100))}%`,
              }}
            >
              <div className="h-5 w-[2px] bg-black" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
