/**
 * dangerScore.js
 *
 * Centralized river danger scoring helper — reusable across map markers,
 * lock cards, popups, and legend labels.
 *
 * Weighted formula (max 100 pts):
 *   Stage vs flood thresholds  35 pts
 *   Flow / discharge           20 pts
 *   Stage trend (rising water) 10 pts
 *   Wind speed                 15 pts
 *   Weather severity           15 pts
 *   Visibility (optional)       5 pts
 *
 * Danger levels: Low · Guarded · Elevated · High · Severe · Unknown
 */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Sub-score components
// ---------------------------------------------------------------------------

/** Stage sub-score (0–35).  Uses NOAA flood-stage thresholds when available. */
function stageSubScore(stage, floodStages) {
  if (stage == null || !Number.isFinite(stage)) return { score: 0, hasData: false };
  const { action, minor, moderate, major } = floodStages || {};

  let s = 0;
  if (major != null && stage >= major)          s = 35;
  else if (moderate != null && stage >= moderate) s = 28;
  else if (minor != null && stage >= minor)       s = 21;
  else if (action != null && stage >= action)     s = 14;
  else if (action != null && action > 0)          s = clamp((stage / action) * 10, 0, 10);
  else                                             s = 5; // no thresholds — assume some baseline risk

  return { score: clamp(s, 0, 35), hasData: true };
}

/**
 * Flow sub-score (0–20).
 * Flow expected in kcfs (thousands of cubic feet per second).
 * Scale: 25 kcfs → 10 pts; 50+ kcfs → 20 pts (max).
 */
function flowSubScore(flow) {
  if (flow == null || !Number.isFinite(flow)) return { score: 0, hasData: false };
  const s = clamp(flow / 50, 0, 1) * 20;
  return { score: s, hasData: true };
}

/**
 * Stage-trend sub-score (0–10).
 * trendPerHour in ft/hr; only rising water adds risk.
 */
function trendSubScore(trendPerHour) {
  if (trendPerHour == null || !Number.isFinite(trendPerHour)) return { score: 0, hasData: false };
  if (trendPerHour <= 0) return { score: 0, hasData: true };
  // 0.40 ft/hr rapid rise → max 10 pts
  const s = clamp(trendPerHour * 25, 0, 10);
  return { score: s, hasData: true };
}

/** Wind sub-score (0–15). windMph: sustained wind speed. */
function windSubScore(windMph) {
  if (windMph == null || !Number.isFinite(windMph)) return { score: 0, hasData: false };
  let s = 0;
  if      (windMph >= 30) s = 15;
  else if (windMph >= 25) s = 12;
  else if (windMph >= 20) s = 9;
  else if (windMph >= 15) s = 6;
  else if (windMph >= 10) s = 3;
  else                    s = clamp((windMph / 10) * 3, 0, 3);
  return { score: s, hasData: true };
}

/** Weather severity sub-score (0–15) from NWS shortForecast text and precip probability. */
function weatherSubScore(shortForecast, precip) {
  const fore = String(shortForecast || '').toLowerCase();
  let s = 0;

  if (fore.includes('tornado') || fore.includes('severe thunderstorm')) s = 15;
  else if (fore.includes('thunder') || fore.includes('tstorm'))         s = 13;
  else if (fore.includes('heavy rain') || fore.includes('heavy snow') || fore.includes('blizzard')) s = 11;
  else if (fore.includes('rain') || fore.includes('snow') || fore.includes('sleet') || fore.includes('freezing')) s = 8;
  else if (fore.includes('fog') || fore.includes('mist') || fore.includes('smoke')) s = 7;
  else if (fore.includes('shower'))                                   s = 5;
  else if (fore.includes('overcast') || fore.includes('cloudy'))      s = 2;

  // Precipitation-probability boost (caps at 8 pts on its own)
  const p = Number(precip);
  if (Number.isFinite(p) && p > 0) s = Math.max(s, clamp((p / 100) * 8, 0, 8));

  const hasData = !!(shortForecast || (Number.isFinite(Number(precip)) && Number(precip) > 0));
  return { score: clamp(s, 0, 15), hasData };
}

/**
 * Visibility sub-score (0–5).
 * Uses explicit visibilityMiles when available; infers from forecast text otherwise.
 */
