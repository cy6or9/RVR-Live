const CACHE_TTL_MS = 5 * 60 * 1000;
const TRAFFIC_CACHE = new Map();

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function fetchCached(cacheKey) {
  const hit = TRAFFIC_CACHE.get(cacheKey);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > CACHE_TTL_MS) {
    TRAFFIC_CACHE.delete(cacheKey);
    return null;
  }
  return hit.value;
}

function setCached(cacheKey, value) {
  TRAFFIC_CACHE.set(cacheKey, {
    timestamp: Date.now(),
    value,
  });
}

async function fetchNOAAStageflow(gaugeId) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(
      `https://api.water.noaa.gov/nwps/v1/gauges/${encodeURIComponent(gaugeId)}/stageflow`,
      {
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "RiverValleyReport/1.0",
        },
      }
    );

    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePoints(block) {
  const rows = Array.isArray(block?.data) ? block.data : [];

  return rows
    .map((row) => {
      const tRaw = row?.validTime || row?.time || row?.dateTime || row?.generatedTime;
      const t = tRaw ? new Date(tRaw) : null;
      const stage = toNumber(row?.primary);
      const flow = toNumber(row?.secondary);
      if (!t || Number.isNaN(t.getTime()) || stage == null) return null;

      return {
        t: t.toISOString(),
        ts: t.getTime(),
        stage,
        flow,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

function estimateCongestion({
  stage,
  flow,
  trendPerHour,
  status,
  action,
  minor,
  moderate,
  major,
}) {
  let congestion = 20;

  if (major != null && stage >= major) congestion = 90;
  else if (moderate != null && stage >= moderate) congestion = 76;
  else if (minor != null && stage >= minor) congestion = 60;
  else if (action != null && stage >= action) congestion = 42;
  else if (action != null && action > 0) congestion = clamp((stage / action) * 34, 10, 40);

  if (flow != null) {
    congestion += clamp(flow / 18, -4, 10);
  }

  if (trendPerHour >= 0.12) congestion += 8;
  else if (trendPerHour >= 0.05) congestion += 4;
  else if (trendPerHour <= -0.12) congestion -= 6;

  const s = String(status || "").toLowerCase();
  if (s.includes("major")) congestion = Math.max(congestion, 88);
  else if (s.includes("moderate")) congestion = Math.max(congestion, 74);
  else if (s.includes("minor") || s.includes("flood")) congestion = Math.max(congestion, 58);
  else if (s.includes("action") || s.includes("bankfull")) congestion = Math.max(congestion, 42);

  return clamp(Math.round(congestion), 5, 95);
}

function buildGaugeTraffic(json, opts) {
  const observed = parsePoints(json?.observed);
  const forecast = parsePoints(json?.forecast);
  const series = observed.length ? observed : forecast;

  if (!series.length) return null;

  const latest = series[series.length - 1];
  const lookback = series[Math.max(0, series.length - 13)];

  const deltaHours = Math.max(0.25, (latest.ts - lookback.ts) / 3600000);
  const trendPerHour = (latest.stage - lookback.stage) / deltaHours;

  const congestion = estimateCongestion({
    stage: latest.stage,
    flow: latest.flow,
    trendPerHour,
    status: opts.status,
    action: opts.action,
    minor: opts.minor,
    moderate: opts.moderate,
    major: opts.major,
  });

  const queueLength = clamp(Math.round(congestion / 18 + (congestion > 72 ? 1 : 0)), 0, 8);
  const averageWaitTime = clamp(Math.round(6 + congestion * 0.48), 4, 75);
  const flowLift = latest.flow != null ? clamp(latest.flow / 30, 0, 6) : 0;
  const towsLast24h = clamp(Math.round(34 - congestion * 0.28 + flowLift), 3, 42);

  const direction = trendPerHour >= 0 ? "upstream" : "downstream";
  const inferredPassageAgoMin = clamp(Math.round(averageWaitTime * 0.35 + queueLength * 4), 5, 90);
  const lastTowPassage = new Date(Date.now() - inferredPassageAgoMin * 60000).toISOString();

  return {
    queueLength,
    congestion,
    averageWaitTime,
    towsLast24h,
    direction,
    lastTowPassage,
    source: "noaa-arcgis-gauge-derived",
    realTimeData: true,
    gauge: {
      id: opts.gaugeId,
      stage: latest.stage,
      flow: latest.flow,
      stageUnits: json?.observed?.primaryUnits || json?.forecast?.primaryUnits || "ft",
      flowUnits: json?.observed?.secondaryUnits || json?.forecast?.secondaryUnits || "kcfs",
      observedAt: latest.t,
      trendPerHour: Number(trendPerHour.toFixed(3)),
      status: opts.status || "unknown",
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const gaugeId = String(req.query.gaugeId || "").trim().toUpperCase();
  if (!gaugeId) {
    return res.status(400).json({ available: false, reason: "missing_gauge_id" });
  }

  const action = toNumber(req.query.action);
  const minor = toNumber(req.query.minor);
  const moderate = toNumber(req.query.moderate);
  const major = toNumber(req.query.major);
  const status = req.query.status ? String(req.query.status) : null;

  const cacheKey = [gaugeId, action, minor, moderate, major, status || ""].join("|");
  const cached = fetchCached(cacheKey);
  if (cached) {
    return res.status(200).json({
      available: true,
      cached: true,
      data: cached,
    });
  }

  const stageflow = await fetchNOAAStageflow(gaugeId);
  if (!stageflow) {
    return res.status(200).json({
      available: false,
      reason: "gauge_fetch_failed",
    });
  }

  const derived = buildGaugeTraffic(stageflow, {
    gaugeId,
    action,
    minor,
    moderate,
    major,
    status,
  });

  if (!derived) {
    return res.status(200).json({
      available: false,
      reason: "gauge_data_unavailable",
    });
  }

  setCached(cacheKey, derived);

  return res.status(200).json({
    available: true,
    cached: false,
    data: derived,
  });
}
