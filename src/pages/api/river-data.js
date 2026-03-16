/**
 * River Data API (Ohio River) — NOAA NWPS + synthetic forecasts
 *
 * Data hierarchy for predicted river levels:
 * 1. NOAA NWPS Hydrograph (official forecasts) - preferred when available
 * 2. Trend-based synthetic projection - fallback when NOAA unavailable
 *
 * NOAA endpoint notes:
 * - Primary: water.weather.gov/ahps2/hydrograph_to_xml.php (most reliable)
 * - Fallback: water.noaa.gov, api.water.noaa.gov, service endpoints
 * - Dev environment: May experience "fetch failed" due to network isolation
 * - Production: Full NOAA data access will be available
 *
 * When NOAA data unavailable:
 * - Calculates trend from last 3-7 days of observed history
 * - Projects forward clamped to ±0.5 ft/day to prevent wild swings
 * - Marked as "Projected" with "Trend" source in API response
 *
 * Goals:
 * - Observed level + recent history: USGS (always available)
 * - Official forecast: NOAA AHPS/NWPS hydrograph JSON
 * - Fallback forecast: Trend projection from recent history
 * - Past chart: show 7 days of DAILY-HIGH points
 * - Forecast chart: show up to 7 days of predicted points
 * - Provide metadata: issuance time, confidence, coverage
 */

const CHICAGO_TZ = "America/Chicago";

/* ----------------------------- small utils ----------------------------- */

function isLikelyAhpsId(v) {
  return typeof v === "string" && /^[A-Za-z0-9]{4,7}$/.test(v) && !/^\d+$/.test(v);
}

