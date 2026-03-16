import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LockDamMap from "@/components/LockDamMap";
import OhioRiverActivityMap from "@/components/OhioRiverActivityMap";
import { ohioRiverLocks } from "@/lib/locks";
import { normalizeLockActivity } from "@/lib/lockActivity";
import { useUserProfile } from "@/context/UserProfileContext";
import { useAuth } from "@/context/AuthContext";
import { updateUserLocation } from "@/lib/userProfile";

/* ---------------------------------------------------
   Station List (Ohio River full chain)
--------------------------------------------------- */
const stations = [
  { id: "03085152", name: "Pittsburgh, PA", lat: 40.44, lon: -79.99, riverMile: 0 },
  { id: "03086000", name: "Dashields L&D, PA", lat: 40.52, lon: -80.2, riverMile: 6 },
  { id: "03108500", name: "Montgomery L&D, PA", lat: 40.64, lon: -80.4, riverMile: 32 },
  { id: "03110690", name: "New Cumberland L&D, WV", lat: 40.51, lon: -80.65, riverMile: 54 },
  { id: "03111520", name: "Pike Island L&D, WV", lat: 40.09, lon: -80.69, riverMile: 84 },
  { id: "03112500", name: "Wheeling, WV", lat: 40.06, lon: -80.72, riverMile: 88 },
  { id: "03114280", name: "Hannibal L&D, OH", lat: 39.67, lon: -80.87, riverMile: 126 },
  { id: "03150700", name: "Marietta, OH", lat: 39.42, lon: -81.46, riverMile: 175 },
  { id: "03151000", name: "Parkersburg, WV", lat: 39.27, lon: -81.56, riverMile: 192 },
  { id: "390707081443202", name: "Belleville L&D, WV", lat: 39.07, lon: -81.44, riverMile: 204 },
  { id: "03159870", name: "Racine L&D, WV", lat: 38.93, lon: -82.12, riverMile: 237 },
  { id: "03201500", name: "Point Pleasant, WV", lat: 38.84, lon: -82.13, riverMile: 252 },
  { id: "03206000", name: "Near Huntington, WV", lat: 38.41, lon: -82.39, riverMile: 302 },
  { id: "03216000", name: "Ashland, KY", lat: 38.47, lon: -82.63, riverMile: 314 },
  { id: "03216600", name: "Greenup L&D, KY", lat: 38.57, lon: -82.84, riverMile: 341 },
  { id: "03217200", name: "Portsmouth, OH", lat: 38.73, lon: -83.01, riverMile: 358 },
  { id: "03238000", name: "Maysville, KY", lat: 38.64, lon: -83.77, riverMile: 404 },
  { id: "03238680", name: "Meldahl L&D, OH", lat: 38.78, lon: -84.1, riverMile: 436 },
  { id: "03255000", name: "Cincinnati, OH", lat: 39.1, lon: -84.51, riverMile: 471 },
  { id: "03277200", name: "Markland Lower, KY", lat: 38.78, lon: -84.94, riverMile: 531 },
  { id: "03303280", name: "Cannelton L&D, IN", lat: 37.91, lon: -86.75, riverMile: 720 },
  { id: "03304300", name: "Newburgh L&D, IN", lat: 37.93, lon: -87.38, riverMile: 776 },
  { id: "03322000", name: "Evansville, IN", lat: 37.97, lon: -87.57, riverMile: 792 },
  { id: "03322190", name: "Henderson, KY", lat: 37.84, lon: -87.58, riverMile: 813 },
  { id: "03380000", name: "Mt. Vernon, IN", lat: 37.932, lon: -87.895, riverMile: 823 },
  { id: "03322420", name: "J.T. Myers L&D, KY", lat: 37.78, lon: -87.98, riverMile: 846, ahps: "MTVI3" },
  { id: "03381700", name: "Shawneetown, IL", lat: 37.69, lon: -88.14, riverMile: 865 },
  { id: "03384500", name: "Golconda, IL", lat: 37.36, lon: -88.48, riverMile: 918 },
  { id: "03399800", name: "Smithland L&D, KY", lat: 37.15, lon: -88.44, riverMile: 919 },
  { id: "03612500", name: "Metropolis, IL", lat: 37.15, lon: -88.73, riverMile: 935 },
  { id: "07022000", name: "Cairo, IL (Mouth)", lat: 36.99, lon: -89.18, riverMile: 981 },
];

/* ---------------------------------------------------
   UTILITIES
--------------------------------------------------- */
const formatLocal = (ts) =>
  ts
    ? new Date(ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Chicago",
      })
    : "";

const formatDayShort = (ts) =>
  ts
    ? new Date(ts).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "America/Chicago",
      })
    : "";

/* ---------------------------------------------------
   DATE HELPERS (Chicago day bucketing)
--------------------------------------------------- */
function chicagoDayKey(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;

  // en-CA gives YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function toNoonChicagoISO(dayKey) {
  // 18:00Z ~ 12:00 CST / 13:00 CDT
  return `${dayKey}T18:00:00Z`;
}

/* ---------------------------------------------------
   DAILY HIGH HISTORY (PAST DATA) - always 7 days
--------------------------------------------------- */
function dailyHighHistory(history, days = 7) {
  if (!Array.isArray(history) || history.length === 0) return null;

  const byDay = new Map();

  history.forEach((p) => {
    const d = new Date(p.t);
    if (isNaN(d.getTime())) return;

    // Use local day boundary (Chicago time)
    const dayKey = new Date(
      d.toLocaleDateString("en-US", { timeZone: "America/Chicago" })
    )
      .toISOString()
      .slice(0, 10);

    const v = Number(p.v);
    if (!isFinite(v)) return;

    const prev = byDay.get(dayKey);
    if (prev == null || v > prev) byDay.set(dayKey, v);
  });

  return Array.from(byDay.entries())
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .slice(-days)
    .map(([day, v]) => ({
      // Noon local prevents date rollover issues
      t: `${day}T18:00:00Z`,
      v: +v.toFixed(2),
    }));
}