function visibilitySubScore(visibilityMiles, shortForecast) {
  if (visibilityMiles != null && Number.isFinite(visibilityMiles)) {
    let s = 0;
    if      (visibilityMiles < 0.25) s = 5;
    else if (visibilityMiles < 1)    s = 4;
    else if (visibilityMiles < 3)    s = 2;
    return { score: s, hasData: true };
  }
  // Infer from forecast text
  const fore = String(shortForecast || '').toLowerCase();
  if (fore.includes('dense fog') || fore.includes('freezing fog')) return { score: 5, hasData: true };
  if (fore.includes('fog') || fore.includes('mist') || fore.includes('smoke')) return { score: 3, hasData: true };
  return { score: 0, hasData: false };
}

// ---------------------------------------------------------------------------
// Human-readable factor labels
// ---------------------------------------------------------------------------

function stageFactorLabel(score) {
  if (score >= 28) return 'Major flooding';
  if (score >= 21) return 'Moderate flooding';
  if (score >= 14) return 'Minor flooding';
  if (score >= 10) return 'Near action stage';
  if (score > 0)   return 'Stage elevated';
  return null;
}

function trendFactorLabel(score, trendPerHour) {
  if (score <= 0) return null;
  if (score >= 8) return 'Rapid rise';
  if (score >= 5) return 'Rising water';
  return `Rising (${Number(trendPerHour).toFixed(2)} ft/hr)`;
}

function windFactorLabel(score, windMph) {
  if (score <= 0) return null;
  const mph = Math.round(windMph);
  if (score >= 12) return `High winds (${mph} mph)`;
  if (score >= 6)  return `Moderate winds (${mph} mph)`;
  return `Winds ${mph} mph`;
}