function safeISO(t) {
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function chicagoDayKey(isoLike) {
  const d = new Date(isoLike);
  if (isNaN(d.getTime())) return null;

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

function toNoonChicagoISO(dayKey) {
  // 18:00Z is ~12:00 CST / 13:00 CDT
  return `${dayKey}T18:00:00Z`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

/* ----------------------------- fetching ----------------------------- */

async function fetchJSON(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {

    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "rivervalleyreport/1.0 (+https://rivervalleyreport.com)",
      },
    });

    if (!res.ok) {

      return null;
    }
    const json = await res.json().catch((e) => {

      return null;
    });
    if (json && typeof json === "object") {

      return json;
    } else {

      return null;
    }
  } catch (err) {

    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchAhpsHydrographJSON(ahpsId) {
  // Prioritize NOAA's official National Water Prediction Service (NWPS) endpoints
  // NWPS is the authoritative forecast service for river conditions.

  // Attempt 0: Official NWPS stage+flow endpoint (preferred)
  // This includes forecast.data with primary(stage) and secondary(flow).
  let url = `https://api.water.noaa.gov/nwps/v1/gauges/${encodeURIComponent(ahpsId)}/stageflow`;

  let result = await fetchJSON(url, { timeoutMs: 14000 });
  if (result && typeof result === "object" && Object.keys(result).length > 0) {

    return result;
  }
  
  // Attempt 1: Official NWPS API (National Water Center)
  // This is the primary source for NWPS forecast data
  url = `https://api.water.noaa.gov/nwps/v1/gauges/${encodeURIComponent(ahpsId)}/hydrograph`;

  result = await fetchJSON(url, { timeoutMs: 14000 });
  if (result && typeof result === "object" && Object.keys(result).length > 0) {

    return result;
  }

  // Attempt 2: AHPS hydrograph XML endpoint (JSON output)
  // This is the traditional NOAA AHPS endpoint, contains both observed and forecast
  url = `https://water.weather.gov/ahps2/hydrograph_to_xml.php?gage=${encodeURIComponent(
    ahpsId
  )}&output=json`;

  result = await fetchJSON(url, { timeoutMs: 14000 });
  if (result && typeof result === "object" && Object.keys(result).length > 0) {

    return result;
  }

  // Attempt 3: Alternative water.noaa.gov domain
  url = `https://water.noaa.gov/ahps2/hydrograph_to_xml.php?gage=${encodeURIComponent(
    ahpsId
  )}&output=json`;

  result = await fetchJSON(url, { timeoutMs: 14000 });
  if (result && typeof result === "object" && Object.keys(result).length > 0) {

    return result;
  }

  // Attempt 4: AHPS REST/service endpoint (fallback)
  url = `https://water.weather.gov/ahps2/service.php?location=${encodeURIComponent(ahpsId)}&output=json`;

  result = await fetchJSON(url, { timeoutMs: 14000 });
  if (result && typeof result === "object" && Object.keys(result).length > 0) {

    return result;
  }

  return null;
}

/* ----------------------------- NOAA parsing ----------------------------- */

function extractAhpsFloodStage(json) {
  const candidates = [
    json?.floodStage,
    json?.flood_stage,
    json?.flood?.stage,
    json?.flood?.flood_stage,
    json?.flood?.floodStage,
    json?.flood?.levels?.flood,
    json?.flood?.levels?.flood_stage,
    json?.stages?.flood,
    json?.stage?.flood,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const strCandidates = [
    json?.flood?.text,
    json?.flood?.description,
    json?.flood?.statement,
    json?.flood?.floodStageText,
  ].filter(Boolean);

  for (const s of strCandidates) {
    const m = String(s).match(/flood\s*stage\s*(is|:)?\s*([0-9]+(\.[0-9]+)?)/i);
    if (m) {
      const n = Number(m[2]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return null;
}

function extractNoaaIssuanceTime(json) {
  // Common direct keys first
  const candidates = [
    json?.issued,
    json?.issueTime,
    json?.issuanceTime,
    json?.forecastIssued,
    json?.forecastIssuanceTime,
    json?.forecast?.issued,
    json?.forecast?.issuedTime,
    json?.forecast?.issueTime,
    json?.forecast?.issuanceTime,
    json?.metadata?.issued,
    json?.metadata?.issueTime,
    json?.meta?.issued,
    json?.meta?.issueTime,
    json?.header?.issued,
    json?.header?.issueTime,
    json?.data?.issued,
    json?.data?.issueTime,
  ];

  for (const c of candidates) {
    const iso = c ? safeISO(c) : null;
    if (iso) return iso;
  }

  // Bounded scan for an issuance-like field
  const found = findLikelyIssuanceDeep(json);
  return found ? safeISO(found) : null;
}

function extractStageAndFlowFromStageflow(json) {
  const rows = Array.isArray(json?.forecast?.data) ? json.forecast.data : null;
  if (!rows || rows.length === 0) {
    return {
      stagePoints: [],
      flowPoints: [],
      flowUnit: null,
      issuanceTime: safeISO(json?.forecast?.issuedTime || json?.forecast?.issueTime || json?.observed?.issuedTime),
      source: null,
    };
  }

  const stagePoints = [];
  const flowPoints = [];

  for (const row of rows) {
    const t = parseTimeAny(row?.validTime || row?.time || row?.dateTime);
    if (!t) continue;

    const stage = parseValueAny(row?.primary);
    if (stage != null && stage > -9000) {
      stagePoints.push({ t, v: stage });
    }

    const flow = parseValueAny(row?.secondary);
    if (flow != null && flow > -9000) {
      flowPoints.push({ t, v: flow });
    }
  }

  return {
    stagePoints: dedupeAndSort(stagePoints),
    flowPoints: dedupeAndSort(flowPoints),
    flowUnit: json?.forecast?.secondaryUnits || json?.observed?.secondaryUnits || null,
    issuanceTime: safeISO(json?.forecast?.issuedTime || json?.forecast?.issueTime || json?.observed?.issuedTime),
    source: Array.isArray(rows) && rows.length ? "NWPS stageflow" : null,
  };
}

function findLikelyIssuanceDeep(root) {
  const queue = [{ node: root, depth: 0 }];
  const seen = new Set();
  const MAX_DEPTH = 7;
  const MAX_NODES = 1400;

  let nodes = 0;

  while (queue.length && nodes < MAX_NODES) {
    const { node, depth } = queue.shift();
    nodes++;

    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    for (const [k, v] of Object.entries(node)) {
      const lk = String(k).toLowerCase();

      if (
        lk === "issued" ||
        lk === "issuance" ||
        lk === "issuancetime" ||
        lk === "issuetime" ||
        lk === "issue_time" ||
        lk === "issue" ||
        lk === "forecastissued" ||
        lk === "forecastissuancetime" ||
        lk === "forecast_issue_time"
      ) {
        if (typeof v === "string" && safeISO(v)) return v;
      }

      if (depth < MAX_DEPTH && v && typeof v === "object") {
        queue.push({ node: v, depth: depth + 1 });
      }
    }
  }

  return null;
}

/**
 * NOAA hydrograph JSON formats vary a LOT.
 *
 * We do two things:
 * 1) Try obvious forecast paths (fast path)
 * 2) Deep-scan to find the best "future-looking stage timeseries" candidate,
 *    supporting:
 *     - arrays of objects: [{validTime, value}, ...]
 *     - arrays of pairs:   [[time, value], ...]
 *     - parallel arrays:   { x:[...], y:[...] } or { time:[...], value:[...] }
 *     - nested objects containing any of the above
 */
function extractForecastCandidateNodes(json) {
  const out = [];

  // fast paths commonly seen
  const direct =
    json?.forecast?.data ||
    json?.forecast?.forecast ||
    json?.forecast?.forecasts ||
    json?.forecast_data ||
    json?.forecast ||
    json?.data?.forecast ||
    json?.data?.forecasts ||
    json?.forecasts ||
    json?.hydrograph?.forecast ||
    json?.hydrograph?.forecasts;

  if (direct) out.push(direct);

  // sometimes forecast is nested like: forecast: [{ data: [...] }]
  if (Array.isArray(json?.forecast?.[0]?.data)) out.push(json.forecast[0].data);
  if (Array.isArray(json?.data?.[0]?.forecast)) out.push(json.data[0].forecast);

  // some NOAA payloads contain "series" or "timeseries" objects
  if (json?.series) out.push(json.series);
  if (json?.timeSeries) out.push(json.timeSeries);
  if (json?.timeseries) out.push(json.timeseries);

  return out;
}

function looksLikeTimeString(v) {
  if (typeof v !== "string") return false;
  // ISO or similar; keep permissive
  const iso = safeISO(v);
  return !!iso;
}

function parseTimeAny(x) {
  if (x == null) return null;

  // already a Date-like
  if (typeof x === "string") return safeISO(x);
  if (typeof x === "number") {
    // could be epoch seconds or ms
    const ms = x > 1e12 ? x : x * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (x instanceof Date) {
    return isNaN(x.getTime()) ? null : x.toISOString();
  }

  // sometimes { validTime: "..."} etc
  if (isObj(x)) {
    const cand =
      x.validTime ?? x.validtime ?? x.dateTime ?? x.datetime ?? x.time ?? x.t ?? x.x ?? null;
    return cand ? safeISO(cand) : null;
  }

  return null;
}

function parseValueAny(x) {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizePointsFromArrayOfObjects(arr) {
  if (!Array.isArray(arr)) return [];

  const points = [];
  for (const p of arr) {
    if (!p || typeof p !== "object") continue;

    const t =
      p.validTime ??
      p.validtime ??
      p.dateTime ??
      p.datetime ??
      p.time ??
      p.t ??
      p.x ??
      null;

    const raw =
      p.value ??
      p.stage ??
      p.primary ??
      p.primaryValue ??
      p.level ??
      p.y ??
      p.v ??
      null;

    const iso = parseTimeAny(t);
    const v = parseValueAny(raw);

    if (!iso || v == null) continue;
    points.push({ t: iso, v });
  }

  return dedupeAndSort(points);
}

function normalizePointsFromArrayPairs(arr) {
  if (!Array.isArray(arr)) return [];

  const points = [];
  for (const item of arr) {
    if (!Array.isArray(item) || item.length < 2) continue;

    const t = parseTimeAny(item[0]);
    const v = parseValueAny(item[1]);

    if (!t || v == null) continue;
    points.push({ t, v });
  }

  return dedupeAndSort(points);
}

function normalizePointsFromParallelArrays(obj) {
  if (!isObj(obj)) return [];

  // common key pairs
  const timeKeys = ["t", "time", "times", "x", "dateTime", "datetime", "validTime", "validtime"];
  const valueKeys = ["v", "value", "values", "y", "stage", "stages", "level", "levels", "primary"];

  let tArr = null;
  let vArr = null;

  for (const tk of timeKeys) {
    if (Array.isArray(obj[tk]) && obj[tk].length) {
      tArr = obj[tk];
      break;
    }
  }
  for (const vk of valueKeys) {
    if (Array.isArray(obj[vk]) && obj[vk].length) {
      vArr = obj[vk];
      break;
    }
  }

  if (!tArr || !vArr) return [];

  const n = Math.min(tArr.length, vArr.length);
  if (n < 6) return [];

  const points = [];
  for (let i = 0; i < n; i++) {
    const t = parseTimeAny(tArr[i]);
    const v = parseValueAny(vArr[i]);
    if (!t || v == null) continue;
    points.push({ t, v });
  }

  return dedupeAndSort(points);
}

function dedupeAndSort(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  const byT = new Map();
  for (const pt of points) {
    if (!pt?.t) continue;
    const prev = byT.get(pt.t);
    if (prev == null || pt.v > prev) byT.set(pt.t, pt.v);
  }

  return [...byT.entries()]
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
}

function takeDailyHigh(points, { days = 7, takeLast = true } = {}) {
  const byDay = new Map();
  for (const p of points) {
    const day = chicagoDayKey(p.t);
    if (!day) continue;
    const prev = byDay.get(day);
    if (prev == null || p.v > prev) byDay.set(day, p.v);
  }

  const allDays = [...byDay.entries()]
    .map(([day, maxV]) => ({ day, v: maxV }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const slice = takeLast ? allDays.slice(-days) : allDays.slice(0, days);

  return slice.map((d) => ({
    t: toNoonChicagoISO(d.day),
    v: +Number(d.v).toFixed(2),
  }));
}

function takeDailyMean(points, { days = 7, takeLast = true } = {}) {
  const byDay = new Map();
  for (const p of points) {
    const day = chicagoDayKey(p.t);
    if (!day) continue;
    const prev = byDay.get(day) || { sum: 0, count: 0 };
    byDay.set(day, { sum: prev.sum + Number(p.v), count: prev.count + 1 });
  }

  const allDays = [...byDay.entries()]
    .map(([day, agg]) => ({ day, v: agg.count > 0 ? agg.sum / agg.count : null }))
    .filter((d) => Number.isFinite(d.v))
    .sort((a, b) => a.day.localeCompare(b.day));

  const slice = takeLast ? allDays.slice(-days) : allDays.slice(0, days);

  return slice.map((d) => ({
    t: toNoonChicagoISO(d.day),
    v: +Number(d.v).toFixed(2),
  }));
}

function computeForecastConfidence({ issuanceISO, dailyPoints }) {
  const count = Array.isArray(dailyPoints) ? dailyPoints.length : 0;

  let confidence = "low";
  if (count >= 7) confidence = "high";
  else if (count >= 4) confidence = "medium";

  let isStale = false;

  if (issuanceISO) {
    const issuedMs = new Date(issuanceISO).getTime();
    if (Number.isFinite(issuedMs)) {
      const ageHrs = (Date.now() - issuedMs) / 36e5;

      // NOAA updates vary; mark stale if older than ~18h
      if (ageHrs > 18) isStale = true;

      // degrade confidence if stale
      if (ageHrs > 36) {
        confidence = "low";
      } else if (ageHrs > 18) {
        if (confidence === "high") confidence = "medium";
        else if (confidence === "medium") confidence = "low";
      }
    }
  }

  return { confidence, isStale };
}

function filterForecastWindow(points, { issuanceISO } = {}) {
  if (!Array.isArray(points) || points.length === 0) return [];

  const now = Date.now();
  const minMs = now - 6 * 60 * 60 * 1000; // allow a small tail
  const maxMs = now + 16 * 24 * 60 * 60 * 1000; // cap at ~16 days

  let issuanceKey = issuanceISO ? chicagoDayKey(issuanceISO) : null;

  let filtered = points.filter((p) => {
    const tms = new Date(p.t).getTime();
    return Number.isFinite(tms) && tms >= minMs && tms <= maxMs;
  });

  // Align with issuance day (don’t start before issuance day) when safe
  if (issuanceKey) {
    const issuanceFiltered = filtered.filter((p) => {
      const k = chicagoDayKey(p.t);
      return k && k >= issuanceKey;
    });

    // only apply if it doesn't destroy most of the data
    if (issuanceFiltered.length >= Math.min(12, filtered.length * 0.4)) {
      filtered = issuanceFiltered;
    }
  }

  return filtered;
}

/**
 * Deep-scan the NOAA JSON for timeseries candidates and pick the best forecast-like one.
 *
 * Supports candidates as:
 *  - Array<Object>  (time/value keys)
 *  - Array<[t,v]>   (pairs)
 *  - Object with parallel arrays (x/y, time/value)
 *
 * Scoring prioritizes:
 *  - contains future points
 *  - covers more unique days
 *  - reasonable number of points
 */
function extractBestNoaaForecastPoints(json, { issuanceISO } = {}) {
  const seedNodes = extractForecastCandidateNodes(json);

  const queue = [];
  for (const n of seedNodes) queue.push({ node: n, depth: 0 });
  queue.push({ node: json, depth: 0 });

  const seen = new Set();
  const MAX_DEPTH = 8;
  const MAX_NODES = 2600;

  let nodes = 0;
  let best = { points: [], score: -1, why: "" };

  const nowMs = Date.now();

  function scorePoints(points, whyTag) {
    if (!Array.isArray(points) || points.length < 6) return;

    const futureCount = points.filter((p) => new Date(p.t).getTime() >= nowMs - 60 * 60 * 1000).length;
    const uniqueDays = new Set(points.map((p) => chicagoDayKey(p.t)).filter(Boolean)).size;

    // forecast-like = has a good amount of future coverage and day coverage
    let score = 0;
    score += Math.min(points.length, 600); // more points helps, but cap
    score += uniqueDays * 20;
    score += futureCount * 2;

    // hard preference for future-looking series
    if (futureCount > 0) score += 200;
    else score -= 150;

    // tiny preference for not being absurdly spiky/empty after filtering
    const win = filterForecastWindow(points, { issuanceISO });
    const winDays = new Set(win.map((p) => chicagoDayKey(p.t)).filter(Boolean)).size;
    score += winDays * 10;

    if (score > best.score) {
      best = { points, score, why: whyTag };
    }
  }

  while (queue.length && nodes < MAX_NODES) {
    const { node, depth } = queue.shift();
    nodes++;

    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    // Candidate type 1: Array
    if (Array.isArray(node)) {
      // arrays of objects
      if (node.length >= 6 && isObj(node[0])) {
        const pts = normalizePointsFromArrayOfObjects(node.slice(0, 2000));
        scorePoints(pts, "array<object>");
      }

      // arrays of pairs
      if (node.length >= 6 && Array.isArray(node[0])) {
        const pts = normalizePointsFromArrayPairs(node.slice(0, 3000));
        scorePoints(pts, "array<[t,v]>");
      }
    }

    // Candidate type 2: parallel arrays object
    if (isObj(node)) {
      const pts = normalizePointsFromParallelArrays(node);
      if (pts.length >= 6) scorePoints(pts, "parallel-arrays");

      // Some NOAA structures embed a "data" object with parallel arrays
      if (isObj(node.data)) {
        const pts2 = normalizePointsFromParallelArrays(node.data);
        if (pts2.length >= 6) scorePoints(pts2, "parallel-arrays(node.data)");
      }

      // Some embed "values" as an array of pairs or objects under a single key
      for (const [k, v] of Object.entries(node)) {
        if (Array.isArray(v) && v.length >= 6) {
          if (isObj(v[0])) {
            const pts3 = normalizePointsFromArrayOfObjects(v.slice(0, 2000));
            scorePoints(pts3, `node[${k}]:array<object>`);
          } else if (Array.isArray(v[0])) {
            const pts4 = normalizePointsFromArrayPairs(v.slice(0, 3000));
            scorePoints(pts4, `node[${k}]:array<[t,v]>`);
          }
        }
      }
    }

    // BFS expand
    if (depth < MAX_DEPTH) {
      if (Array.isArray(node)) {
        for (const v of node) {
          if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
        }
      } else {
        for (const v of Object.values(node)) {
          if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
        }
      }
    }
  }

  return best;
}

function normalizePointsFromParallelArraysForFlow(obj) {
  if (!isObj(obj)) return [];

  const timeKeys = ["t", "time", "times", "x", "dateTime", "datetime", "validTime", "validtime"];
  const valueKeys = ["flow", "discharge", "streamflow", "stream_flow", "q", "qout", "outflow", "inflow", "value", "values", "v", "y"];

  let tArr = null;
  let vArr = null;

  for (const tk of timeKeys) {
    if (Array.isArray(obj[tk]) && obj[tk].length) {
      tArr = obj[tk];
      break;
    }
  }
  for (const vk of valueKeys) {
    if (Array.isArray(obj[vk]) && obj[vk].length) {
      vArr = obj[vk];
      break;
    }
  }

  if (!tArr || !vArr) return [];

  const n = Math.min(tArr.length, vArr.length);
  if (n < 6) return [];

  const points = [];
  for (let i = 0; i < n; i++) {
    const t = parseTimeAny(tArr[i]);
    const v = parseValueAny(vArr[i]);
    if (!t || v == null) continue;
    points.push({ t, v });
  }

  return dedupeAndSort(points);
}

function extractNoaaFlowUnit(json) {
  const queue = [json];
  const seen = new Set();
  const maxNodes = 1200;
  let nodes = 0;

  while (queue.length && nodes < maxNodes) {
    const node = queue.shift();
    nodes += 1;

    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    for (const [k, v] of Object.entries(node)) {
      const lk = String(k).toLowerCase();
      if ((lk.includes("unit") || lk.includes("units")) && typeof v === "string") {
        const lv = v.toLowerCase();
        if (lv.includes("cfs")) return "cfs";
        if (lv.includes("kcfs")) return "kcfs";
        if (lv.includes("cms") || lv.includes("m3/s")) return "cms";
      }

      if (v && typeof v === "object") queue.push(v);
    }
  }

  return null;
}

function extractBestNoaaFlowPoints(json, { issuanceISO } = {}) {
  const FLOW_KEY_RE = /(flow|discharge|streamflow|stream_flow|inflow|outflow|\bq\b|\bcfs\b)/i;
  const STAGE_KEY_RE = /(stage|gage|height|level)/i;

  const seedNodes = extractForecastCandidateNodes(json);
  const queue = [];
  for (const n of seedNodes) queue.push({ node: n, depth: 0, path: "seed" });
  queue.push({ node: json, depth: 0, path: "root" });

  const seen = new Set();
  const MAX_DEPTH = 8;
  const MAX_NODES = 2600;
  let nodes = 0;
  let best = { points: [], score: -1, why: "" };
  const nowMs = Date.now();

  function scorePoints(points, whyTag, path) {
    if (!Array.isArray(points) || points.length < 6) return;

    const futureCount = points.filter((p) => new Date(p.t).getTime() >= nowMs - 60 * 60 * 1000).length;
    const uniqueDays = new Set(points.map((p) => chicagoDayKey(p.t)).filter(Boolean)).size;

    let score = 0;
    score += Math.min(points.length, 600);
    score += uniqueDays * 20;
    score += futureCount * 2;
    if (futureCount > 0) score += 200;
    else score -= 150;

    if (FLOW_KEY_RE.test(path)) score += 220;
    if (STAGE_KEY_RE.test(path)) score -= 160;

    const win = filterForecastWindow(points, { issuanceISO });
    score += new Set(win.map((p) => chicagoDayKey(p.t)).filter(Boolean)).size * 10;

    if (score > best.score) {
      best = { points, score, why: `${whyTag}@${path}` };
    }
  }

  while (queue.length && nodes < MAX_NODES) {
    const { node, depth, path } = queue.shift();
    nodes += 1;

    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.length >= 6 && isObj(node[0])) {
        scorePoints(normalizePointsFromArrayOfObjects(node.slice(0, 2000)), "array<object>", path);
      }
      if (node.length >= 6 && Array.isArray(node[0])) {
        scorePoints(normalizePointsFromArrayPairs(node.slice(0, 3000)), "array<[t,v]>", path);
      }
    }

    if (isObj(node)) {
      scorePoints(normalizePointsFromParallelArraysForFlow(node), "parallel-flow", path);

      for (const [k, v] of Object.entries(node)) {
        const nextPath = `${path}.${k}`;
        if (Array.isArray(v) && v.length >= 6) {
          if (isObj(v[0])) {
            scorePoints(normalizePointsFromArrayOfObjects(v.slice(0, 2000)), `node[${k}]:array<object>`, nextPath);
          } else if (Array.isArray(v[0])) {
            scorePoints(normalizePointsFromArrayPairs(v.slice(0, 3000)), `node[${k}]:array<[t,v]>`, nextPath);
          }
        }

        if (depth < MAX_DEPTH && v && typeof v === "object") {
          queue.push({ node: v, depth: depth + 1, path: nextPath });
        }
      }
    }
  }

  return best;
}

/* ----------------------------- NOAA fallbacks for flood stage ----------------------------- */

async function fetchNOAAFloodStageFallback(id) {
  // Flood-stage only helper (still NOAA NWPS)
  try {
    const url = `https://api.water.noaa.gov/nwps/ahps/station/${encodeURIComponent(id)}`;
    const json = await fetchJSON(url, { timeoutMs: 11000 });
    const stage = Number(json?.floodStage);
    return Number.isFinite(stage) && stage > 0 ? stage : null;
  } catch {
    return null;
  }
}

async function fetchNearestAhpsFromMapServer(lat, lon) {
  // NOAA ArcGIS layer includes gaugelid + flood threshold.
  const q = new URLSearchParams({
    f: "pjson",
    geometry: `${Number(lon)},${Number(lat)}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: "35",
    units: "esriSRUnit_Kilometer",
    outFields: "gaugelid,location,flood,units,url,waterbody,state,status",
    returnGeometry: "false",
    resultRecordCount: "1",
  });

  const url = `https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/0/query?${q.toString()}`;
  const json = await fetchJSON(url, { timeoutMs: 14000 });
  const feat = json?.features?.[0]?.attributes;
  if (!feat) return null;

  const gaugelid = feat?.gaugelid ? String(feat.gaugelid).trim() : null;
  const flood = Number(feat?.flood);
  const floodStage = Number.isFinite(flood) && flood > 0 ? flood : null;

  return {
    gaugelid: gaugelid && isLikelyAhpsId(gaugelid) ? gaugelid : null,
    floodStage,
    location: feat?.location ? String(feat.location) : null,
    units: feat?.units ? String(feat.units) : null,
    url: feat?.url ? String(feat.url) : null,
    status: feat?.status ? String(feat.status) : null,
  };
}

/* ----------------------------- derived metrics ----------------------------- */

function analyzeConditions(observed, floodStage, historyDaily) {
  // Trend from daily points
  let trend = "unknown";
  let trendDelta = null;

  if (Array.isArray(historyDaily) && historyDaily.length >= 6) {
    const clean = historyDaily
      .map((p) => ({ t: new Date(p.t).getTime(), v: Number(p.v) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
      .sort((a, b) => a.t - b.t);

    if (clean.length >= 6) {
      const last = clean[clean.length - 1]?.v;
      const prev = clean[clean.length - 6]?.v;
      const diff = last - prev;

      trendDelta = +diff.toFixed(2);

      if (diff > 0.25) trend = "rising";
      else if (diff < -0.25) trend = "falling";
      else trend = "steady";
    }
  }

  let floodPercent = null;
  if (typeof observed === "number" && typeof floodStage === "number" && floodStage > 0) {
    floodPercent = +((observed / floodStage) * 100).toFixed(0);
  }

  // 0 Normal, 1 Elevated, 2 Near Flood, 3 Flooding
  let hazardCode = 0;
  let hazardLabel = "Normal";

  if (typeof observed !== "number" || typeof floodStage !== "number" || !(floodStage > 0)) {
    hazardCode = 0;
    hazardLabel = "Normal";
  } else {
    const pct = observed / floodStage;

    if (pct >= 1) {
      hazardCode = 3;
      hazardLabel = "Flooding";
    } else if (pct >= 0.95) {
      hazardCode = 2;
      hazardLabel = "Near Flood";
    } else if (pct >= 0.8) {
      hazardCode = 1;
      hazardLabel = "Elevated";
    } else {
      hazardCode = 0;
      hazardLabel = "Normal";
    }
  }

  return { trend, trendDelta, floodPercent, hazardCode, hazardLabel };
}

/**
 * Generate a synthetic forecast by projecting the recent trend forward.
 * If we have 7+ days of history, calculate the average daily change and project it.
 */
function generateSyntheticForecast(historyDaily, days = 7) {
  if (!Array.isArray(historyDaily) || historyDaily.length < 3) {
    return null;
  }

  const clean = historyDaily
    .map((p) => ({ t: new Date(p.t).getTime(), v: Number(p.v), day: chicagoDayKey(p.t) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.day)
    .sort((a, b) => a.t - b.t);

  if (clean.length < 3) return null;

  // Calculate trend: average change per day over available history
  const dayCount = clean.length;
  const firstVal = clean[0].v;
  const lastVal = clean[dayCount - 1].v;
  const trendPerDay = (lastVal - firstVal) / (dayCount - 1);

  // Clamp trend to prevent wild projections
  const clampedTrend = Math.max(-0.5, Math.min(0.5, trendPerDay));

  // Start projection from the last known day
  const lastDay = chicagoDayKey(clean[dayCount - 1].t);
  const lastVal_  = clean[dayCount - 1].v;

  const forecast = [];
  let currentDay = lastDay;
  let currentVal = lastVal_;

  for (let i = 0; i < days; i++) {
    // Increment day
    const d = new Date(`${currentDay}T18:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    currentDay = d.toISOString().slice(0, 10);

    // Apply trend
    currentVal = Math.max(0, currentVal + clampedTrend);

    forecast.push({
      t: toNoonChicagoISO(currentDay),
      v: +Number(currentVal).toFixed(2),
    });
  }

  return forecast.slice(0, days);
}

/**
 * Linear regression-based projection using recent IV history (higher fidelity).
 * - Uses the last 72h of IV points if available from historyPts (P7D raw IV)
 * - Fits y = a + b*t (t in days), clamps slope to ±0.6 ft/day
 * - Damps slope over the horizon to avoid runaway: factor decays to ~65% by day 7
 */
function generateRegressionForecastFromIV(historyPts, observedNow, days = 7) {
  if (!Array.isArray(historyPts) || historyPts.length < 24) return null; // need enough points

  const nowMs = Date.now();
  const minMs = nowMs - 72 * 60 * 60 * 1000; // last 72h

  const pts = historyPts
    .map((p) => ({ t: new Date(p.t).getTime(), v: Number(p.v) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t >= minMs && p.t <= nowMs)
    .sort((a, b) => a.t - b.t);

  if (pts.length < 16) return null;

  // Normalize time to days relative to now for numerical stability
  const x = pts.map((p) => (p.t - nowMs) / 86400000); // negative days
  const y = pts.map((p) => p.v);

  const n = x.length;
  let sumX = 0,
    sumY = 0,
    sumXX = 0,
    sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXX += x[i] * x[i];
    sumXY += x[i] * y[i];
  }
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;

  const b = clamp((n * sumXY - sumX * sumY) / denom, -0.6, 0.6); // slope in ft/day
  const a = sumY / n - b * (sumX / n);

  // Anchor at latest observed when provided to remove residual bias
  const y0 = typeof observedNow === "number" && Number.isFinite(observedNow) ? observedNow : a;

  const out = [];
  let currentDayKey = chicagoDayKey(new Date().toISOString());
  for (let i = 1; i <= days; i++) {
    // advance day
    const d = new Date(`${currentDayKey}T18:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    currentDayKey = d.toISOString().slice(0, 10);

    // Damping factor: starts at 1.0 and gently decays
    const damp = 1 - Math.min(0.35, (i / days) * 0.35);
    const yi = y0 + b * i * damp; // in ft

    out.push({ t: toNoonChicagoISO(currentDayKey), v: +Number(Math.max(0, yi)).toFixed(2) });
  }

  return out;
}

/**
 * Bias-correct an official NOAA daily forecast to the latest observed value.
 * Applies a decaying offset over the first few days, clamped to ±1.5 ft.
 */
function biasCorrectForecast(dailyForecast, observedNow, issuanceISO) {
  if (!Array.isArray(dailyForecast) || dailyForecast.length === 0) return {
    corrected: false,
    points: dailyForecast || [],
    delta: 0,
  };

  if (!(typeof observedNow === "number" && Number.isFinite(observedNow))) {
    return { corrected: false, points: dailyForecast, delta: 0 };
  }

  const issuanceKey = issuanceISO ? chicagoDayKey(issuanceISO) : null;
  const todayKey = chicagoDayKey(new Date().toISOString());
  const startKey = issuanceKey || todayKey;

  const idx = dailyForecast.findIndex((p) => chicagoDayKey(p.t) === startKey) || 0;
  const anchorIdx = idx >= 0 ? idx : 0;
  const first = dailyForecast[anchorIdx];
  if (!first) return { corrected: false, points: dailyForecast, delta: 0 };

  let delta = observedNow - Number(first.v);
  if (!Number.isFinite(delta)) return { corrected: false, points: dailyForecast, delta: 0 };

  const abs = Math.abs(delta);
  if (abs < 0.2) return { corrected: false, points: dailyForecast, delta: 0 };
  delta = clamp(delta, -1.5, 1.5);

  // Apply decaying bias over first 4 days from the anchor index
  const out = dailyForecast.map((p, i) => {
    const dayOffset = Math.max(0, i - anchorIdx);
    let weight = 0;
    if (dayOffset === 0) weight = 1.0;
    else if (dayOffset === 1) weight = 0.66;
    else if (dayOffset === 2) weight = 0.33;
    else weight = 0.0;
    return { t: p.t, v: +Number(p.v + delta * weight).toFixed(2) };
  });

  return { corrected: true, points: out, delta };
}

/* ----------------------------- handler ----------------------------- */

export default async function handler(req, res) {
  // GET-only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { site, ahps, lat, lon } = req.query;
  if (!site) return res.status(400).json({ error: "Missing site" });

  // Prefer explicit AHPS gauge id when provided
  let ahpsId = isLikelyAhpsId(ahps) ? ahps : isLikelyAhpsId(site) ? site : null;

  try {
    /* ---------------------------------------------
       1) OBSERVED LEVEL (latest) - USGS
    --------------------------------------------- */
    const ivURL = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(
      site
    )}&parameterCd=00065`;

    const ivJson = await fetchJSON(ivURL, { timeoutMs: 11000 });

    let observed = null;
    let time = null;
    let location = "Unknown";

    try {
      const ts = ivJson?.value?.timeSeries?.[0];
      const val = ts?.values?.[0]?.value?.[0];

      observed = val ? Number(val.value) : null;
      time = val?.dateTime || null;
      location = ts?.sourceInfo?.siteName || "Unnamed Station";
    } catch (err) {

    }

    /* ---------------------------------------------
       2) HISTORY (last 7 days) - USGS, daily highs
    --------------------------------------------- */
    const histURL = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(
      site
    )}&parameterCd=00065&period=P7D`;

    const histJson = await fetchJSON(histURL, { timeoutMs: 18000 });

    let historyRaw = [];
    try {
      const ts = histJson?.value?.timeSeries?.[0];
      const vals = ts?.values?.[0]?.value || [];
      historyRaw = vals
        .map((v) => ({ t: v.dateTime, v: Number(v.value) }))
        .filter((p) => p.t && Number.isFinite(p.v));
    } catch (err) {

    }

    const historyPts = historyRaw
      .map((p) => ({ t: safeISO(p.t), v: p.v }))
      .filter((p) => p.t && Number.isFinite(p.v));

    const historyDaily = takeDailyHigh(historyPts, { days: 7, takeLast: true });

    /* ---------------------------------------------
       3) AUTO-FIND AHPS GAUGE (if none provided)
    --------------------------------------------- */
    let mapServerFloodStage = null;
    let mapServerGauge = null;

    const latNum = lat != null ? Number(lat) : null;
    const lonNum = lon != null ? Number(lon) : null;

    if (!ahpsId && Number.isFinite(latNum) && Number.isFinite(lonNum)) {
      mapServerGauge = await fetchNearestAhpsFromMapServer(latNum, lonNum);
      if (mapServerGauge?.gaugelid) ahpsId = mapServerGauge.gaugelid;
      if (mapServerGauge?.floodStage) mapServerFloodStage = mapServerGauge.floodStage;
    }

    /* ---------------------------------------------
       4) FLOOD STAGE + FORECAST (AHPS-first, NWPS fallback)
    --------------------------------------------- */
    let floodStage = null;

    let prediction = []; // 7 daily highs
    let forecastSource = "None";
    let forecastType = "Unavailable";
    let usedAhpsId = null;

    let forecastIssuedTime = null; // ISO string
    let forecastConfidence = "low";
    let forecastIsStale = false;

    let forecastCoverageDays = 0;
    let forecastCoverageNote = "";
    let extractorDebug = "";
    let flowPrediction = [];
    let flowSource = null;
    let flowUnit = null;
    let flowExtractorDebug = null;

    if (ahpsId) {
      usedAhpsId = ahpsId;

      const ahpsJson = await fetchAhpsHydrographJSON(ahpsId);

      if (ahpsJson) {
        const stageflowParsed = extractStageAndFlowFromStageflow(ahpsJson);

        // Flood stage (preferred)
        floodStage = extractAhpsFloodStage(ahpsJson) ?? null;

        // issuance time
        forecastIssuedTime = stageflowParsed.issuanceTime || extractNoaaIssuanceTime(ahpsJson);

        if (stageflowParsed.flowPoints.length) {
          let flowDaily = takeDailyMean(
            filterForecastWindow(stageflowParsed.flowPoints, { issuanceISO: forecastIssuedTime }),
            { days: 14, takeLast: false }
          );

          const flowTodayKey = chicagoDayKey(new Date().toISOString());
          const flowIssuanceKey = forecastIssuedTime ? chicagoDayKey(forecastIssuedTime) : null;
          const flowStartKey = flowIssuanceKey || flowTodayKey;
          if (flowStartKey) {
            const filteredFlow = flowDaily.filter((p) => {
              const k = chicagoDayKey(p.t);
              return k && k >= flowStartKey;
            });
            flowDaily = filteredFlow.length ? filteredFlow : flowDaily;
          }

          flowPrediction = flowDaily.slice(0, 7);
          if (flowPrediction.length) {
            flowSource = "NOAA NWM Guidance";
            flowUnit = stageflowParsed.flowUnit || "cfs";
          }
        }

        // Extract best forecast-like stage series from NOAA JSON (robust)
        const best = stageflowParsed.stagePoints.length
          ? { points: stageflowParsed.stagePoints, why: "stageflow.forecast.data.primary" }
          : extractBestNoaaForecastPoints(ahpsJson, { issuanceISO: forecastIssuedTime });
        extractorDebug = best?.why ? String(best.why) : "";

        if (!flowPrediction.length) {
          // Generic flow extraction fallback for non-stageflow payload shapes
          const flowBest = extractBestNoaaFlowPoints(ahpsJson, { issuanceISO: forecastIssuedTime });
          flowExtractorDebug = flowBest?.why ? String(flowBest.why) : null;
          let flowWindowed = filterForecastWindow(flowBest.points || [], { issuanceISO: forecastIssuedTime });
          let flowDaily = takeDailyMean(flowWindowed, { days: 14, takeLast: false });

          const flowTodayKey = chicagoDayKey(new Date().toISOString());
          const flowIssuanceKey = forecastIssuedTime ? chicagoDayKey(forecastIssuedTime) : null;
          const flowStartKey = flowIssuanceKey || flowTodayKey;
          if (flowStartKey) {
            const filteredFlow = flowDaily.filter((p) => {
              const k = chicagoDayKey(p.t);
              return k && k >= flowStartKey;
            });
            flowDaily = filteredFlow.length ? filteredFlow : flowDaily;
          }

          flowPrediction = flowDaily.slice(0, 7);
          if (flowPrediction.length) {
            flowSource = "NOAA NWM Guidance";
            flowUnit = extractNoaaFlowUnit(ahpsJson) || "cfs";
          }
        }

        // Window + daily-high (future)
        const windowed = filterForecastWindow(best.points || [], { issuanceISO: forecastIssuedTime });

        // Convert to daily highs and keep next 7 days
        let dailyForecast = takeDailyHigh(windowed, { days: 14, takeLast: false }); // make list, then trim by "next 7 from today/issuance"

        // dailyForecast is already sorted by day ascending

        // Keep only days >= todayKey (or issuanceKey) and take first 7
        const todayKey = chicagoDayKey(new Date().toISOString());
        const issuanceKey = forecastIssuedTime ? chicagoDayKey(forecastIssuedTime) : null;
        const startKey = issuanceKey || todayKey;

        if (startKey) {
          const filtered = dailyForecast.filter((p) => {
            const k = chicagoDayKey(p.t);
            return k && k >= startKey;
          });

          // Fallback to unfiltered if issuance-based filter removes all points
          dailyForecast = filtered.length ? filtered : dailyForecast;
        }

        dailyForecast = dailyForecast.slice(0, 7);

        if (dailyForecast.length > 0) {
          // Bias-correct toward the latest observed stage when reasonable
          const bc = biasCorrectForecast(dailyForecast, observed, forecastIssuedTime);
          prediction = bc.points;
          forecastSource = "NWPS";  // National Water Prediction Service
          forecastType = "Official";

          const conf = computeForecastConfidence({
            issuanceISO: forecastIssuedTime,
            dailyPoints: prediction,
          });

          forecastConfidence = conf.confidence;
          forecastIsStale = conf.isStale;

          forecastCoverageDays = prediction.length;
          forecastCoverageNote =
            prediction.length >= 7
              ? "NWPS: Full 7-day forecast available."
              : `NWPS: Partial forecast available (${prediction.length} day${prediction.length === 1 ? "" : "s"}).`;
          if (bc.corrected) {
            forecastCoverageNote += ` Bias-corrected to latest observed (Δ ${bc.delta.toFixed(2)} ft).`;
          }
        } else {

          forecastCoverageDays = 0;
          forecastCoverageNote = "No forecast points were found in the NOAA hydrograph JSON.";
        }
      } else {

        forecastCoverageDays = 0;
        forecastCoverageNote = "NOAA hydrograph JSON could not be fetched.";
      }

      // Flood stage fallback if not in hydrograph JSON
      if (floodStage == null) {
        floodStage = await fetchNOAAFloodStageFallback(ahpsId);
      }
    }
    
    // If NOAA failed, generate synthetic forecast from historical trend
    if ((!prediction || prediction.length === 0) && historyDaily.length >= 3) {

      // Try regression-based forecast first (higher fidelity if we have enough IV points)
      let synthetic = generateRegressionForecastFromIV(historyPts, observed, 7);
      
      if (!synthetic || synthetic.length < 3) {
        // Fallback to trend-based projection
        synthetic = generateSyntheticForecast(historyDaily, 7);
      }
      
      if (synthetic && synthetic.length > 0) {
        prediction = synthetic;
        forecastSource = "Projected";
        forecastType = "Trend-based";
        forecastCoverageDays = prediction.length;
        forecastCoverageNote = `Trend projection based on recent ${historyDaily.length}-day history. NOAA forecasts unavailable.`;

      }
    }

    // Mapserver flood stage fallback if we found one
    if (floodStage == null && mapServerFloodStage != null) {
      floodStage = mapServerFloodStage;
    }

    // NOAA fallback with site id (sometimes works)
    if (floodStage == null) {
      floodStage = await fetchNOAAFloodStageFallback(site);
    }

    /* ---------------------------------------------
       5) Flood stage backup: USGS site metadata notes
    --------------------------------------------- */
    if (floodStage == null) {
      try {
        const siteURL = `https://waterservices.usgs.gov/nwis/site/?format=json&sites=${encodeURIComponent(
          site
        )}`;
        const siteJson = await fetchJSON(siteURL, { timeoutMs: 14000 });

        const note = siteJson?.value?.sites?.[0]?.siteProperty?.find?.(
          (p) => p.name === "siteNotice"
        )?.value;

        if (note && typeof note === "string") {
          const m = note.match(/flood stage.*?([0-9]+(\.[0-9]+)?)/i);
          if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > 0) floodStage = n;
          }
        }
      } catch (err) {

      }
    }

    /* ---------------------------------------------
       6) Derived metrics
    --------------------------------------------- */
    const derived = analyzeConditions(observed, floodStage, historyDaily);

    /* ---------------------------------------------
       7) Response
    --------------------------------------------- */
    const observedAvailabilityNote = "Observed data availability varies by gauge";

    const forecastBadge =
      forecastType === "Official" ? { text: "Official NOAA Forecast", source: forecastSource } : null;

    const forecastMeta = {
      issuanceTime: forecastIssuedTime,
      issuanceDay: forecastIssuedTime ? chicagoDayKey(forecastIssuedTime) : null,
      confidence: forecastConfidence,
      isStale: forecastIsStale,
      coverageDays: forecastCoverageDays,
      coverageNote: forecastCoverageNote,
      ahpsIdUsed: usedAhpsId || null,
      gaugeHint: usedAhpsId
        ? `Forecast gauge: ${usedAhpsId}${mapServerGauge?.location ? ` (${mapServerGauge.location})` : ""}`
        : "No AHPS/NWPS gauge available",
      // keep a tiny debug breadcrumb (safe)
      extractor: extractorDebug || null,
      flowExtractor: flowExtractorDebug,
      corrected: undefined, // filled below if applicable
      correctionDelta: undefined,
      projectionMethod: forecastType === "Trend-based" && prediction?.length ? (forecastCoverageNote?.includes("Regression") || forecastSource === "Projected" ? "regression72h" : "trend-daily-high") : undefined,
    };

    if (forecastType === "Official" && Array.isArray(prediction) && prediction.length) {
      // retro-detect if bias correction was applied by comparing first day to observed
      const first = prediction[0];
      if (first && typeof observed === "number" && Number.isFinite(observed)) {
        const delta = observed - Number(first.v);
        if (Number.isFinite(delta) && Math.abs(delta) >= 0.2) {
          forecastMeta.corrected = true;
          forecastMeta.correctionDelta = +Number(clamp(delta, -1.5, 1.5)).toFixed(2);
        }
      }
    }

    // Ensure we never exceed 7 points for either series
    const historyOut = historyDaily.slice(-7);
    const predictionOut = Array.isArray(prediction) ? prediction.slice(0, 7) : [];
    const flowPredictionOut = Array.isArray(flowPrediction) ? flowPrediction.slice(0, 7) : [];


    return res.status(200).json({
      location,
      observed,
      floodStage,
      unit: "ft",
      time,
      history: historyOut,
      prediction: predictionOut,
      flowPrediction: flowPredictionOut,
      flowUnit: flowUnit || "cfs",
      flowSource,
      forecastSource,
      forecastType,
      ahpsId: usedAhpsId,
      forecastMeta,
      forecastBadge,
      observedAvailabilityNote,
      ...derived,
    });
  } catch (error) {
    console.error("[API /river-data] Error:", error.message);
    return res.status(500).json({ error: "Failed to fetch river data" });
  }
}
