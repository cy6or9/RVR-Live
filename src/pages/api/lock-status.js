import { getMappedLockSource, buildMappedTimeseriesCandidates } from '../../lib/lockCwmsMap';

const LAST_GOOD_LOCK_STATUS = {};
const SHORT_LIVED_RESULT_CACHE = {};
const LOCK_STATUS_IN_FLIGHT = {};

const FETCH_TIMEOUT_MS = 4000;
const SHORT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_UPSTREAM_ATTEMPTS = 6;

function getCacheKey(lockId, lockName) {
  return `${lockId}-${String(lockName || '').trim().toLowerCase()}`;
}

function ageMinutes(fromMs) {
  return Math.max(0, Math.round((Date.now() - fromMs) / 60000));
}

function getShortLivedResult(key) {
  const hit = SHORT_LIVED_RESULT_CACHE[key];
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > SHORT_CACHE_TTL_MS) {
    delete SHORT_LIVED_RESULT_CACHE[key];
    return null;
  }
  return hit.result;
}

function setShortLivedResult(key, result) {
  SHORT_LIVED_RESULT_CACHE[key] = {
    cachedAt: Date.now(),
    result,
  };
}

function getLastGood(key) {
  return LAST_GOOD_LOCK_STATUS[key] || null;
}

function setLastGood(key, data) {
  LAST_GOOD_LOCK_STATUS[key] = {
    data,
    verifiedAtMs: Date.now(),
  };
}

function successResponse(data, cached, verifiedAtMs) {
  return {
    status: 200,
    body: {
      available: true,
      cached,
      verifiedAt: new Date(verifiedAtMs).toISOString(),
      ageMinutes: cached ? ageMinutes(verifiedAtMs) : 0,
      data,
    },
  };
}

function normalizeUnavailableReason(reason) {
  switch (reason) {
    case 'upstream_unavailable':
      return 'upstream_unavailable';
    case 'mapped_all_404':
      return 'missing_data';
    case 'unverified_source':
      return 'unavailable';
    case 'invalid_response':
      return 'invalid_response';
    case 'missing_data':
      return 'missing_data';
    default:
      return 'unavailable';
  }
}

function unavailableResponse(reason) {
  return {
    status: 200,
    body: {
      available: false,
      cached: false,
      reason: normalizeUnavailableReason(reason),
      message: 'Lock status unavailable',
    },
  };
}

function isUsableLockStatus(data) {
  if (!data || typeof data !== 'object') return false;
  return [data.queueLength, data.congestion, data.averageWaitTime, data.towsLast24h, data.lastTowPassage, data.direction]
    .some((value) => value !== null && value !== undefined);
}

function normalizeCwmsPayload(payload, lockId, lockName, seriesName) {
  if (!payload || typeof payload !== 'object') return null;

  const rows = Array.isArray(payload.values)
    ? payload.values
    : Array.isArray(payload.valueColumns)
      ? payload.valueColumns[0]?.values || []
      : [];

  if (!Array.isArray(rows) || rows.length === 0) return null;

  const latest = rows[rows.length - 1];
  const rawValue = Array.isArray(latest) ? latest[1] : (latest?.v ?? latest?.value ?? latest?.y);
  const rawTime = Array.isArray(latest) ? latest[0] : (latest?.t ?? latest?.timestamp ?? latest?.x);
  const value = Number(rawValue);

  if (!Number.isFinite(value)) return null;

  return {
    lockId,
    lockName,
    source: 'CWMS',
    series: seriesName,
    value,
    unit: payload.units || payload.unit || null,
    lastTowPassage: rawTime ? new Date(rawTime).toISOString() : new Date().toISOString(),
  };
}

