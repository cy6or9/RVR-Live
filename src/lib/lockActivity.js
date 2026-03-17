import { computeDangerScore, getDangerVisuals } from './dangerScore';

function hexToRgba(hex, alpha) {
  const clean = String(hex || "#9ca3af").replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function estimateWaitRangeFromDanger(dangerScore, trendPerHour = null) {
  if (!Number.isFinite(dangerScore)) return null;

  // Base ranges in minutes by danger band.
  let min = 5;
  let max = 15;
  if (dangerScore >= 80) {
    min = 150;
    max = 300;
  } else if (dangerScore >= 60) {
    min = 75;
    max = 150;
  } else if (dangerScore >= 40) {
    min = 35;
    max = 75;
  } else if (dangerScore >= 20) {
    min = 15;
    max = 35;
  }

  // Rising water tends to increase delay risk.
  if (Number.isFinite(trendPerHour) && trendPerHour > 0.08) {
    min = Math.round(min * 1.1);
    max = Math.round(max * 1.2);
  }

  return {
    minMinutes: min,
    maxMinutes: max,
    midpointMinutes: Math.round((min + max) / 2),
    label: `${min}-${max} min`,
  };
}

/**
 * getLockActivityVisuals — backward-compatible helper now backed by the
 * 5-level danger scale from dangerScore.js.
 * Accepts a 0-100 score (danger or legacy congestion) and returns visual props.
 */
export function getLockActivityVisuals(score) {
  if (!Number.isFinite(score)) {
    return getDangerVisuals(null);
  }
  let level, color, colorKey;
  if      (score < 20) { level = 'Low';      color = '#06b6d4'; colorKey = 'cyan';   }
  else if (score < 40) { level = 'Guarded';  color = '#10b981'; colorKey = 'green';  }
  else if (score < 60) { level = 'Elevated'; color = '#f59e0b'; colorKey = 'amber';  }
  else if (score < 80) { level = 'High';     color = '#ef4444'; colorKey = 'red';    }
  else                 { level = 'Severe';   color = '#7c3aed'; colorKey = 'purple'; }
  const visuals = getDangerVisuals({ level, color, colorKey });
  // Keep the legacy congestionLabel field for any remaining callers
  return { ...visuals, congestionLabel: level };
}

// Re-export so components can import from a single location
export { computeDangerScore, getDangerVisuals } from './dangerScore';

/**
 * normalizeLockActivity
 *
 * @param {object} lock    Lock definition (id, name, floodStages, …)
 * @param {object|null} metrics  Raw gauge/traffic metrics from API
 * @param {object|null} env      Optional weather context
 *   { windMph, windDeg, shortForecast, precip }
 */
export function normalizeLockActivity(lock, metrics = null, env = null) {
  // Compute danger score from all available inputs
  const danger = computeDangerScore({
    stage:        metrics?.gauge?.stage        ?? metrics?.gaugeStage       ?? null,
    flow:         metrics?.gauge?.flow         ?? metrics?.gaugeFlow        ?? null,
    trendPerHour: metrics?.gauge?.trendPerHour                              ?? null,
    floodStages:  lock?.floodStages                                         ?? null,
    windMph:      env?.windMph                                              ?? null,
    windDeg:      env?.windDeg                                              ?? null,
    shortForecast:env?.shortForecast                                        ?? null,
    precip:       env?.precip                                               ?? null,
  });

  const visuals = getDangerVisuals(danger);
  const estimatedWait = estimateWaitRangeFromDanger(
    danger?.score,
    metrics?.gauge?.trendPerHour ?? null
  );

  const derivedFromHydrology = !!(
    metrics?.derivedFromHydrology ||
    metrics?.activityMode === "hydrology_estimate" ||
    metrics?.gaugeDerived
  );

  const hasVerifiedTrafficMetrics = !!metrics && !derivedFromHydrology && [
    metrics?.queueLength,
    metrics?.averageWaitTime,
    metrics?.lastTowPassage,
    metrics?.towsLast24h,
    metrics?.direction,
  ].some((value) => value !== null && value !== undefined);

  let sourceTag = "N/A";
  if (metrics) {
    if (derivedFromHydrology) sourceTag = "EST";
    else if (hasVerifiedTrafficMetrics && metrics.realTimeData) sourceTag = "LIVE";
    else sourceTag = "EST";
  }

  return {
    lockId:   lock.id,
    lockName: lock.name,

    // --- Danger model fields ---
    dangerScore:      danger.score,
    dangerLevel:      danger.level,
    dangerColor:      visuals.markerColor,
    dangerColorKey:   visuals.colorKey,
    dangerConfidence: danger.confidence,
    dangerFactors:    danger.factors,

    // --- Backward-compat aliases (congestion language kept for existing callers) ---
    congestion:      danger.score,
    congestionLabel: danger.level,

    // --- Visual properties ---
    colorKey:      visuals.colorKey,
    markerColor:   visuals.markerColor,
    cardClassName: visuals.cardClassName,
    badgeClassName:visuals.badgeClassName,
    cardStyle: {
      backgroundColor: hexToRgba(visuals.markerColor, visuals.colorKey === "gray" ? 0.28 : 0.34),
      borderColor:     hexToRgba(visuals.markerColor, 0.9),
    },
    badgeStyle: {
      backgroundColor: hexToRgba(visuals.markerColor, 0.7),
      color: "#ffffff",
    },

    // --- Verified traffic (only when real source provides them) ---
    queueCount:  hasVerifiedTrafficMetrics ? (metrics?.queueLength     ?? null) : null,
    waitMinutes: hasVerifiedTrafficMetrics ? (metrics?.averageWaitTime ?? null) : null,
    lastPassage: hasVerifiedTrafficMetrics ? (metrics?.lastTowPassage  ?? null) : null,
    passages24h: hasVerifiedTrafficMetrics ? (metrics?.towsLast24h     ?? null) : null,
    direction:   hasVerifiedTrafficMetrics ? (metrics?.direction       ?? null) : null,

    // --- Modeled wait-time estimate (for planning only, not measured queue telemetry) ---
    estimatedWaitMinutes: hasVerifiedTrafficMetrics ? null : (estimatedWait?.midpointMinutes ?? null),
    estimatedWaitRange: hasVerifiedTrafficMetrics ? null : (estimatedWait?.label ?? null),
    estimatedWaitModel: hasVerifiedTrafficMetrics ? null : (estimatedWait ? "danger_model_v1" : null),

    // --- Source metadata ---
    sourceTag,
    source:                   metrics?.source ?? "unavailable",
    sourceAvailable:          !!metrics,
    realTimeData:             !!metrics?.realTimeData,
    gaugeDerived:             derivedFromHydrology,
    derivedFromHydrology,
    activityMode:             metrics?.activityMode ?? (derivedFromHydrology ? "hydrology_estimate" : "verified_traffic"),
    hasVerifiedTrafficMetrics,

    // --- Gauge reading ---
    gaugeId:         lock.arcgisGaugeId ?? lock.floodStages?.gaugeId ?? null,
    gaugeStage:      metrics?.gauge?.stage       ?? metrics?.gaugeStage      ?? null,
    gaugeFlow:       metrics?.gauge?.flow        ?? metrics?.gaugeFlow       ?? null,
    gaugeStageUnits: metrics?.gauge?.stageUnits  || metrics?.gaugeStageUnits || "ft",
    gaugeFlowUnits:  metrics?.gauge?.flowUnits   || metrics?.gaugeFlowUnits  || "kcfs",
    gaugeTrend:      metrics?.gauge?.trendPerHour ?? null,
    statusText:      metrics?.gauge?.status || lock.arcgisStatus || null,
  };
}