import { ohioRiverLocks } from '../../lib/locks';

const NOAA_ARCGIS_URL =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/0/query';

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/lock\s*and\s*dam/g, 'l&d')
    .replace(/[^a-z0-9]/g, '');
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * 69.0;
  const avgLat = (lat1 + lat2) / 2.0;
  const dLon = (lon2 - lon1) * 54.6 * Math.cos((avgLat * Math.PI) / 180.0);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function parseStageValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isLockLike(feature) {
  const location = String(feature?.location || '').toLowerCase();
  return /\block\b|\bdam\b|l&d|\bupper\b|\blower\b/.test(location);
}

async function fetchArcgisLockFeatures() {
  const params = new URLSearchParams({
    f: 'json',
    where: "waterbody='Ohio River'",
    outFields: 'gaugelid,location,action,flood,moderate,major,units,url,waterbody,state,status',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '500',
  });

  const response = await fetch(`${NOAA_ARCGIS_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RiverValleyReport/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`ArcGIS request failed (${response.status})`);
  }

  const json = await response.json();
  const features = Array.isArray(json?.features) ? json.features : [];

  return features
    .map((f) => {
      const a = f?.attributes || {};
      const g = f?.geometry || {};
      return {
        gaugelid: a.gaugelid ? String(a.gaugelid).toUpperCase() : null,
        location: a.location ? String(a.location) : null,
        action: parseStageValue(a.action),
        flood: parseStageValue(a.flood),
        moderate: parseStageValue(a.moderate),
        major: parseStageValue(a.major),
        units: a.units ? String(a.units) : 'ft',
        state: a.state ? String(a.state) : null,
        url: a.url ? String(a.url) : null,
        status: a.status ? String(a.status) : null,
        lat: Number(g.y),
        lon: Number(g.x),
      };
    })
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
    .filter(isLockLike);
}

function selectBestArcgisMatch(baseLock, arcgisLocks) {
  const preferredGaugeId = String(baseLock?.floodStages?.gaugeId || '').toUpperCase();
  if (preferredGaugeId) {
    const exactGauge = arcgisLocks.find(
      (candidate) => String(candidate.gaugelid || '').toUpperCase() === preferredGaugeId
    );
    if (exactGauge) return exactGauge;
  }

  const baseNorm = normalizeName(baseLock.name);

  let best = null;
  for (const candidate of arcgisLocks) {
    const candNorm = normalizeName(candidate.location || candidate.gaugelid || '');
    const nameScore = candNorm.includes(baseNorm) || baseNorm.includes(candNorm) ? 0 : 1;
    const dist = distanceMiles(baseLock.lat, baseLock.lon, candidate.lat, candidate.lon);
    const score = nameScore * 1000 + dist;
    if (!best || score < best.score) {
      best = { score, dist, candidate };
    }
  }

  if (!best || best.dist > 45) return null;
  return best.candidate;
}

function mergeLock(baseLock, arcgisMatch) {
  if (!arcgisMatch) return baseLock;

  const hasThresholds =
    arcgisMatch.action != null ||
    arcgisMatch.flood != null ||
    arcgisMatch.moderate != null ||
    arcgisMatch.major != null;

  return {
    ...baseLock,
    lat: arcgisMatch.lat,
    lon: arcgisMatch.lon,
    floodStages: hasThresholds
      ? {
          action: arcgisMatch.action,
          minor: arcgisMatch.flood,
          moderate: arcgisMatch.moderate,
          major: arcgisMatch.major,
          units: arcgisMatch.units || 'ft',
          gaugeId: arcgisMatch.gaugelid || baseLock.floodStages?.gaugeId || null,
        }
      : baseLock.floodStages || null,
    arcgisGaugeId: arcgisMatch.gaugelid,
    arcgisLocation: arcgisMatch.location,
    arcgisStatus: arcgisMatch.status,
    arcgisSource: 'NOAA ArcGIS REST',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const arcgisLocks = await fetchArcgisLockFeatures();
    const mergedLocks = ohioRiverLocks.map((baseLock) =>
      mergeLock(baseLock, selectBestArcgisMatch(baseLock, arcgisLocks))
    );

    return res.status(200).json({
      source: 'NOAA ArcGIS REST API',
      fetchedAt: new Date().toISOString(),
      count: mergedLocks.length,
      locks: mergedLocks,
    });
  } catch (error) {
    return res.status(200).json({
      source: 'fallback_static_locks',
      fetchedAt: new Date().toISOString(),
      error: String(error?.message || error),
      count: ohioRiverLocks.length,
      locks: ohioRiverLocks,
    });
  }
}