/* ---------------------------------------------------
   FORECAST NORMALIZER (NWPS-only, “bulletproof”)
   Accepts many shapes and returns 7 daily-high points.
--------------------------------------------------- */
function normalizeForecastSeries(payload, days = 7) {
  // Allow passing either the raw array or the full API payload
  const candidates = [];

  // If caller passed array directly
  if (Array.isArray(payload)) candidates.push(payload);

  // If caller passed the API JSON object
  if (payload && typeof payload === "object") {
    // Common field names you might return from /api/river-data
    candidates.push(payload.prediction);
    candidates.push(payload.forecast);
    candidates.push(payload.forecast7d);
    candidates.push(payload.forecastDaily);
    candidates.push(payload.nwpsForecast);
    candidates.push(payload.nwps);
    candidates.push(payload.series);
    candidates.push(payload.data?.forecast);
    candidates.push(payload.data?.prediction);

    // Some NOAA-ish nestings people use
    candidates.push(payload.nwps?.forecast);
    candidates.push(payload.nwps?.data);
    candidates.push(payload.nwps?.points);
    candidates.push(payload.nwps?.timeseries);
  }

  // Pick first usable array
  const raw =
    candidates.find((arr) => Array.isArray(arr) && arr.length > 0) || null;
  if (!raw) return null;

  // Normalize point formats into {t, v}
  const points = [];
  for (const p of raw) {
    if (!p) continue;

    // timestamps
    const t =
      p.t ??
      p.time ??
      p.dateTime ??
      p.datetime ??
      p.validTime ??
      p.validtime ??
      p.x ??
      null;

    // values
    const vRaw =
      p.v ??
      p.value ??
      p.stage ??
      p.y ??
      null;

    const v = Number(vRaw);
    if (!t || !Number.isFinite(v)) continue;

    const tt = new Date(t);
    if (isNaN(tt.getTime())) continue;

    points.push({ t: tt.toISOString(), v });
  }

  if (points.length === 0) return null;

  // Sort ascending
  points.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  // Keep from “now-ish” forward, but allow a little backfill
  const now = Date.now();
  const filtered = points.filter((p) => {
    const tt = new Date(p.t).getTime();
    return Number.isFinite(tt) && tt >= now - 12 * 60 * 60 * 1000; // last 12h and forward
  });

  const usable = filtered.length ? filtered : points;

  // Bucket by Chicago day, take max per day (daily high)
  const byDay = new Map();
  for (const p of usable) {
    const day = chicagoDayKey(p.t);
    if (!day) continue;
    const prev = byDay.get(day);
    if (prev == null || p.v > prev) byDay.set(day, p.v);
  }

  const daily = Array.from(byDay.entries())
    .map(([day, v]) => ({ day, v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Take the next N days (starting at today Chicago)
  const todayKey = chicagoDayKey(new Date().toISOString());
  const future = todayKey
    ? daily.filter((d) => d.day >= todayKey)
    : daily;

  const sliced = (future.length ? future : daily).slice(0, days);

  const out = sliced.map((d) => ({
    t: toNoonChicagoISO(d.day),
    v: +Number(d.v).toFixed(2),
  }));

  return out.length ? out : null;
}

const distKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const kmToMiles = (km) => km * 0.621371;

const windDirLabel = (deg) => {
  if (deg == null || isNaN(deg)) return "";
  const d = ((deg % 360) + 360) % 360;
  if (d >= 345 || d < 15) return "N";
  if (d < 45) return "NNE";
  if (d < 75) return "ENE";
  if (d < 105) return "E";
  if (d < 135) return "ESE";
  if (d < 165) return "SSE";
  if (d < 195) return "S";
  if (d < 225) return "SSW";
  if (d < 255) return "WSW";
  if (d < 285) return "W";
  if (d < 315) return "WNW";
  return "NNW";
};

// Map weather condition text to appropriate emoji icon
const getWeatherIcon = (shortForecast, precip = 0) => {
  if (!shortForecast) {
    // Fallback to precip-based if no forecast text
    return precip >= 80 ? "⚡️" : precip >= 50 ? "🌧" : precip >= 20 ? "☁️" : "🌤";
  }
  
  const forecast = shortForecast.toLowerCase();
  
  // Thunderstorms
  if (forecast.includes('thunder') || forecast.includes('tstorm')) return "⛈";
  
  // Rain/Precipitation
  if (forecast.includes('rain') || forecast.includes('shower')) {
    if (forecast.includes('heavy')) return "🌧";
    if (forecast.includes('light')) return "🌦";
    return "🌧";
  }
  
  // Snow
  if (forecast.includes('snow') || forecast.includes('flurr')) return "🌨";
  if (forecast.includes('sleet') || forecast.includes('freezing')) return "🌨";
  
  // Fog/Mist
  if (forecast.includes('fog') || forecast.includes('mist')) return "🌫";
  
  // Cloudy
  if (forecast.includes('overcast') || forecast.includes('cloudy')) return "☁️";
  if (forecast.includes('mostly cloudy')) return "☁️";
  if (forecast.includes('partly cloudy') || forecast.includes('partly sunny')) return "⛅";
  
  // Clear/Sunny
  if (forecast.includes('clear') || forecast.includes('sunny')) return "☀️";
  if (forecast.includes('mostly clear') || forecast.includes('mostly sunny')) return "🌤";
  
  // Default based on precipitation probability
  return precip >= 50 ? "🌧" : precip >= 20 ? "☁️" : "🌤";
};

// Mapping for numeric hazardCode (0–3) coming from API
const HAZARD_LEVELS = {
  0: { label: "Normal", color: "#00a86b" },
  1: { label: "Elevated", color: "#d5a000" },
  2: { label: "Near Flood", color: "#ff8c00" },
  3: { label: "Flooding", color: "#c63d0f" },
};

const AQI_GRADIENT =
  "linear-gradient(to right, #3A6F3A, #9A8B2E, #A66B2C, #8B3A46, #613A8B, #7A2A3A)";

/* ---------------------------------------------------
   CHART COMPONENT (kept intact + adds optional day marks/labels)
--------------------------------------------------- */
function Chart({
  data,
  floodStage,
  unit,
  width = 240,
  height = 110,
  color = "#ffffff",
  showDayMarks = false,
  showPointLabels = false,
  labelColor = "#00ffff",
}) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs italic opacity-80 bg-black/20 rounded border border-white/10"
        style={{ width, height, minWidth: width }}
      >
        No data
      </div>
    );
  }

  const pad = 24;
  const pts = data
    .map((d) => ({
      t: new Date(d.t).getTime(),
      v: typeof d.v === "number" ? d.v : Number(d.v),
      rawT: d.t,
    }))
    .filter((p) => isFinite(p.t) && isFinite(p.v));

  if (pts.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs italic opacity-80 bg-black/20 rounded border border-white/10"
        style={{ width, height, minWidth: width }}
      >
        No data
      </div>
    );
  }

  const minT = Math.min(...pts.map((p) => p.t));
  const maxT = Math.max(...pts.map((p) => p.t));
  const spanT = maxT - minT || 1;

  const minV = Math.min(...pts.map((p) => p.v));
  const maxV = Math.max(...pts.map((p) => p.v));
  const spanV = maxV - minV || 1;

  const scaleX = (t) => pad + ((t - minT) / spanT) * (width - pad * 2);
  const scaleY = (v) =>
    height - pad - ((v - minV) / spanV) * (height - pad * 2);

  const pathD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.t)} ${scaleY(p.v)}`)
    .join(" ");

  const floodY = floodStage != null ? scaleY(floodStage) : null;
  const midV = (minV + maxV) / 2;

  // Avoid clutter: only label when series is small (forecast usually is)
  const canLabel = pts.length <= 10;

  return (
    <svg
      width={width}
      height={height}
      className="bg-black/20 rounded border border-white/10"
      style={{ minWidth: width }}
    >
      {/* day marks (vertical ticks) */}
      {showDayMarks &&
        canLabel &&
        pts.map((p, idx) => {
          const x = scaleX(p.t);
          return (
            <line
              key={`tick-${idx}`}
              x1={x}
              y1={pad - 2}
              x2={x}
              y2={height - pad + 6}
              stroke={labelColor}
              strokeOpacity="0.35"
              strokeDasharray="2 4"
            />
          );
        })}

      {/* flood stage line */}
      {floodY != null && (
        <line
          x1={pad}
          y1={floodY}
          x2={width - pad}
          y2={floodY}
          stroke="#ff6666"
          strokeDasharray="4 4"
        />
      )}

      {/* main path */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" />

      {/* point dots + labels */}
      {showPointLabels &&
        canLabel &&
        pts.map((p, idx) => {
          const x = scaleX(p.t);
          const y = scaleY(p.v);
          const day = formatDayShort(p.rawT);
          const val = `${p.v.toFixed(2)}${unit ? ` ${unit}` : ""}`;
          
          // Skip day labels for every other point when crowded (>5 points)
          const showDayLabel = pts.length <= 5 || idx % 2 === 0;

          return (
            <g key={`pt-${idx}`}>
              <circle cx={x} cy={y} r="2.6" fill={labelColor} />
              {/* value label */}
              <text
                x={x}
                y={Math.max(10, y - 6)}
                fontSize="7"
                textAnchor="middle"
                fill={labelColor}
              >
                {val}
              </text>
              {/* day label (skip every other when crowded) */}
              {showDayLabel && (
                <text
                  x={x}
                  y={height - 6}
                  fontSize="7"
                  textAnchor="middle"
                  fill={labelColor}
                  opacity="0.9"
                >
                  {day}
                </text>
              )}
            </g>
          );
        })}

      {/* axis labels */}
      <text x={pad} y={pad + 6} fontSize="8" fill="#aaa">
        {maxV.toFixed(1)}
      </text>
      <text x={pad} y={(height + pad) / 2} fontSize="8" fill="#aaa">
        {midV.toFixed(1)}
      </text>
      <text x={pad} y={height - pad - 2} fontSize="8" fill="#aaa">
        {minV.toFixed(1)}
      </text>
    </svg>
  );
}

/* ---------------------------------------------------
   HAZARD BAR (0–3 like your AQI bar, with marker)
--------------------------------------------------- */
function RiverHazardBar({ hazardCode }) {
  const code =
    typeof hazardCode === "number" && hazardCode >= 0 && hazardCode <= 3
      ? hazardCode
      : 0;

  const stops = [
    { code: 0, label: "Normal", color: HAZARD_LEVELS[0].color },
    { code: 1, label: "Elevated", color: HAZARD_LEVELS[1].color },
    { code: 2, label: "Near Flood", color: HAZARD_LEVELS[2].color },
    { code: 3, label: "Flooding", color: HAZARD_LEVELS[3].color },
  ];

  const pct = (code / 3) * 100;

  return (
    <div className="w-full px-4 pt-3">
      <div className="flex items-center justify-between text-[10px] text-white/70 mb-1">
        <span className="font-semibold text-white/80">River Danger Level</span>
        <span>{HAZARD_LEVELS[code]?.label ?? "Normal"}</span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full border border-white/20">
        <div className="flex h-full w-full">
          {stops.map((s) => (
            <div
              key={s.code}
              className="h-full flex-1"
              style={{ background: s.color }}
            />
          ))}
        </div>

        <div
          className="absolute -top-1 flex flex-col items-center"
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        >
          <div className="w-[2px] h-4 bg-white" />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-white/60">
        {stops.map((s) => (
          <span key={s.code}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------
   RIVER DANGER + TREND INDICATOR
   - Fixes "↑ steady" by using a right-arrow base and rotating it.
   - Colors the "Code X" text to match hazard level color.
--------------------------------------------------- */
function RiverLevelIndicator({ history, hazardCode }) {
  let trend = "steady";
  let rotation = 0;

  if (Array.isArray(history) && history.length >= 6) {
    const clean = history
      .map((p) => ({ t: new Date(p.t).getTime(), v: Number(p.v) }))
      .filter((p) => isFinite(p.t) && isFinite(p.v))
      .sort((a, b) => a.t - b.t);

    if (clean.length >= 6) {
      const last = clean[clean.length - 1]?.v;
      const prev = clean[clean.length - 6]?.v;
      const diff = last - prev;

      if (diff > 0.25) {
        trend = "rising";
        rotation = -45; // up-right
      } else if (diff < -0.25) {
        trend = "falling";
        rotation = 45; // down-right
      } else {
        trend = "steady";
        rotation = 0; // right
      }
    }
  }

  const safeCode =
    typeof hazardCode === "number" && hazardCode >= 0 && hazardCode <= 3
      ? hazardCode
      : 0;

  const label = HAZARD_LEVELS[safeCode]?.label || "Normal";
  const codeColor = HAZARD_LEVELS[safeCode]?.color || "#ffffff";

  return (
    <div className="flex flex-col gap-1 text-xs mt-2">
      <span className="opacity-70">River Danger Level</span>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">
          <span style={{ color: codeColor }}>Code {safeCode}</span> — {label}
        </span>

        <span className="inline-flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-white/40 bg-black/40"
            style={{ transform: `rotate(${rotation}deg)` }}
            aria-label={`Trend: ${trend}`}
            title={`Trend: ${trend}`}
          >
            →
          </span>
          <span className="capitalize">{trend}</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------
   WIND COMPASS
   - Shows the direction the wind is blowing
--------------------------------------------------- */
function WindCompass({ direction, degrees }) {
  if (degrees == null || isNaN(degrees)) return null;

  const normalizedDeg = ((Number(degrees) % 360) + 360) % 360;
  // Wind direction is reported as "from", but display arrow pointing "to" (+180°)
  const arrowDeg = (normalizedDeg + 180) % 360;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-16 h-16 rounded-full border border-white/40 flex items-center justify-center text-[9px] text-white/70">
        <span className="absolute top-0 left-1/2 -translate-x-1/2">N</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2">S</span>
        <span className="absolute left-0 top-1/2 -translate-y-1/2">W</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">E</span>
        <div
          className="absolute left-1/2 bottom-1/2 w-[2px] h-7 bg-cyan-400 rounded-full origin-bottom -translate-x-1/2"
          style={{ transform: `rotate(${arrowDeg}deg)` }}
        />
      </div>
      <p className="text-xs mt-1">
        {direction} ({degrees.toFixed(0)}°)
      </p>
      <p className="text-[10px] opacity-70 -mt-1">Blowing to: {arrowDeg.toFixed(0)}°</p>
    </div>
  );
}

/* ---------------------------------------------------
   AIR QUALITY SCALE
--------------------------------------------------- */
function AirQualityScale({ aqi }) {
  const value =
    aqi?.available === true && aqi?.aqi != null
      ? Math.max(0, Math.min(500, Number(aqi.aqi)))
      : null;
  const pct = value != null ? (value / 500) * 100 : null;
  const ticks = [0, 50, 100, 150, 200, 300, 500];
  const unavailableText =
    aqi?.available === false && typeof aqi?.message === "string" && aqi.message.trim()
      ? aqi.message
      : "Air quality unavailable";

  return (
    <div className="w-full">
      <div className="relative h-3 w-full" style={{ background: AQI_GRADIENT }}>
        {ticks.map((v) => (
          <div
            key={v}
            className="absolute top-0 h-3 border-l border-white/40"
            style={{ left: `${(v / 500) * 100}%` }}
          />
        ))}
        {pct != null && (
          <div
            className="absolute -top-1 flex flex-col items-center"
            style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
          >
            <div className="w-[2px] h-3 bg-white" />
            <div className="text-[9px] bg-black/70 px-1 rounded whitespace-nowrap">
              AQI {value} — {aqi.category}
            </div>
          </div>
        )}
        {pct == null && (
          <div className="absolute top-1 left-2 text-[10px] text-white/60">
            {unavailableText}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------
   AQI CACHE & DEDUP HELPERS
   Prevents multiple AQI fetches for exact same coordinates
   and caches both successful and unavailable (503) results.
--------------------------------------------------- */
const AQI_CACHE = {}; // { "lat,lon": { data, timestamp } }
const AQI_IN_FLIGHT = {}; // { "lat,lon": promise }
const AQI_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Normalize coordinates to 3 decimal places for cache key
 * Prevents tiny floating-point variations from causing new fetches
 */
function normalizeAqiKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/**
 * Check if cached AQI is still valid
 */
function isAqiCacheValid(cacheKey) {
  const entry = AQI_CACHE[cacheKey];
  if (!entry) return false;
  return Date.now() - entry.timestamp < AQI_CACHE_TTL_MS;
}

/**
 * Get cached AQI if valid, otherwise null
 */
function getCachedAqi(lat, lon) {
  const cacheKey = normalizeAqiKey(lat, lon);
  if (isAqiCacheValid(cacheKey)) {
    return AQI_CACHE[cacheKey].data;
  }
  return null;
}

/**
 * Set AQI cache entry
 */
function setCachedAqi(lat, lon, data) {
  const cacheKey = normalizeAqiKey(lat, lon);
  AQI_CACHE[cacheKey] = {
    data,
    timestamp: Date.now(),
  };
}

/**
 * Get in-flight AQI request promise if one exists
 */
function getInFlightAqiRequest(lat, lon) {
  const cacheKey = normalizeAqiKey(lat, lon);
  return AQI_IN_FLIGHT[cacheKey] || null;
}

/**
 * Set in-flight AQI request (or clear by passing null)
 */
function setInFlightAqiRequest(lat, lon, promise) {
  const cacheKey = normalizeAqiKey(lat, lon);
  if (promise === null) {
    delete AQI_IN_FLIGHT[cacheKey];
  } else {
    AQI_IN_FLIGHT[cacheKey] = promise;
  }
}

function normalizeAqiPayload(payload, httpStatus) {
  if (payload?.available === true && payload?.aqi != null) {
    const aqiValue = Number(payload.aqi);
    if (Number.isFinite(aqiValue)) {
      return {
        available: true,
        aqi: aqiValue,
        category: typeof payload.category === "string" ? payload.category : "Unknown",
        source: typeof payload.source === "string" ? payload.source : "Unknown",
      };
    }
  }

  const reason =
    typeof payload?.reason === "string" && payload.reason
      ? payload.reason
      : httpStatus === 429
      ? "rate_limited"
      : "upstream_unavailable";

  const message =
    typeof payload?.message === "string" && payload.message.trim()
      ? payload.message
      : "Air quality unavailable";

  return {
    available: false,
    reason,
    message,
  };
}

/* ---------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------- */
export default function RiverConditions() {
  const defaultStation = stations.find((s) => s.id === "03322420") ?? stations[0];

  const { profile, saveMapPreferences, updateCachedRiverData, toggleFavorite } = useUserProfile();
  const { user } = useAuth();

  /**
   * Single source of truth for initial station selection
   * Resolves in order: saved profile defaultLocation -> nearest station, or default station
   * This memoized value is used to initialize all mount-time state consistently
   */
  const initialStation = useMemo(() => {
    // If profile has saved default location, find nearest station to it
    if (profile?.mapPreferences?.defaultLocation) {
      const saved = profile.mapPreferences.defaultLocation;
      const nearestStation = stations.reduce((prev, curr) => {
        const prevDist = Math.hypot(prev.lat - saved.lat, prev.lon - saved.lon);
        const currDist = Math.hypot(curr.lat - saved.lat, curr.lon - saved.lon);
        return currDist < prevDist ? curr : prev;
      });
      return nearestStation;
    }
    // Otherwise use default station
    return defaultStation;
  }, [profile?.mapPreferences?.defaultLocation]);

  const [selected, setSelected] = useState(initialStation);
  const [selectedDam, setSelectedDam] = useState(null);
  const [mapLocks, setMapLocks] = useState(ohioRiverLocks);
  const [lockActivityById, setLockActivityById] = useState({});
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [data, setData] = useState(null);
  const [weather, setWeather] = useState(null);
  const [aqi, setAqi] = useState(null);
  const [findMeInfo, setFindMeInfo] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState(null); // Track user location for map
  const [userCityState, setUserCityState] = useState(null); // User's city and state
  const [mapType, setMapType] = useState("lock"); // "marine", "lock", or "topo"
  const [showLockActivityDropdown, setShowLockActivityDropdown] = useState(false);

  const [wxLoc, setWxLoc] = useState({
    lat: initialStation.lat,
    lon: initialStation.lon,
  });

  const [mapCenter, setMapCenter] = useState({ 
    lat: initialStation.lat, 
    lon: initialStation.lon 
  });

  // Prevent “data disappears”: keep last good payloads
  const lastGoodRiverRef = useRef(null);
  const lastGoodWeatherRef = useRef(null);
  const lastGoodAqiRef = useRef(null);

  // Avoid race conditions between station changes / refresh
  const riverReqIdRef = useRef(0);

  // Track if we've loaded saved preferences to avoid redundant effects
  const preferencesLoadedRef = useRef(false);

  // Track the last normalized AQI coordinate key to prevent refetches on tiny variations
  const wxLocNormalizedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadArcgisLocks() {
      try {
        const res = await fetch(`/api/arcgis-locks?t=${Date.now()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (Array.isArray(json?.locks) && json.locks.length > 0) {
          setMapLocks(json.locks);
        }
      } catch {
        // Keep static fallback silently.
      }
    }

    loadArcgisLocks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLockActivity() {
      if (!Array.isArray(mapLocks) || mapLocks.length === 0) return;

      const entries = await Promise.all(
        mapLocks.map(async (lock) => {
          const gaugeId = lock?.arcgisGaugeId || lock?.floodStages?.gaugeId;
          if (!gaugeId) {
            return [lock.id, normalizeLockActivity(lock, null)];
          }

          try {
            const params = new URLSearchParams({
              gaugeId: String(gaugeId).toUpperCase(),
            });

            if (lock?.floodStages?.action != null) params.set("action", String(lock.floodStages.action));
            if (lock?.floodStages?.minor != null) params.set("minor", String(lock.floodStages.minor));
            if (lock?.floodStages?.moderate != null) params.set("moderate", String(lock.floodStages.moderate));
            if (lock?.floodStages?.major != null) params.set("major", String(lock.floodStages.major));
            if (lock?.arcgisStatus) params.set("status", String(lock.arcgisStatus));

            const response = await fetch(`/api/gauge-traffic?${params.toString()}`);
            if (!response.ok) {
              return [lock.id, normalizeLockActivity(lock, null)];
            }

            const payload = await response.json();
            if (!payload?.available || !payload?.data) {
              return [lock.id, normalizeLockActivity(lock, null)];
            }

            const metrics = {
              ...payload.data,
              gaugeDerived: true,
              realTimeData: true,
            };
            return [lock.id, normalizeLockActivity(lock, metrics)];
          } catch {
            return [lock.id, normalizeLockActivity(lock, null)];
          }
        })
      );

      if (cancelled) return;
      setLockActivityById(Object.fromEntries(entries));
    }

    loadLockActivity();

    const refreshInterval = setInterval(loadLockActivity, 300000);
    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [mapLocks]);

  /* -------------------- HELPER: Find matching station for a dam -------------------- */
  // When a lock/dam is clicked, find the best matching station
  // Priority: 1) Name match (L&D stations), 2) Nearest by distance
  const findStationForDam = (dam) => {
    // First, try to find a station with a matching name (for L&D stations with gauges)
    // Normalize names for comparison (remove spaces, punctuation, case-insensitive)
    const normalizeName = (name) => 
      name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const damNameNorm = normalizeName(dam.name);
    
    // Gather all plausible name matches first
    const nameMatches = stations.filter(s => {
      const stationNameNorm = normalizeName(s.name);
      return stationNameNorm === damNameNorm || 
             stationNameNorm.includes(damNameNorm) ||
             damNameNorm.includes(stationNameNorm);
    });

    // If multiple names match (e.g., McAlpine Upper/Lower), prefer closest river mile.
    if (nameMatches.length > 0) {
      if (typeof dam.riverMile === 'number') {
        return nameMatches.reduce((best, candidate) => {
          const bestDelta = Math.abs((best.riverMile ?? Infinity) - dam.riverMile);
          const candDelta = Math.abs((candidate.riverMile ?? Infinity) - dam.riverMile);
          return candDelta < bestDelta ? candidate : best;
        });
      }
      return nameMatches[0];
    }
    
    // Fallback: find nearest station by distance
    return stations.reduce((prev, curr) => {
      const prevDist = Math.hypot(prev.lat - dam.lat, prev.lon - dam.lon);
      const currDist = Math.hypot(curr.lat - dam.lat, curr.lon - dam.lon);
      return currDist < prevDist ? curr : prev;
    });
  };

  /**
   * Unified handler for lock/dam/station selection from map
   * Ensures wxLoc uses matched station coordinates (not dam), while map centers on dam
   * This prevents redundant weather/AQI fetches for nearly-identical locations
   */
  const handleMapSelection = (id) => {
    const station = stations.find(s => s.id === id);
    const dam = mapLocks.find(l => l.id === id);

    if (station) {
      // Direct station selection
      setSelected(station);
      setSelectedDam(null);
      setWxLoc({ lat: station.lat, lon: station.lon });
      setMapCenter({ lat: station.lat, lon: station.lon });
    } else if (dam) {
      // Dam selection - map to matching station if available
      const matchingStation = findStationForDam(dam);
      setSelectedDam(dam);
      setSelected(matchingStation);
      
      // IMPORTANT: Use matched station coords for weather/AQI context, not dam coords
      // This avoids redundant refetches when dam and its station are nearly co-located
      if (matchingStation) {
        setWxLoc({ lat: matchingStation.lat, lon: matchingStation.lon });
      } else {
        // No matching station found - use dam coordinates as fallback
        setWxLoc({ lat: dam.lat, lon: dam.lon });
      }
      
      // Center map on the dam itself (what user clicked on)
      setMapCenter({ lat: dam.lat, lon: dam.lon });
    }
  };

  /* -------------------- DATA LOADERS -------------------- */

  async function loadRiver(stationOrId, { silent = false } = {}) {
    const reqId = ++riverReqIdRef.current;

    const st =
      typeof stationOrId === "object" && stationOrId
        ? stationOrId
        : stations.find((s) => s.id === stationOrId) || null;

    const site = typeof stationOrId === "string" ? stationOrId : stationOrId?.id;

    const ahps =
      typeof stationOrId === "object" && stationOrId ? stationOrId.ahps : st?.ahps ?? null;

    const lat = st?.lat;
    const lon = st?.lon;

    if (!site) return;

    try {
      // IMPORTANT:
      // Pass lat/lon so the API can auto-discover nearest AHPS/NWPS gauge
      // for stations that don't have explicit .ahps mapping.
      const qs = new URLSearchParams({ site, _: String(Date.now()) });
      if (ahps) qs.set("ahps", ahps);
      if (lat != null) qs.set("lat", String(lat));
      if (lon != null) qs.set("lon", String(lon));

      const res = await fetch(`/api/river-data?${qs.toString()}`);
      if (!res.ok) throw new Error("River API error");
      const json = await res.json();

      if (reqId !== riverReqIdRef.current) return;

      const okObserved = typeof json?.observed === "number" && isFinite(json.observed);
      const okHistory = Array.isArray(json?.history) && json.history.length > 0;

      if (okObserved || okHistory) {
        lastGoodRiverRef.current = json;
        setData(json);
        // Auto-cache river data to profile
        if (updateCachedRiverData) {
          updateCachedRiverData(json);
        }
      } else if (!silent && lastGoodRiverRef.current) {
        setData(lastGoodRiverRef.current);
      } else if (!silent) {
        setData(json);
      }
    } catch {
      if (lastGoodRiverRef.current) setData(lastGoodRiverRef.current);
    }
  }

  async function loadWeather(lat, lon) {
    try {
      // Step 1: Get the NWS grid point for this location
      const pointRes = await fetch(
        `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
        { headers: { 'User-Agent': 'RiverValleyReport (contact@rivervalleyreport.com)' } }
      );
      
      if (!pointRes.ok) throw new Error("NWS point lookup failed");
      const pointData = await pointRes.json();
      
      // Step 2: Get the forecast from the grid endpoint
      const forecastUrl = pointData.properties.forecast;
      const observationStationsUrl = pointData.properties.observationStations;
      
      // Fetch forecast data
      const forecastRes = await fetch(forecastUrl, {
        headers: { 'User-Agent': 'RiverValleyReport (contact@rivervalleyreport.com)' }
      });
      if (!forecastRes.ok) throw new Error("NWS forecast failed");
      const forecastData = await forecastRes.json();
      
      // Get current period (now) and today's periods for high/low
      const periods = forecastData.properties.periods || [];
      const currentPeriod = periods[0];
      
      if (!currentPeriod) throw new Error("No forecast periods available");
      
      // Find today's high and low from day/night periods
      const todayPeriods = periods.slice(0, 2); // Current + next period usually covers day/night
      const temps = todayPeriods.map(p => p.temperature).filter(t => t != null);
      const tempHigh = Math.max(...temps);
      const tempLow = Math.min(...temps);
      
      // Step 3: Try to get actual observations from nearest station
      let currentTemp = currentPeriod.temperature;
      let windSpeed = parseInt(currentPeriod.windSpeed) || 0;
      let windGust = windSpeed * 1.3; // Estimate gust as 1.3x sustained
      let windDirection = currentPeriod.windDirection;
      
      try {
        const stationsRes = await fetch(observationStationsUrl, {
          headers: { 'User-Agent': 'RiverValleyReport (contact@rivervalleyreport.com)' }
        });
        if (stationsRes.ok) {
          const stationsData = await stationsRes.json();
          const stationId = stationsData.features?.[0]?.properties?.stationIdentifier;
          
          if (stationId) {
            const obsRes = await fetch(
              `https://api.weather.gov/stations/${stationId}/observations/latest`,
              { headers: { 'User-Agent': 'RiverValleyReport (contact@rivervalleyreport.com)' } }
            );
            if (obsRes.ok) {
              const obsData = await obsRes.json();
              const obs = obsData.properties;
              
              // Use actual observations if available
              if (obs.temperature?.value != null) {
                currentTemp = (obs.temperature.value * 9/5) + 32; // C to F
              }
              if (obs.windSpeed?.value != null) {
                windSpeed = obs.windSpeed.value * 0.621371; // km/h to mph
              }
              if (obs.windGust?.value != null) {
                windGust = obs.windGust.value * 0.621371; // km/h to mph
              } else {
                windGust = windSpeed * 1.3; // Estimate
              }
              if (obs.windDirection?.value != null) {
                windDirection = Math.round(obs.windDirection.value);
              }
            }
          }
        }
      } catch (obsErr) {
        console.log("Using forecast data (observations unavailable)");
      }
      
      // Parse wind direction to degrees if it's a string like "NW"
      let windDeg = typeof windDirection === 'string' 
        ? parseWindDirection(windDirection) 
        : windDirection || 0;

      const w = {
        tempF: currentTemp,
        tempHighF: tempHigh,
        tempLowF: tempLow,
        windMph: windSpeed,
        windGustMph: windGust,
        windGustHighMph: windGust, // NWS doesn't provide daily max gust easily
        windDir: windDirLabel(windDeg),
        windDeg: windDeg,
        precip: currentPeriod.probabilityOfPrecipitation?.value ?? 0,
        code: 0, // NWS doesn't use numeric codes
        shortForecast: currentPeriod.shortForecast,
        source: 'NWS'
      };

      lastGoodWeatherRef.current = w;
      setWeather(w);
    } catch (err) {
      console.error("NWS weather error:", err);
      // Fallback to Open-Meteo if NWS fails
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability,windgusts_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=America/Chicago`
        );
        if (!res.ok) throw new Error("Weather fallback error");
        const json = await res.json();
        const cw = json.current_weather;

        const todayWindGusts = json.hourly?.windgusts_10m || [];
        const maxWindGustKmh = todayWindGusts.length > 0 ? Math.max(...todayWindGusts.filter(g => g != null)) : cw.windspeed;
        const maxWindGustMph = maxWindGustKmh * 0.621371;

        const tempHighC = json.daily?.temperature_2m_max?.[0];
        const tempLowC = json.daily?.temperature_2m_min?.[0];

        const w = {
          tempF: cw.temperature * 1.8 + 32,
          tempHighF: tempHighC ? (tempHighC * 1.8 + 32) : null,
          tempLowF: tempLowC ? (tempLowC * 1.8 + 32) : null,
          windMph: cw.windspeed * 0.621371,
          windGustMph: (cw.windgusts || cw.windspeed) * 0.621371,
          windGustHighMph: maxWindGustMph,
          windDir: windDirLabel(cw.winddirection),
          windDeg: cw.winddirection,
          precip: json.hourly?.precipitation_probability?.[0] ?? 0,
          code: cw.weathercode,
          source: 'Open-Meteo'
        };

        lastGoodWeatherRef.current = w;
        setWeather(w);
      } catch {
        if (lastGoodWeatherRef.current) setWeather(lastGoodWeatherRef.current);
      }
    }
  }

  // Helper to convert wind direction abbreviations to degrees
  function parseWindDirection(dir) {
    const directions = {
      'N': 0, 'NNE': 22, 'NE': 45, 'ENE': 67,
      'E': 90, 'ESE': 112, 'SE': 135, 'SSE': 157,
      'S': 180, 'SSW': 202, 'SW': 225, 'WSW': 247,
      'W': 270, 'WNW': 292, 'NW': 315, 'NNW': 337
    };
    return directions[dir] || 0;
  }

  /**
    * Fetch AQI with caching, dedup, and available-flag handling
   */
  async function loadAQI(lat, lon) {
    // Check if cache is still valid
    const cached = getCachedAqi(lat, lon);
    if (cached) {
      setAqi(cached);
      if (cached.available) {
        lastGoodAqiRef.current = cached;
      }
      return cached;
    }

    // Check if request already in-flight
    const inFlight = getInFlightAqiRequest(lat, lon);
    if (inFlight) {
      return inFlight;
    }

    // Create new request promise
    const requestPromise = (async () => {
      try {
        const res = await fetch(`/api/aqi?lat=${lat}&lon=${lon}`);

        let payload = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }

        const result = normalizeAqiPayload(payload, res.status);

        if (result.available) {
          lastGoodAqiRef.current = result;
        }
        setAqi(result);

        // Cache the result (including unavailable/error)
        setCachedAqi(lat, lon, result);
      } catch {
        // Network failure should also produce a clean unavailable UI state.
        const result = {
          available: false,
          reason: "upstream_unavailable",
          message: "Air quality unavailable",
        };
        setCachedAqi(lat, lon, result);
        setAqi(result);
      } finally {
        setInFlightAqiRequest(lat, lon, null);
      }
    })();

    // Mark as in-flight
    setInFlightAqiRequest(lat, lon, requestPromise);

    return requestPromise;
  }

  /* -------------------- EFFECTS -------------------- */

  // Load saved map preferences on mount (location, zoom, dark mode)
  // FIXED: Guard state updates to avoid redundant setSelected/setWxLoc if values haven't actually changed
  // The initialStation is already set from profile, so this effect only applies dark mode and cached data
  useEffect(() => {
    if (!profile || preferencesLoadedRef.current) return;

    preferencesLoadedRef.current = true;

    const savedPrefs = profile.mapPreferences;
    if (savedPrefs) {
      // Restore dark mode preference
      if (savedPrefs.darkMode === true) {
        document.documentElement.classList.add('dark');
      }

      // NOTE: defaultLocation-based station selection is already handled by initialStation useMemo
      // Do NOT call setSelected/setWxLoc here for defaultLocation, as that would cause a second render/fetch
      // The state was already initialized correctly from initialStation above
    }

    // Restore last cached data if available
    if (profile.cachedData?.lastSeenRiverData) {
      setData(profile.cachedData.lastSeenRiverData);
    }
  }, [profile]); // Only run when profile changes

  // Load river data when selected station changes
  // FIXED: Add proper dependency array
  useEffect(() => {
    if (selected) {
      loadRiver(selected);
    }
  }, [selected]); // Only run when selected changes

  // Auto-refresh river data every 60 seconds
  // FIXED: Add proper dependency array and cleanup
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => {
      loadRiver(selected, { silent: true });
    }, 60_000);
    return () => clearInterval(t);
  }, [selected]); // Only recreate timer when selected changes

  // Load weather and AQI when location changes
  // FIXED: Normalize coordinates before triggering fetch to avoid refetching on tiny variations
  // Use the normalized key to prevent redundant requests for nearly identical coordinates
  useEffect(() => {
    const normalizedKey = normalizeAqiKey(wxLoc.lat, wxLoc.lon);
    
    // Only load if the normalized location key actually changed
    // This prevents refetches when coordinates vary by sub-0.001 degrees
    if (wxLocNormalizedRef.current !== normalizedKey) {
      wxLocNormalizedRef.current = normalizedKey;
      loadWeather(wxLoc.lat, wxLoc.lon);
      loadAQI(wxLoc.lat, wxLoc.lon);
    }
  }, [wxLoc.lat, wxLoc.lon]); // Still depend on raw coordinates for accuracy

  // Auto-save map state changes to user profile (location, zoom, dark mode)
  // FIXED: Add proper dependencies and prevent excessive saves
  useEffect(() => {
    if (!saveMapPreferences || !selected) return;

    const timer = setTimeout(() => {
      saveMapPreferences({
        defaultLocation: {
          lat: selected.lat,
          lon: selected.lon,
        },
        zoom: 8, // Default zoom level
      });

    }, 1000); // Debounce saves to avoid too many updates

    return () => clearTimeout(timer);
  }, [selected?.lat, selected?.lon, saveMapPreferences]); // Only save when coordinates change

  // Cache user location on page unload, disconnect, or offline
  // FIXED: Add proper dependency array
  useEffect(() => {
    const cacheLocation = () => {
      if (userLocation && userCityState) {
        const locationCache = {
          lat: userLocation.lat,
          lon: userLocation.lon,
          cityState: userCityState,
          timestamp: Date.now()
        };
        localStorage.setItem('cachedUserLocation', JSON.stringify(locationCache));
      }
    };

    // Cache on beforeunload (page close/refresh)
    window.addEventListener('beforeunload', cacheLocation);
    
    // Cache on offline
    window.addEventListener('offline', cacheLocation);
    
    // Cache on visibility change (tab switch, minimize)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cacheLocation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', cacheLocation);
      window.removeEventListener('offline', cacheLocation);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userLocation, userCityState]); // Only recreate when location changes

  // Snap user location to nearest point on river path
  const snapToRiver = useCallback((userLat, userLon, riverCoords) => {
    if (!Array.isArray(riverCoords) || riverCoords.length === 0) {
      return { lat: userLat, lon: userLon };
    }

    let nearestPoint = null;
    let minDistance = Infinity;

    for (const coord of riverCoords) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const [lat, lon] = coord;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      const distance = Math.sqrt(
        Math.pow((lat - userLat) * 69, 2) + // 69 miles per degree latitude
        Math.pow((lon - userLon) * 54 * Math.cos(userLat * Math.PI / 180), 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = { lat, lon };
      }
    }

    return nearestPoint || { lat: userLat, lon: userLon };
  }, []);

  // Find downstream Lock & Dam from a river position
  const findDownstreamLock = useCallback((riverLat, riverLon, locks) => {
    if (!Array.isArray(locks) || locks.length === 0) return null;

    // Find the nearest lock to the user's position
    let nearest = null;
    let bestDist = Infinity;

    for (const lock of locks) {
      if (typeof lock?.lat !== "number" || typeof lock?.lon !== "number") continue;
      const d = distKm(riverLat, riverLon, lock.lat, lock.lon);
      if (d < bestDist) {
        bestDist = d;
        nearest = lock;
      }
    }

    if (!nearest) return null;

    // If we have river miles, find which lock the user is upstream of
    if (typeof nearest.riverMile === "number") {
      // Get user's approximate river mile by comparing to nearest lock
      const userRiverMile = nearest.riverMile;
      
      // Find all locks that are downstream (higher river mile) from user's position
      const downstreamLocks = locks
        .filter((lock) => 
          typeof lock?.riverMile === "number" && 
          lock.riverMile >= userRiverMile
        )
        .sort((a, b) => a.riverMile - b.riverMile);
      
      // Return the closest downstream lock (could be the nearest if user is very close)
      if (downstreamLocks.length > 0) {
        return downstreamLocks[0];
      }
    }

    // Fallback to nearest lock if river mile logic doesn't work
    return nearest;
  }, []); // Memoize function - no dependencies needed

  // Memoize buildFindMeInfo to prevent recalculation
  const buildFindMeInfo = useCallback((userLat, userLon, item) => {
    if (!item) return null;

    // Calculate straight-line distance to downstream lock/dam
    const km = distKm(userLat, userLon, item.lat, item.lon);
    const miles = kmToMiles(km);
    const distanceText = `${miles.toFixed(1)} miles downstream`;

    return {
      label: `You are upstream of ${item.name}`,
      distance: distanceText,
    };
  }, []); // Memoize function - no dependencies needed

  /* -------------------- LOCATE ME ----------------------- */

  const locateMe = () => {
    // If Find Me is already active, toggle it off
    if (userLocation) {
      // Clear Find Me state
      setLoadingLocation(false);
      setUserLocation(null);
      setUserCityState(null);
      setFindMeInfo(null);
      
      // Find nearest station to the river center and snap to it (J.T. Myers L&D area)
      const centerLat = 37.77;
      const centerLon = -87.5747;
      const nearestStation = stations.reduce((prev, curr) => {
        const prevDist = Math.hypot(prev.lat - centerLat, prev.lon - centerLon);
        const currDist = Math.hypot(curr.lat - centerLat, curr.lon - centerLon);
        return currDist < prevDist ? curr : prev;
      });
      
      if (nearestStation) {
        setSelected(nearestStation);
        setSelectedDam(null); // Clear dam selection
        setMapCenter({ lat: nearestStation.lat, lon: nearestStation.lon });
        setWxLoc({ lat: nearestStation.lat, lon: nearestStation.lon });
      }
      
      return;
    }
    
    // Otherwise, activate Find Me
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    setLoadingLocation(true);

    // Add timeout to geolocation - don't hang forever
    const geoTimeout = setTimeout(() => {
      setLoadingLocation(false);
      alert("Location request timed out. Please check your browser permissions.");
    }, 10000); // 10 second timeout

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        clearTimeout(geoTimeout); // Clear timeout on success
        const userLat = coords.latitude;
        const userLon = coords.longitude;

        // Center map on user
        setMapCenter({ lat: userLat, lon: userLon });
        
        // Store user location for map component
        setUserLocation({ lat: userLat, lon: userLon });

        // Weather follows user
        setWxLoc({ lat: userLat, lon: userLon });

        // Try to load cached location first
        try {
          const cached = localStorage.getItem('cachedUserLocation');
          if (cached) {
            const locationCache = JSON.parse(cached);
            // If cached location is within 0.1 degrees (~7 miles) of current location and less than 7 days old
            const cacheDist = Math.sqrt(
              Math.pow(locationCache.lat - userLat, 2) + 
              Math.pow(locationCache.lon - userLon, 2)
            );
            const cacheAge = Date.now() - (locationCache.timestamp || 0);
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            
            if (cacheDist < 0.1 && cacheAge < sevenDays) {

              if (locationCache.cityState) {
                setUserCityState(locationCache.cityState);
              }
              // Load cached findMeInfo for instant display
              if (locationCache.findMeInfo) {
                setFindMeInfo(locationCache.findMeInfo);

              }
            }
          }
        } catch (err) {

        }

        // Reverse geocode and fetch river outline in parallel
        let geocodeSuccess = false;
        let riverCoords = [];
        
        try {
          // Make both API calls in parallel
          const [geocodeResponse, riverResponse] = await Promise.all([
            fetch(`/api/geocode?lat=${userLat}&lon=${userLon}&t=${Date.now()}`, {
              method: 'GET',
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              }
            }),
            fetch(`/api/river-outline?t=${Date.now()}`, { cache: 'no-store' })
          ]);
          
          // Process geocode response
          if (geocodeResponse.ok) {
            const data = await geocodeResponse.json();
            if (data && data.success && data.location) {
              // Use formatted location string for display
              setUserCityState(data.location.formatted || data.location);
              geocodeSuccess = true;
              
              // Save location to user profile if logged in (non-blocking)
              if (user?.uid) {
                updateUserLocation(user.uid, {
                  lat: userLat,
                  lon: userLon,
                  city: data.location.city || null,
                  state: data.location.state || null,
                  county: data.location.county || null,
                }).catch(console.error);
              }
            }
          }
          
          // Process river outline response
          if (riverResponse.ok) {
            const riverData = await riverResponse.json();
            if (riverData.success && Array.isArray(riverData.elements)) {
              riverData.elements.forEach((el) => {
                if (el.type === 'way' && Array.isArray(el.coordinates)) {
                  riverCoords.push(...el.coordinates);
                }
              });
            }
          }
        } catch (error) {
          console.error("Error fetching location data:", error);
        }

        // Snap user location to nearest point on river
        const snappedLocation = snapToRiver(userLat, userLon, riverCoords);
        
        // Find downstream lock from snapped river position
        const downstreamLock = findDownstreamLock(
          snappedLocation.lat,
          snappedLocation.lon,
          mapLocks
        );

        if (downstreamLock) {
          // Find nearest station to the lock for river data
          const nearestStation = stations.reduce((prev, curr) => {
            const prevDist = Math.hypot(prev.lat - downstreamLock.lat, prev.lon - downstreamLock.lon);
            const currDist = Math.hypot(curr.lat - downstreamLock.lat, curr.lon - downstreamLock.lon);
            return currDist < prevDist ? curr : prev;
          });
          
          // Set lock and station for river data, but keep user's location for weather
          setSelectedDam(downstreamLock); // Select the lock
          setSelected(nearestStation); // Use nearest station for river data
          // DO NOT change wxLoc - keep user's actual location for weather
          // DO NOT change userCityState - keep user's actual location name
          setMapCenter({ lat: downstreamLock.lat, lon: downstreamLock.lon });

          const info = buildFindMeInfo(
            userLat,
            userLon,
            downstreamLock
          );

          setFindMeInfo(info);
          
          // Cache the location if geocoding was successful
          // Use setTimeout to ensure React state has updated
          if (geocodeSuccess) {
            setTimeout(() => {
              // Re-fetch from geocoding API to get fresh data for cache
              const cacheGeocodeUrl = `/api/geocode?lat=${userLat}&lon=${userLon}`;
              fetch(cacheGeocodeUrl)
                .then(r => {
                  if (!r.ok) {

                    return null;
                  }
                  return r.json();
                })
                .then(data => {
                  if (data && data.success && data.location) {
                    const locationCache = {
                      lat: userLat,
                      lon: userLon,
                      cityState: data.location.formatted || data.location,
                      findMeInfo: info,
                      timestamp: Date.now()
                    };
                    localStorage.setItem('cachedUserLocation', JSON.stringify(locationCache));

                  }
                })
                .catch(err => console.error('Cache update failed:', err));
            }, 500);
          }
        }
        
        // Clear loading state
        setLoadingLocation(false);
      },
      (err) => {
        clearTimeout(geoTimeout); // Clear timeout on error
        setLoadingLocation(false);

        let errorMsg = "Unable to get location.";
        
        switch(err.code) {
          case err.PERMISSION_DENIED:
            errorMsg = "Location access denied. Please enable location permissions in your browser settings.";
            break;
          case err.POSITION_UNAVAILABLE:
            errorMsg = "Location information is unavailable. Please check your device's location settings.";
            break;
          case err.TIMEOUT:
            errorMsg = "Location request timed out. Please try again.";
            break;
          default:
            errorMsg = `Unable to get location: ${err.message || 'Unknown error'}`;
        }
        
        alert(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60_000,
      }
    );
  };

  /* -------------------- DERIVED UI VALUES -------------------- */
  // FIXED: Memoize expensive computations to prevent recalculation on every render

  const selectedDamFloodStage = useMemo(() => {
    const n = Number(selectedDam?.floodStages?.minor);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [selectedDam?.floodStages?.minor]);

  const displayFloodStage = useMemo(() => {
    const apiFlood = Number(data?.floodStage);
    if (Number.isFinite(apiFlood) && apiFlood > 0) return apiFlood;
    return selectedDamFloodStage;
  }, [data?.floodStage, selectedDamFloodStage]);

  const hasFloodStage = useMemo(() =>
    Number.isFinite(displayFloodStage) && displayFloodStage > 0,
    [displayFloodStage]
  );

  const riverConditionLabel = useMemo(() => {
    const observed = Number(data?.observed);
    const windMph = Number(weather?.windMph || 0);
    const gustMph = Number(weather?.windGustHighMph || weather?.windGustMph || 0);
    const precipChance = Number(weather?.precip || 0);
    const forecastText = String(weather?.shortForecast || "").toLowerCase();

    const severeWx = /thunder|storm|torrential|heavy rain|flash/.test(forecastText);
    const wetWx = /rain|showers|snow|sleet/.test(forecastText);

    const flowRatio =
      hasFloodStage && Number.isFinite(observed) && Number.isFinite(displayFloodStage)
        ? observed / displayFloodStage
        : null;

    if (flowRatio != null && flowRatio >= 0.95 && (gustMph >= 25 || windMph >= 20)) return "Critical Flow + Wind";
    if (flowRatio != null && flowRatio >= 0.9) return "High River Stage";
    if (severeWx && (gustMph >= 20 || precipChance >= 60)) return "Severe Weather Impact";
    if (wetWx && (gustMph >= 15 || precipChance >= 45)) return "Wind + Precip Impact";
    if (gustMph >= 25 || windMph >= 20) return "High Wind Influence";
    return "Stable";
  }, [data?.observed, hasFloodStage, displayFloodStage, weather?.windMph, weather?.windGustHighMph, weather?.windGustMph, weather?.precip, weather?.shortForecast]);

  const hazardCode = useMemo(() => {
    let score = 0;

    const apiHazard =
      typeof data?.hazardCode === "number" && data.hazardCode >= 0 && data.hazardCode <= 3
        ? data.hazardCode
        : 0;

    const observed = Number(data?.observed);
    if (hasFloodStage && Number.isFinite(observed)) {
      const ratio = observed / displayFloodStage;
      if (ratio >= 1.0) score = Math.max(score, 3);
      else if (ratio >= 0.9) score = Math.max(score, 2);
      else if (ratio >= 0.75) score = Math.max(score, 1);
    }

    const windMph = Number(weather?.windMph || 0);
    const gustMph = Number(weather?.windGustHighMph || weather?.windGustMph || 0);
    if (gustMph >= 38 || windMph >= 30) score += 1.2;
    else if (gustMph >= 30 || windMph >= 24) score += 0.9;
    else if (gustMph >= 22 || windMph >= 18) score += 0.45;

    const precipChance = Number(weather?.precip || 0);
    if (precipChance >= 80) score += 0.9;
    else if (precipChance >= 60) score += 0.55;
    else if (precipChance >= 40) score += 0.25;

    const forecastText = String(weather?.shortForecast || "").toLowerCase();
    if (/thunder|storm|torrential|heavy rain|flash/.test(forecastText)) score += 1.1;
    else if (/rain|showers|snow|sleet/.test(forecastText)) score += 0.35;

    const combined = Math.max(apiHazard, score);
    return Math.max(0, Math.min(3, Math.round(combined)));
  }, [data?.hazardCode, data?.observed, hasFloodStage, displayFloodStage, weather?.windMph, weather?.windGustHighMph, weather?.windGustMph, weather?.precip, weather?.shortForecast]);

  const hazardLabel = useMemo(() => 
    typeof data?.hazardLabel === "string" && data.hazardLabel.trim()
      ? data.hazardLabel.trim()
      : HAZARD_LEVELS[hazardCode]?.label ?? "Normal",
    [data?.hazardLabel, hazardCode]
  );

  const precip = useMemo(() => weather?.precip ?? 0, [weather?.precip]);
  const precipIcon = useMemo(() => 
    getWeatherIcon(weather?.shortForecast, precip),
    [weather?.shortForecast, precip]
  );

  const mapSrc = useMemo(() => 
    `https://www.marinetraffic.com/en/ais/embed/map?zoom=9&centerx=${mapCenter.lon}&centery=${mapCenter.lat}&layer_all=1`,
    [mapCenter.lat, mapCenter.lon]
  );

  // ✅ Past 7 days (daily highs) - memoized
  const past7Series = useMemo(() => dailyHighHistory(data?.history, 7), [data?.history]);

  // ✅ Forecast 7 days (daily highs), tolerate many API formats - memoized
  const predictionSeries = useMemo(() => normalizeForecastSeries(data, 7), [data]);
  const flowPredictionSeries = useMemo(() => {
    if (!Array.isArray(data?.flowPrediction)) return null;
    return data.flowPrediction
      .map((p) => ({ t: p?.t, v: Number(p?.v) }))
      .filter((p) => p.t && Number.isFinite(p.v))
      .slice(0, 7);
  }, [data?.flowPrediction]);

  const flowUnit = useMemo(() => String(data?.flowUnit || "cfs"), [data?.flowUnit]);
  const flowSource = useMemo(() => String(data?.flowSource || ""), [data?.flowSource]);
  const flowNow = useMemo(() => {
    if (!Array.isArray(flowPredictionSeries) || flowPredictionSeries.length === 0) return null;
    return flowPredictionSeries[0]?.v ?? null;
  }, [flowPredictionSeries]);
  const hasFlowGuidance = useMemo(() => Number.isFinite(flowNow), [flowNow]);

  const selectedHydro = useMemo(() => ({
    floodStage: hasFloodStage ? displayFloodStage : null,
    flowValue: hasFlowGuidance ? flowNow : null,
    flowUnit,
    flowSource,
  }), [hasFloodStage, displayFloodStage, hasFlowGuidance, flowNow, flowUnit, flowSource]);

  // “Official NOAA Forecast” badge when NWPS is used
  const forecastSource = String(data?.forecastSource ?? data?.forecast_source ?? "").toLowerCase();
  const forecastType = useMemo(() => 
    String(data?.forecastType ?? data?.forecast_type ?? "").toLowerCase(),
    [data?.forecastType, data?.forecast_type]
  );
  const isNWPS = useMemo(() => 
    forecastSource.includes("nwps") || forecastType.includes("official"),
    [forecastSource, forecastType]
  );

  // Issuance time (if your API provides it) - memoized
  const issuedAt = useMemo(() =>
    data?.forecastIssuedAt ??
    data?.forecastIssued ??
    data?.issuedAt ??
    data?.issuanceTime ??
    data?.forecastMeta?.issuedAt ??
    null,
    [data?.forecastIssuedAt, data?.forecastIssued, data?.issuedAt, data?.issuanceTime, data?.forecastMeta?.issuedAt]
  );

  // Confidence flags (if your API provides it) - memoized
  const confidence = useMemo(() =>
    data?.forecastConfidence ??
    data?.confidence ??
    data?.forecastMeta?.confidence ??
    null,
    [data?.forecastConfidence, data?.confidence, data?.forecastMeta?.confidence]
  );

  const wasCorrected = useMemo(() => 
    !!(data?.forecastMeta?.corrected),
    [data?.forecastMeta?.corrected]
  );
  const projectionMethod = useMemo(() => 
    data?.forecastMeta?.projectionMethod,
    [data?.forecastMeta?.projectionMethod]
  );

  /* -------------------- RENDER ---------------------- */

  return (
    <div className="min-h-screen flex flex-col bg-background text-white">
      <Header />

      {/* TOP BAR */}
      <section className="shadow-md bg-slate-900/95 backdrop-blur">
        <RiverHazardBar hazardCode={hazardCode} />

        <div className="max-w-6xl mx-auto px-4 py-1.5">
          <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4">
            {/* LEFT: Station selector */}
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 mt-1">
                <label className="text-sm">Station:</label>
                <select
                  value={selected?.id || ""}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    const st = stations.find((s) => s.id === e.target.value);
                    if (!st) return;
                    setSelected(st);
                    setSelectedDam(null); // Clear dam selection when selecting station
                    setWxLoc({ lat: st.lat, lon: st.lon });
                    setMapCenter({ lat: st.lat, lon: st.lon });
                  }}
                  className="px-3 py-1 text-black rounded bg-white"
                >
                  {!selected && <option value="">-- Select Station --</option>}
                  {(favoritesOnly && profile?.favorites?.gauges?.length > 0
                    ? stations.filter((s) => profile.favorites.gauges.includes(s.id))
                    : stations
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {/* Favorite button */}
                <button
                  onClick={() => {
                    if (toggleFavorite && selected?.id) {
                      toggleFavorite('gauges', selected.id);
                    }
                  }}
                  disabled={!selected}
                  className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!selected ? "Select a station first" : (profile?.favorites?.gauges?.includes(selected.id) ? "Remove from favorites" : "Add to favorites")}
                >
                  <span className="text-lg">
                    {selected && profile?.favorites?.gauges?.includes(selected.id) ? "★" : "☆"}
                  </span>
                </button>
                {/* Favorites Only filter */}
                <label className="flex items-center gap-1 text-xs text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={favoritesOnly}
                    onChange={(e) => setFavoritesOnly(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Favorites Only
                </label>
              </div>

              <div className="mt-2">
                <p className="text-sm font-semibold uppercase">
                  {selectedDam ? selectedDam.name : (data?.location ?? selected?.name ?? "Select a station")}
                </p>

                <p className="text-sm">
                  {typeof data?.observed === "number" 
                    ? `${data.observed.toFixed(2)} ft` 
                    : "Loading…"}
                  {data?.time ? ` at ${formatLocal(data.time)}` : ""}
                </p>
                {selectedDam && (
                  <p className="text-xs text-white/70 mt-0.5">
                    Lock & Dam at River Mile {selectedDam.riverMile}
                  </p>
                )}
              </div>
            </div>

            {/* CENTER: Flood stage, river danger, find me info */}
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-white/80">
                Flood Stage: {hasFloodStage ? `${Number(displayFloodStage).toFixed(1)} ft` : "N/A"}
              </p>
              <p className="text-xs text-white/80 mt-0.5" title="Flow guidance from NOAA water.noaa.gov gauge products (National Water Model guidance when published).">
                Flow Guidance: {hasFlowGuidance ? `${Math.round(flowNow).toLocaleString()} ${flowUnit}` : "N/A"}
              </p>
              {hasFlowGuidance && (
                <p className="text-[10px] text-white/60">
                  Source: {flowSource || "NOAA water.noaa.gov/gauges"}
                </p>
              )}
              <RiverLevelIndicator history={data?.history} hazardCode={hazardCode} />
              {findMeInfo && (
                <div className="mt-2 text-xs text-white/70">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span>{findMeInfo.label}</span>
                  </div>
                  {findMeInfo.distance && (
                    <div className="opacity-80 ml-4">{findMeInfo.distance}</div>
                  )}
                </div>
              )}
              {isNWPS && (
                <div className="mt-2 flex flex-col items-center gap-1">
                  <span
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-semibold bg-cyan-600/20 border border-cyan-400/30 text-cyan-200"
                    title={wasCorrected ? "NOAA National Water Prediction Service (NWPS) forecast, bias-corrected to latest observed stage." : "NOAA National Water Prediction Service (NWPS) official hydrograph forecast."}
                  >
                    ✅ {wasCorrected ? "NWPS Forecast (bias-corrected)" : "NWPS Forecast"}
                  </span>

                  {issuedAt && (
                    <span className="text-[10px] text-white/70">
                      Issued: <span className="text-white/90">{formatLocal(issuedAt)}</span>
                    </span>
                  )}

                  {confidence && (
                    <span
                      className="text-[10px] text-white/70 cursor-help"
                      title="Confidence is provided by NOAA/NWPS metadata when available. If missing, NOAA did not publish a confidence flag for this gauge/issuance."
                    >
                      Confidence: <span className="text-white/90">{String(confidence)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: charts */}
            <div className="flex-shrink-0">
              <div className="flex flex-col sm:flex-row gap-3 items-center lg:items-start">
                <Chart
                  data={past7Series}
                  floodStage={data?.floodStage}
                  unit={data?.unit}
                  color="#00ffff"
                  showDayMarks={true}
                  showPointLabels={true}
                  labelColor="#00ffff"
                />
                <div className="flex flex-col items-center">
                  {predictionSeries ? (
                    <Chart
                      data={predictionSeries}
                      floodStage={data?.floodStage}
                      unit={data?.unit}
                      color="#00ffff"
                      showDayMarks={true}
                      showPointLabels={true}
                      labelColor="#00ffff"
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center text-xs italic opacity-80 bg-black/20 rounded border border-white/10"
                      style={{ width: 240, height: 110, minWidth: 240 }}
                    >
                      Forecast unavailable for the next 7 days.
                    </div>
                  )}

                  <p
                    className="text-[10px] mt-1 text-white/60 cursor-help text-center"
                    title={forecastType === "Projected" 
                      ? (projectionMethod === 'regression72h'
                          ? "Regression-based projection using last 72h of river levels with slope damping. NOAA forecasts will be used when available."
                          : "Trend-based projection using recent daily highs. NOAA forecasts will be used when available.")
                      : "Observed data availability varies by gauge. Some NOAA/USGS stations only publish recent data. Charts show the most recent verified observations available."}
                  >
                    {forecastType === "Projected" 
                      ? (projectionMethod === 'regression72h' ? "ℹ Regression projection (NOAA unavailable)" : "ℹ Trend projection (NOAA unavailable)")
                      : "ℹ Observed data availability varies by gauge"}
                  </p>
                </div>
</div>
            </div>
          </div>
        </div>
      </section>

      {/* MAP - Marine Traffic, River Activity, Topography, or Dark Theme based on mapType */}
      {mapType === "marine" ? (
        <iframe src={mapSrc} width="100%" height="500" frameBorder="0" className="border-none" title="Marine Traffic Map" />
      ) : mapType === "topo" ? (
        <OhioRiverActivityMap 
          locks={mapLocks}
          lockActivityById={lockActivityById}
          stations={stations}
          selectedLockId={selectedDam?.id || selected?.id}
          selectedHydro={selectedHydro}
          currentRiverLevel={Number.isFinite(Number(data?.observed)) ? Number(data.observed) : null}
          riverConditionLabel={riverConditionLabel}
          weatherNow={weather}
          userLocation={userLocation}
          onLockSelect={handleMapSelection}
          mapStyle="topo"
        />
      ) : mapType === "dark" ? (
        <OhioRiverActivityMap 
          locks={mapLocks}
          lockActivityById={lockActivityById}
          stations={stations}
          selectedLockId={selectedDam?.id || selected?.id}
          selectedHydro={selectedHydro}
          currentRiverLevel={Number.isFinite(Number(data?.observed)) ? Number(data.observed) : null}
          riverConditionLabel={riverConditionLabel}
          weatherNow={weather}
          userLocation={userLocation}
          onLockSelect={handleMapSelection}
          mapStyle="dark"
        />
      ) : (
        <OhioRiverActivityMap 
          locks={mapLocks}
          lockActivityById={lockActivityById}
          stations={stations}
          selectedLockId={selectedDam?.id || selected?.id}
          selectedHydro={selectedHydro}
          currentRiverLevel={Number.isFinite(Number(data?.observed)) ? Number(data.observed) : null}
          riverConditionLabel={riverConditionLabel}
          weatherNow={weather}
          userLocation={userLocation}
          onLockSelect={handleMapSelection}
        />
      )}

      {/* BOTTOM INFO BAR */}
      <section className="w-full border-t border-white/20 bg-slate-900/95">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 relative">
            <div className="flex flex-col gap-1 relative">
              {/* Map Type Selector Dropdown */}
              <select
                value={mapType}
                onChange={(e) => setMapType(e.target.value)}
                className="text-xs px-2 py-1 bg-slate-700/50 border border-cyan-500/40 rounded text-cyan-200 hover:border-cyan-500 appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%2306b6d4' strokeWidth='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 4px center',
                  backgroundSize: '14px',
                  paddingRight: '20px',
                }}
                title="Switch between map types"
              >
                <option value="lock">🚤 River Activity</option>
                <option value="topo">⛰️ Topography</option>
                <option value="dark">🌙 Dark</option>
                <option value="marine">🗺️ Marine Traffic</option>
              </select>

              {/* Lock Activity Dropdown Toggle */}
              <button
                onClick={() => setShowLockActivityDropdown(!showLockActivityDropdown)}
                className="text-xs px-2 py-1 bg-slate-700/50 border border-cyan-500/40 rounded text-cyan-200 hover:border-cyan-500 transition-colors flex items-center justify-between gap-2 text-left"
                title="Toggle Lock Activity data"
              >
                Lock Activity
                <span className={`transition-transform ${showLockActivityDropdown ? 'rotate-180' : ''}`} style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%2306b6d4' strokeWidth='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundSize: 'contain',
                }}>
                </span>
              </button>

            </div>

            <div className="text-sm">
              {weather && (
                <>
                  <p className="font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                    {userCityState || selectedDam?.name || selected?.name || "Select location"}
                  </p>
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col">
                      <p>🌡 {weather.tempF.toFixed(1)}°F</p>
                      {weather.tempHighF && weather.tempLowF && (
                        <p className="text-xs opacity-75" style={{ marginLeft: '1.25rem' }}>
                          H: {weather.tempHighF.toFixed(0)}° L: {weather.tempLowF.toFixed(0)}°
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <p>💨 {weather.windMph.toFixed(1)} mph</p>
                      <p className="text-xs opacity-75" style={{ marginLeft: '1.25rem' }}>
                        {weather.windGustHighMph.toFixed(1)} mph
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {weather && <WindCompass direction={weather.windDir} degrees={weather.windDeg} />}

          <button
            onClick={locateMe}
            disabled={loadingLocation}
            className={`px-4 py-2 rounded-lg font-semibold shadow flex items-center gap-2 text-sm ${
              userLocation 
                ? 'bg-orange-600 hover:bg-orange-700' 
                : 'bg-cyan-600 hover:bg-cyan-700'
            } ${loadingLocation ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loadingLocation ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
            ) : (
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M4 12h4M16 12h4" />
              </svg>
            )}
            {loadingLocation ? 'Locating...' : (userLocation ? 'Clear Location' : 'Find Me')}
          </button>

          <div className="text-xs text-right">
            <p className="font-semibold mb-1">{weather?.shortForecast || 'Conditions'}</p>
            <p>
              <span style={{ fontSize: '3em', lineHeight: 0.8, verticalAlign: 'middle' }}>{precipIcon}</span>
            </p>
            {precip > 0 && (
              <p className="text-[10px] opacity-70 mt-1">{precip.toFixed(0)}% chance</p>
            )}
          </div>
        </div>

        {/* Lock Activity Dropdown Panel */}
        {showLockActivityDropdown && (
          <div className="max-w-6xl mx-auto px-4 py-3 border-t border-white/10">
            <LockDamMap locksData={mapLocks} lockActivityById={lockActivityById} />
          </div>
        )}

        {/* Air Quality Scale */}
        <div className="max-w-6xl mx-auto px-4 pb-2">
          <AirQualityScale aqi={aqi} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