function weatherFactorLabel(shortForecast, score) {
  if (score <= 0) return null;
  const fore = String(shortForecast || '').toLowerCase();
  if (fore.includes('tornado'))        return 'Tornado warning';
  if (fore.includes('thunder'))        return 'Thunderstorms';
  if (fore.includes('heavy rain'))     return 'Heavy rain';
  if (fore.includes('heavy snow'))     return 'Heavy snow';
  if (fore.includes('rain'))           return 'Rain';
  if (fore.includes('snow'))           return 'Snow';
  if (fore.includes('sleet') || fore.includes('freezing')) return 'Freezing precip';
  if (fore.includes('fog'))            return 'Fog';
  if (fore.includes('shower'))         return 'Showers';
  if (fore.includes('cloud') || fore.includes('overcast')) return 'Overcast';
  // Fallback: first 20 chars of actual forecast text
  if (shortForecast) return String(shortForecast).slice(0, 20);
  return 'Adverse weather';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute a composite river danger score (0–100).
 *
 * @param {object} inputs
 *   stage           number   River stage in ft
 *   flow            number   Discharge in kcfs
 *   trendPerHour    number   Stage change ft/hr (positive = rising)
 *   floodStages     object   { action, minor, moderate, major } all in ft
 *   windMph         number   Sustained wind speed mph
 *   windDeg         number   Meteorological wind direction degrees (optional)
 *   shortForecast   string   NWS short forecast text
 *   precip          number   Precipitation probability 0–100
 *   visibilityMiles number   Visibility in miles (optional)
 *
 * @returns {object}
 *   score        number|null   0–100 composite score, null if no data
 *   level        string        'Low' | 'Guarded' | 'Elevated' | 'High' | 'Severe' | 'Unknown'
 *   color        string        Hex color for the level
 *   colorKey     string        Tailwind-friendly key: cyan | green | amber | red | purple | gray
 *   confidence   string        'High' | 'Medium' | 'Low' | 'Unknown'
 *   factors      string[]      Human-readable contributing factor labels
 *   inputCount   number        How many sub-scores had real data
 */
export function computeDangerScore(inputs = {}) {
  const {
    stage, flow, trendPerHour, floodStages,
    windMph, shortForecast, precip, visibilityMiles,
  } = inputs;

  const s  = stageSubScore(stage, floodStages);
  const f  = flowSubScore(flow);
  const t  = trendSubScore(trendPerHour);
  const w  = windSubScore(windMph);
  const wx = weatherSubScore(shortForecast, precip);
  const v  = visibilitySubScore(visibilityMiles, shortForecast);

  const inputCount = [s, f, t, w, wx, v].filter((x) => x.hasData).length;

  // Cannot score with zero data
  if (inputCount === 0) {
    return {
      score: null,
      level: 'Unknown',
      color: '#9ca3af',
      colorKey: 'gray',
      confidence: 'Unknown',
      factors: [],
      inputCount: 0,
    };
  }

  const rawTotal = s.score + f.score + t.score + w.score + wx.score + v.score;
  const score    = clamp(Math.round(rawTotal), 0, 100);

  // Confidence based on how many sub-scores had real input
  const confidence = inputCount >= 4 ? 'High' : inputCount >= 2 ? 'Medium' : 'Low';

  // Danger level classification
  let level, color, colorKey;
  if      (score < 20) { level = 'Low';      color = '#06b6d4'; colorKey = 'cyan';   }
  else if (score < 40) { level = 'Guarded';  color = '#10b981'; colorKey = 'green';  }
  else if (score < 60) { level = 'Elevated'; color = '#f59e0b'; colorKey = 'amber';  }
  else if (score < 80) { level = 'High';     color = '#ef4444'; colorKey = 'red';    }
  else                 { level = 'Severe';   color = '#7c3aed'; colorKey = 'purple'; }

  // Build factor labels (only non-zero contributions)
  const factors = [];
  if (s.hasData  && s.score  > 0 ) { const lbl = stageFactorLabel(s.score);                   if (lbl) factors.push(lbl); }
  if (t.hasData  && t.score  > 0 ) { const lbl = trendFactorLabel(t.score, trendPerHour);      if (lbl) factors.push(lbl); }
  if (w.hasData  && w.score  > 0 ) { const lbl = windFactorLabel(w.score, windMph);             if (lbl) factors.push(lbl); }
  if (wx.hasData && wx.score > 0 ) { const lbl = weatherFactorLabel(shortForecast, wx.score);  if (lbl) factors.push(lbl); }
  if (v.hasData  && v.score  > 0 ) factors.push('Reduced visibility');

  return { score, level, color, colorKey, confidence, factors, inputCount };
}

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

const DANGER_CLASS_MAP = {
  cyan:   { card: 'bg-cyan-900/60 border-cyan-400/70',       badge: 'bg-cyan-500/70'    },
  green:  { card: 'bg-emerald-900/60 border-emerald-400/70', badge: 'bg-emerald-500/70' },
  lime:   { card: 'bg-lime-900/60 border-lime-400/70',       badge: 'bg-lime-500/70'    },
  amber:  { card: 'bg-amber-900/60 border-amber-400/70',     badge: 'bg-amber-500/70'   },
  red:    { card: 'bg-rose-900/65 border-rose-400/75',       badge: 'bg-rose-500/75'    },
  purple: { card: 'bg-violet-900/65 border-violet-400/75',   badge: 'bg-violet-500/75'  },
  gray:   { card: 'bg-slate-800/70 border-slate-500/70',     badge: 'bg-slate-600/60'   },
};

/**
 * Convert a danger result (from computeDangerScore) into visual properties
 * suitable for map markers, cards, and badges.
 *
 * Drop-in replacement for the old getLockActivityVisuals(congestion).
 */
export function getDangerVisuals(dangerResult) {
  const level    = dangerResult?.level;
  const color    = dangerResult?.color    || '#9ca3af';
  const colorKey = dangerResult?.colorKey || 'gray';

  if (!level || level === 'Unknown') {
    const c = DANGER_CLASS_MAP.gray;
    return { colorKey: 'gray', dangerLabel: 'Unknown', markerColor: '#9ca3af', cardClassName: c.card, badgeClassName: c.badge };
  }

  const c = DANGER_CLASS_MAP[colorKey] || DANGER_CLASS_MAP.gray;
  return { colorKey, dangerLabel: level, markerColor: color, cardClassName: c.card, badgeClassName: c.badge };
}

/** Exported level definitions for legend rendering. */
export const DANGER_LEVELS = [
  { level: 'Low',      color: '#06b6d4', colorKey: 'cyan',   description: 'Normal conditions'               },
  { level: 'Guarded',  color: '#10b981', colorKey: 'green',  description: 'Monitor conditions'              },
  { level: 'Elevated', color: '#f59e0b', colorKey: 'amber',  description: 'Use caution on the water'        },
  { level: 'High',     color: '#ef4444', colorKey: 'red',    description: 'High risk — avoid if possible'   },
  { level: 'Severe',   color: '#7c3aed', colorKey: 'purple', description: 'Severe — do not operate on water'},
  { level: 'Unknown',  color: '#9ca3af', colorKey: 'gray',   description: 'Insufficient data'               },
];
