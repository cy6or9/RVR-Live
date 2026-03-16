export function getLockActivityVisuals(congestion) {
  if (!Number.isFinite(congestion)) {
    return {
      colorKey: "gray",
      congestionLabel: "Unavailable",
      markerColor: "#9ca3af",
      cardClassName: "bg-slate-800/70 border-slate-500/70",
      badgeClassName: "bg-slate-600/60",
    };
  }

  if (congestion < 30) {
    return {
      colorKey: "green",
      congestionLabel: "Light",
      markerColor: "#10b981",
      cardClassName: "bg-emerald-900/60 border-emerald-400/70",
      badgeClassName: "bg-emerald-500/70",
    };
  }

  if (congestion < 70) {
    return {
      colorKey: "yellow",
      congestionLabel: "Moderate",
      markerColor: "#f59e0b",
      cardClassName: "bg-amber-900/60 border-amber-400/70",
      badgeClassName: "bg-amber-500/70",
    };
  }

  return {
    colorKey: "red",
    congestionLabel: "Heavy",
    markerColor: "#ef4444",
    cardClassName: "bg-rose-900/65 border-rose-400/75",
    badgeClassName: "bg-rose-500/75",
  };
}

  function hexToRgba(hex, alpha) {
    const clean = String(hex || "#9ca3af").replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

export function normalizeLockActivity(lock, metrics = null) {
  const congestion = Number.isFinite(Number(metrics?.congestion)) ? Number(metrics.congestion) : null;
  const visuals = getLockActivityVisuals(congestion);

  let sourceTag = "N/A";
  if (metrics) {
    if (metrics.gaugeDerived) sourceTag = "ARC";
    else if (metrics.realTimeData) sourceTag = "LIVE";
    else sourceTag = "EST";
  }

  return {
    lockId: lock.id,
    lockName: lock.name,
    congestion,
    congestionLevel: visuals.colorKey,
    congestionLabel: visuals.congestionLabel,
    colorKey: visuals.colorKey,
    markerColor: visuals.markerColor,
    cardClassName: visuals.cardClassName,
    badgeClassName: visuals.badgeClassName,
      cardStyle: {
        backgroundColor: hexToRgba(visuals.markerColor, visuals.colorKey === "gray" ? 0.28 : 0.34),
        borderColor: hexToRgba(visuals.markerColor, 0.9),
      },
      badgeStyle: {
        backgroundColor: hexToRgba(visuals.markerColor, 0.7),
        color: "#ffffff",
      },
    queueCount: metrics?.queueLength ?? null,
    waitMinutes: metrics?.averageWaitTime ?? null,
    lastPassage: metrics?.lastTowPassage ?? null,
    passages24h: metrics?.towsLast24h ?? null,
    direction: metrics?.direction ?? "unknown",
    sourceTag,
    source: metrics?.source ?? "unavailable",
    sourceAvailable: !!metrics,
    realTimeData: !!metrics?.realTimeData,
    gaugeDerived: !!metrics?.gaugeDerived,
    gaugeId: lock.arcgisGaugeId ?? lock.floodStages?.gaugeId ?? null,
    gaugeStage: metrics?.gauge?.stage ?? metrics?.gaugeStage ?? null,
    gaugeFlow: metrics?.gauge?.flow ?? metrics?.gaugeFlow ?? null,
    gaugeStageUnits: metrics?.gauge?.stageUnits || metrics?.gaugeStageUnits || "ft",
    gaugeFlowUnits: metrics?.gauge?.flowUnits || metrics?.gaugeFlowUnits || "kcfs",
    statusText: metrics?.gauge?.status || lock.arcgisStatus || null,
  };
}