async function fetchUpstreamJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RiverValleyReport/1.0',
      },
      signal: ctrl.signal,
    });

    if (!response.ok) {
      return { ok: false, status: response.status, payload: null };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, status: response.status, payload: null };
    }

    const payload = await response.json();
    return { ok: true, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === 'AbortError' ? 408 : null,
      payload: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVerifiedLockStatus(lockId, lockName, mapping) {
  const candidates = buildMappedTimeseriesCandidates(mapping).slice(0, MAX_UPSTREAM_ATTEMPTS);
  let attempts = 0;
  let all404 = true;

  for (const seriesName of candidates) {
    attempts += 1;
    const url = `https://cwms-data.usace.army.mil/cwms-data/timeseries?name=${encodeURIComponent(seriesName)}&office=${encodeURIComponent(mapping.office)}`;
    const upstream = await fetchUpstreamJson(url);

    if (upstream.status !== 404) {
      all404 = false;
    }

    if (!upstream.ok) {
      continue;
    }

    const normalized = normalizeCwmsPayload(upstream.payload, lockId, lockName, seriesName);
    if (isUsableLockStatus(normalized)) {
      return { data: normalized, attempts, failureReason: null };
    }
  }

  return {
    data: null,
    attempts,
    failureReason: attempts > 0 && all404 ? 'mapped_all_404' : 'upstream_unavailable',
  };
}

function logDebugSummary(isDebug, summary) {
  if (isDebug) {
    console.log('[lock-status] summary', summary);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { lockId, lockName, debug } = req.query;
    const isDebug = debug === '1' || debug === 'true';

    const lockIdNum = Number(lockId);
    if (!Number.isFinite(lockIdNum) || lockIdNum < 1) {
      return res.status(400).json({ error: 'Invalid lockId' });
    }
    if (!lockName || !String(lockName).trim()) {
      return res.status(400).json({ error: 'lockName required' });
    }

    const key = getCacheKey(lockIdNum, lockName);
    const mapping = getMappedLockSource(lockIdNum, lockName);
    const verified = !!mapping?.verified;
    const sourceMode = verified ? 'verified_only' : 'unverified_cached_only';

    const cachedResult = getShortLivedResult(key);
    if (cachedResult) {
      logDebugSummary(isDebug, {
        lockId: lockIdNum,
        lockName,
        verified,
        sourceMode,
        upstreamAttempts: 0,
        cacheHit: true,
        lastGoodUsed: cachedResult.body?.cached === true,
        failureReason: cachedResult.body?.available ? null : cachedResult.body?.reason || 'short_cache_hit',
      });
      return res.status(cachedResult.status).json(cachedResult.body);
    }

    if (LOCK_STATUS_IN_FLIGHT[key]) {
      const inFlightResult = await LOCK_STATUS_IN_FLIGHT[key];
      logDebugSummary(isDebug, {
        lockId: lockIdNum,
        lockName,
        verified,
        sourceMode,
        upstreamAttempts: 0,
        cacheHit: true,
        lastGoodUsed: inFlightResult.body?.cached === true,
        failureReason: inFlightResult.body?.available ? null : inFlightResult.body?.reason || 'in_flight_dedup',
      });
      return res.status(inFlightResult.status).json(inFlightResult.body);
    }

    const requestPromise = (async () => {
      if (!verified) {
        const lastGood = getLastGood(key);
        return lastGood
          ? { result: successResponse(lastGood.data, true, lastGood.verifiedAtMs), upstreamAttempts: 0 }
          : { result: unavailableResponse('unverified_source'), upstreamAttempts: 0 };
      }

      const fetched = await fetchVerifiedLockStatus(lockIdNum, lockName, mapping);
      if (fetched.data) {
        setLastGood(key, fetched.data);
        return { result: successResponse(fetched.data, false, Date.now()), upstreamAttempts: fetched.attempts };
      }

      const lastGood = getLastGood(key);
      return lastGood
        ? { result: successResponse(lastGood.data, true, lastGood.verifiedAtMs), upstreamAttempts: fetched.attempts }
        : { result: unavailableResponse(fetched.failureReason || 'upstream_unavailable'), upstreamAttempts: fetched.attempts };
    })();

    LOCK_STATUS_IN_FLIGHT[key] = requestPromise;

    const { result, upstreamAttempts } = await requestPromise;
    setShortLivedResult(key, result);

    logDebugSummary(isDebug, {
      lockId: lockIdNum,
      lockName,
      verified,
      sourceMode,
      upstreamAttempts,
      cacheHit: false,
      lastGoodUsed: result.body?.cached === true,
      failureReason: result.body?.available ? null : result.body?.reason || 'unknown',
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[lock-status] unexpected handler error', error);
    return res.status(500).json({
      available: false,
      reason: 'unavailable',
      message: 'Lock status unavailable',
    });
  } finally {
    const lockIdNum = Number(req?.query?.lockId);
    const lockName = req?.query?.lockName;
    if (Number.isFinite(lockIdNum) && lockIdNum > 0 && lockName && String(lockName).trim()) {
      const key = getCacheKey(lockIdNum, lockName);
      delete LOCK_STATUS_IN_FLIGHT[key];
    }
  }
}
