'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * OhioRiverActivityMap Component
 * 
 * GPS-style interactive map showing lock locations, hydrology-derived danger levels,
 * and verified status metadata when a public source is available.
 * 
 * Data sources (all public):
 * - U.S. Army Corps of Engineers lock logs
 * - Lock queue status
 * - Lockage timestamps
 * - Tow passage events
 * 
 * Lock status caching:
 * - In-memory cache with 5-minute TTL per composite key (lockId + lockName)
 * - Deduplicates concurrent requests in-flight
 * - Treats 503 responses as graceful "unavailable" state, not errors
 */

// Module-level cache: { "lockId-lockName": { data, timestamp } }
const LOCK_STATUS_CACHE = {};
const LOCK_STATUS_IN_FLIGHT = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if cached entry is still valid
 */
function isCacheValid(cacheKey) {
  const entry = LOCK_STATUS_CACHE[cacheKey];
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Get cached result if valid, otherwise return null
 */
function getCachedLockStatus(lockId, lockName) {
  const cacheKey = `${lockId}-${lockName}`;
  if (isCacheValid(cacheKey)) {
    return LOCK_STATUS_CACHE[cacheKey].data;
  }
  return null;
}

/**
 * Set cache entry
 */
function setCachedLockStatus(lockId, lockName, data) {
  const cacheKey = `${lockId}-${lockName}`;
  LOCK_STATUS_CACHE[cacheKey] = {
    data,
    timestamp: Date.now(),
  };
}

/**
 * Check if request is already in-flight; returns the promise if so
 */
function getInFlightRequest(lockId, lockName) {
  const key = `${lockId}-${lockName}`;
  return LOCK_STATUS_IN_FLIGHT[key] || null;
}

/**
 * Set in-flight promise (or null to clear)
 */
function setInFlightRequest(lockId, lockName, promise) {
  const key = `${lockId}-${lockName}`;
  if (promise === null) {
    delete LOCK_STATUS_IN_FLIGHT[key];
  } else {
    LOCK_STATUS_IN_FLIGHT[key] = promise;
  }
}

/**
 * Fetch lock status with dedup, timeout, and stable unavailable payload handling
 */
async function fetchLockStatus(lockId, lockName) {
  // Check cache first
  const cached = getCachedLockStatus(lockId, lockName);
  if (cached) {
    return cached;
  }

  // Check if request already in-flight
  const inFlight = getInFlightRequest(lockId, lockName);
  if (inFlight) {
    return inFlight;
  }

  // Create new request promise
  const requestPromise = (async () => {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 10000); // 10 second timeout

      const response = await fetch(
        `/api/lock-status?lockId=${lockId}&lockName=${encodeURIComponent(lockName)}`,
        { signal: ctrl.signal }
      );
      clearTimeout(timeoutId);

      const payload = await response.json().catch(() => null);
      const normalized = payload?.available === true && payload?.data
        ? {
            available: true,
            cached: payload.cached ?? false,
            ageMinutes: payload.ageMinutes ?? null,
            verifiedAt: payload.verifiedAt ?? null,
            data: payload.data,
          }
        : {
            available: false,
            reason: payload?.reason || (response.ok ? 'unavailable' : 'error'),
            message: payload?.message || 'Lock status unavailable',
          };

      setCachedLockStatus(lockId, lockName, normalized);
      return normalized;
    } catch (err) {
      // Network failure, timeout, or abort
      const result = { available: false, reason: 'unavailable', message: 'Lock status unavailable' };
      setCachedLockStatus(lockId, lockName, result);
      return result;
    } finally {
      setInFlightRequest(lockId, lockName, null);
    }
  })();

  // Mark as in-flight
  setInFlightRequest(lockId, lockName, requestPromise);

  return requestPromise;
}

function buildLockIcon(L, color) {
  return L.divIcon({
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        cursor: pointer;
      ">
        <img src="/lock-dam-icon.svg" style="width: 18px; height: 18px;" alt="Lock" />
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
    className: 'lock-marker',
  });
}

export default function OhioRiverActivityMap({ locks = [], lockActivityById = {}, stations = [], selectedLockId, selectedHydro = null, currentRiverLevel = null, riverConditionLabel = null, weatherNow = null, userLocation, onLockSelect, mapStyle = 'standard' }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const riverLinesRef = useRef([]); // Changed to array to hold multiple polylines
  const riverCoordinatesRef = useRef([]); // Store all river coordinates for snapping
  const markersRef = useRef([]);
  const markersByLockIdRef = useRef({}); // Track markers by lock ID to avoid re-creation
  const cityMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const pendingOpenPopupLockIdRef = useRef(null); // Track which lock popup should stay open after selection/zoom
  const [mapReady, setMapReady] = useState(false);
  const [initialFitDone, setInitialFitDone] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger for auto-refresh
  const [lockStatusData, setLockStatusData] = useState({}); // Store lock status data by lockId
  const prevSelectedLockIdRef = useRef(null);
  const prevUserLocationRef = useRef(null);
  const prevMapStyleRef = useRef(mapStyle);
  const onLockSelectRef = useRef(onLockSelect);
  const selectedLockIdRef = useRef(selectedLockId);
  const selectedHydroRef = useRef(selectedHydro);
  const lockActivityByIdRef = useRef(lockActivityById);
  const currentRiverLevelRef = useRef(currentRiverLevel);
  const riverConditionLabelRef = useRef(riverConditionLabel);
  const weatherNowRef = useRef(weatherNow);

  useEffect(() => {
    onLockSelectRef.current = onLockSelect;
  }, [onLockSelect]);

  useEffect(() => {
    selectedLockIdRef.current = selectedLockId;
  }, [selectedLockId]);

  useEffect(() => {
    selectedHydroRef.current = selectedHydro;
  }, [selectedHydro]);

  useEffect(() => {
    lockActivityByIdRef.current = lockActivityById;
  }, [lockActivityById]);

  useEffect(() => {
    currentRiverLevelRef.current = currentRiverLevel;
  }, [currentRiverLevel]);

  useEffect(() => {
    riverConditionLabelRef.current = riverConditionLabel;
  }, [riverConditionLabel]);

  useEffect(() => {
    weatherNowRef.current = weatherNow;
  }, [weatherNow]);
  
  /**
   * Generate popup content HTML based on lock status state
   * Pure function, takes explicit parameters, no closure dependencies
   * Now supports cached data display with freshness indicator
   */
  const createPopupContent = (lockName, riverMile, currentState, queueLength, congestion, waitTime, towsLast24h, direction, lastPassage, color, cached = false, ageMinutes = null, floodStages = null, hydroGuidance = null, activity = null, env = null) => {
    const hasVerifiedTrafficMetrics = !!activity?.hasVerifiedTrafficMetrics;
    const isHydrologyEstimate = !!activity?.derivedFromHydrology;
    const hasCongestion = Number.isFinite(congestion);
    const units = floodStages?.units || 'ft';
    const formatStage = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'N/A';
      return Number.isInteger(n) ? `${n} ${units}` : `${n.toFixed(1)} ${units}`;
    };

    const floodStagesHtml = `
      <div style="border-top: 1px solid #475569; margin-top: 8px; padding-top: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: #93c5fd; margin-bottom: 4px;">NOAA Flood Stages</div>
        <div style="font-size: 11px; color: #e2e8f0;">Action Stage: <strong>${formatStage(floodStages?.action)}</strong></div>
        <div style="font-size: 11px; color: #e2e8f0;">Minor Flood Stage: <strong>${formatStage(floodStages?.minor)}</strong></div>
        <div style="font-size: 11px; color: #e2e8f0;">Moderate Flood Stage: <strong>${formatStage(floodStages?.moderate)}</strong></div>
        <div style="font-size: 11px; color: #e2e8f0;">Major Flood Stage: <strong>${formatStage(floodStages?.major)}</strong></div>
      </div>
    `;

    const guidanceUnits = hydroGuidance?.flowUnit || 'cfs';
    const guidanceFlood = Number(hydroGuidance?.floodStage);
    const guidanceFlow = Number(hydroGuidance?.flowValue);
    const guidanceFloodText = Number.isFinite(guidanceFlood)
      ? `${Number.isInteger(guidanceFlood) ? guidanceFlood : guidanceFlood.toFixed(1)} ft`
      : 'N/A';
    const guidanceFlowText = Number.isFinite(guidanceFlow)
      ? `${Math.round(guidanceFlow).toLocaleString()} ${guidanceUnits}`
      : 'N/A';
    const guidanceSourceText = hydroGuidance?.flowSource ? String(hydroGuidance.flowSource) : 'NOAA water.noaa.gov/gauges';

    const hydroGuidanceHtml = `
      <div style="border-top: 1px solid #475569; margin-top: 8px; padding-top: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: #86efac; margin-bottom: 4px;">Selected Station Guidance</div>
        <div style="font-size: 11px; color: #e2e8f0;">Flood Stage: <strong>${guidanceFloodText}</strong></div>
        <div style="font-size: 11px; color: #e2e8f0;">Flow Guidance: <strong>${guidanceFlowText}</strong></div>
        <div style="font-size: 10px; color: #94a3b8;">Source: ${guidanceSourceText}</div>
      </div>
    `;

    const envRiverLevel = Number(env?.riverLevel);
    const envRiverLevelText = Number.isFinite(envRiverLevel) ? `${envRiverLevel.toFixed(2)} ft` : 'N/A';
    const envConditionText = env?.riverConditionLabel || 'N/A';
    const envWind = Number(env?.windMph);
    const envWindText = Number.isFinite(envWind) ? `${envWind.toFixed(1)} mph` : 'N/A';
    const envWindDeg = Number(env?.windDeg);
    const hasWindDirection = Number.isFinite(envWindDeg);
    const windToDeg = hasWindDirection ? ((envWindDeg + 180 + 360) % 360) : null;
    const windDirLabel = (deg) => {
      if (!Number.isFinite(deg)) return 'N/A';
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
    };
    const envWindDirText = hasWindDirection ? `${windDirLabel(envWindDeg)} (${envWindDeg.toFixed(0)} deg)` : 'N/A';
    const windToText = Number.isFinite(windToDeg) ? `${windDirLabel(windToDeg)} (${windToDeg.toFixed(0)} deg)` : 'N/A';
    const envGust = Number(env?.windGustHighMph ?? env?.windGustMph);
    const envGustText = Number.isFinite(envGust) ? `${envGust.toFixed(1)} mph` : 'N/A';
    const envPrecip = Number(env?.precip);
    const envPrecipText = Number.isFinite(envPrecip) ? `${Math.round(envPrecip)}%` : 'N/A';
    const envTemp = Number(env?.tempF);
    const envTempText = Number.isFinite(envTemp) ? `${envTemp.toFixed(1)} deg F` : 'N/A';
    const envTempHigh = Number(env?.tempHighF);
    const envTempLow = Number(env?.tempLowF);
    const envTempRangeText = Number.isFinite(envTempHigh) && Number.isFinite(envTempLow)
      ? `H ${Math.round(envTempHigh)} deg / L ${Math.round(envTempLow)} deg`
      : 'N/A';
    const envForecastText = env?.shortForecast ? String(env.shortForecast) : 'N/A';
    const envForecastLower = envForecastText.toLowerCase();
    const weatherIcon = envForecastText === 'N/A'
      ? 'N/A'
      : (envForecastLower.includes('thunder') || envForecastLower.includes('tstorm'))
        ? '⛈'
        : (envForecastLower.includes('rain') || envForecastLower.includes('shower'))
          ? '🌧'
          : (envForecastLower.includes('snow') || envForecastLower.includes('flurr') || envForecastLower.includes('sleet') || envForecastLower.includes('freezing'))
            ? '🌨'
            : (envForecastLower.includes('fog') || envForecastLower.includes('mist'))
              ? '🌫'
              : (envForecastLower.includes('overcast') || envForecastLower.includes('cloudy'))
                ? '☁️'
                : (envForecastLower.includes('clear') || envForecastLower.includes('sunny'))
                  ? '☀️'
                  : (Number.isFinite(envPrecip) && envPrecip >= 50)
                    ? '🌧'
                    : (Number.isFinite(envPrecip) && envPrecip >= 20)
                      ? '☁️'
                      : '🌤';
    const windCompassHtml = hasWindDirection
      ? `
        <div style="width: 74px; min-width: 74px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;">
          <div style="position: relative; width: 64px; height: 64px; border: 1px solid rgba(255,255,255,0.35); border-radius: 9999px; color: #cbd5e1; font-size: 9px;">
            <span style="position: absolute; top: 2px; left: 50%; transform: translateX(-50%);">N</span>
            <span style="position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);">S</span>
            <span style="position: absolute; left: 3px; top: 50%; transform: translateY(-50%);">W</span>
            <span style="position: absolute; right: 3px; top: 50%; transform: translateY(-50%);">E</span>
            <div style="position: absolute; left: 50%; bottom: 50%; width: 2px; height: 25px; background: #22d3ee; border-radius: 9999px; transform-origin: bottom center; transform: translateX(-50%) rotate(${windToDeg}deg);"></div>
          </div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 3px; text-align: center; line-height: 1.2;">Blowing to</div>
          <div style="font-size: 9px; color: #e2e8f0; text-align: center; line-height: 1.2;">${windToText}</div>
          <div style="margin-top: 6px; display: flex; flex-direction: column; align-items: center;">
            <div style="font-size: 20px; line-height: 1;">${weatherIcon}</div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 2px; text-align: center; line-height: 1.2; max-width: 70px;">${envForecastText}</div>
          </div>
        </div>
      `
      : `
        <div style="width: 74px; min-width: 74px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; text-align: center;">
          Wind dir N/A
        </div>
      `;

    const gaugeDetailsHtml = (activity?.gaugeStage != null || activity?.gaugeFlow != null)
      ? `
      <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">
        ${activity?.gaugeStage != null ? `Stage: <strong>${Number(activity.gaugeStage).toFixed(2)} ${activity?.gaugeStageUnits || 'ft'}</strong>` : 'Stage unavailable'}
        ${activity?.gaugeFlow != null ? `&middot; Flow: <strong>${Number(activity.gaugeFlow).toFixed(1)} ${activity?.gaugeFlowUnits || 'kcfs'}</strong>` : ''}
      </div>
    `
      : '';

    const activityHtml = activity
      ? `
      <div style="border-top: 1px solid #475569; margin-top: 8px; padding-top: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: #facc15; margin-bottom: 4px;">River Danger Assessment</div>
        <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">
          Level: <strong style="color: ${activity.dangerColor || '#9ca3af'};">${activity.dangerLevel || 'Unknown'}</strong>
          ${activity.dangerScore != null ? `&middot; <strong>${activity.dangerScore}/100</strong>` : ''}
        </div>
        ${activity.dangerConfidence && activity.dangerConfidence !== 'Unknown'
          ? `<div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">Confidence: ${activity.dangerConfidence}</div>`
          : ''}
        ${activity.dangerFactors?.length > 0
          ? `<div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">${activity.dangerFactors.join(' &middot; ')}</div>`
          : ''}
        ${gaugeDetailsHtml}
        ${hasVerifiedTrafficMetrics ? `
          <div style="font-size: 11px; color: #e2e8f0; margin-top: 4px;">Queue: <strong>${activity.queueCount ?? 'N/A'} tows</strong></div>
          <div style="font-size: 11px; color: #e2e8f0;">Wait: <strong>${activity.waitMinutes ?? 'N/A'} min</strong></div>
          <div style="font-size: 11px; color: #e2e8f0;">Last 24h: <strong>${activity.passages24h ?? 'N/A'} passages</strong></div>
          ${activity.lastPassage ? `<div style="font-size: 10px; color: #94a3b8;">Last passage: ${new Date(activity.lastPassage).toLocaleTimeString()}</div>` : ''}
          ${activity.direction ? `<div style="font-size: 10px; color: #94a3b8;">Traffic direction: ${activity.direction}</div>` : ''}
        ` : ''}
        ${!hasVerifiedTrafficMetrics && activity.estimatedWaitRange
          ? `<div style="font-size: 11px; color: #e2e8f0; margin-top: 4px;">Est. Wait: <strong>${activity.estimatedWaitRange}</strong> <span style="font-size: 10px; color: #94a3b8;">(model)</span></div>`
          : ''}
        <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Source: ${activity.sourceTag === 'EST' ? 'NOAA gauge estimate' : (activity.sourceTag || 'N/A')}</div>
      </div>
    `
      : '';

    const envHtml = `
      <div style="border-top: 1px solid #475569; margin-top: 8px; padding-top: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: #a7f3d0; margin-bottom: 4px;">River Weather</div>
        <div style="display: flex; gap: 8px; align-items: flex-start; justify-content: space-between;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 11px; color: #e2e8f0;">River Level: <strong>${envRiverLevelText}</strong></div>
            <div style="font-size: 11px; color: #e2e8f0;">Current Conditions: <strong>${envConditionText}</strong></div>
            <div style="font-size: 11px; color: #e2e8f0;">Temp: <strong>${envTempText}</strong></div>
            <div style="font-size: 11px; color: #e2e8f0;">Today: <strong>${envTempRangeText}</strong></div>
            <div style="font-size: 11px; color: #e2e8f0;">Wind: <strong>${envWindText}</strong> (Gusts <strong>${envGustText}</strong>)</div>
            <div style="font-size: 10px; color: #94a3b8;">Direction: ${envWindDirText}</div>
            <div style="font-size: 10px; color: #94a3b8;">Precip Chance: ${envPrecipText}</div>
            <div style="font-size: 10px; color: #94a3b8;">Forecast: ${envForecastText}</div>
          </div>
          ${windCompassHtml}
        </div>
      </div>
    `;

    if (currentState === 'not_loaded') {
      return `
        <div style="background: #1e293b; color: white; padding: 12px; border-radius: 8px; max-width: 280px; max-height: min(52vh, 420px); overflow-y: auto; font-size: 12px;">
          <div style="margin-bottom: 8px;">
            <h3 style="margin: 0; color: #06b6d4; font-size: 14px;">${lockName}</h3>
          </div>
          <div style="border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
            <div>📍 River Mile: ${riverMile}</div>
          </div>
          <div style="padding: 8px 0; color: #cbd5e1; text-align: center;">
            Status not loaded yet. Click to load.
          </div>
          ${activityHtml}
          ${envHtml}
          ${floodStagesHtml}
          ${hydroGuidance ? hydroGuidanceHtml : ''}
        </div>
      `;
    } else if (currentState === 'loading') {
      return `
        <div style="background: #1e293b; color: white; padding: 12px; border-radius: 8px; max-width: 280px; max-height: min(52vh, 420px); overflow-y: auto; font-size: 12px;">
          <div style="margin-bottom: 8px;">
            <h3 style="margin: 0; color: #06b6d4; font-size: 14px;">${lockName}</h3>
          </div>
          <div style="border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
            <div>📍 River Mile: ${riverMile}</div>
          </div>
          <div style="padding: 8px 0; color: #cbd5e1; text-align: center;">
            ⏳ Loading status...
          </div>
          ${activityHtml}
          ${envHtml}
          ${floodStagesHtml}
          ${hydroGuidance ? hydroGuidanceHtml : ''}
        </div>
      `;
    } else if (currentState === 'unavailable') {
      return `
        <div style="background: #1e293b; color: white; padding: 12px; border-radius: 8px; max-width: 280px; max-height: min(52vh, 420px); overflow-y: auto; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3 style="margin: 0; color: #06b6d4; font-size: 14px;">${lockName}</h3>
            <span style="background: #9ca3af; padding: 2px 6px; border-radius: 4px; font-size: 9px;">UNAVAILABLE</span>
          </div>
          <div style="border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
            <div>📍 River Mile: ${riverMile}</div>
          </div>
          <div style="padding: 8px 0; color: #cbd5e1;">
            Lock status data is currently unavailable from USACE sources.
          </div>
          <div style="font-size: 10px; color: #94a3b8;">
            Try refreshing the page in a moment.
          </div>
          ${activityHtml}
          ${envHtml}
          ${floodStagesHtml}
          ${hydroGuidance ? hydroGuidanceHtml : ''}
        </div>
      `;
    } else { // live
      const liveActivity = activity || null;
      // Determine badge based on cached status
      let badgeHTML = '<span style="background: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 9px;">VERIFIED STATUS</span>';
      if (cached && ageMinutes !== null) {
        badgeHTML = `<span style="background: #d97706; padding: 2px 6px; border-radius: 4px; font-size: 9px;">LAST VERIFIED ${ageMinutes} MIN AGO</span>`;
      }
      
      return `
        <div style="background: #1e293b; color: white; padding: 12px; border-radius: 8px; max-width: 280px; max-height: min(52vh, 420px); overflow-y: auto; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3 style="margin: 0; color: #06b6d4; font-size: 14px;">${lockName}</h3>
            ${badgeHTML}
          </div>
          <div style="border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
            <div>📍 River Mile: ${riverMile}</div>
            ${liveActivity?.dangerLevel && liveActivity.dangerLevel !== 'Unknown'
              ? `<div style="margin-top: 3px;">⚠️ Danger: <strong style="color: ${liveActivity.dangerColor};">${liveActivity.dangerLevel}</strong>${liveActivity.dangerScore != null ? ` (${liveActivity.dangerScore}/100)` : ''}</div>`
              : ''}
          </div>
          ${activityHtml}
          ${envHtml}
          ${floodStagesHtml}
          ${hydroGuidance ? hydroGuidanceHtml : ''}
        </div>
      `;
    }
  };
  
  /**
   * Fetch a single lock's status on demand and update state
   * This is called only when a lock is clicked or selected from parent
   */
  const fetchAndUpdateLockStatus = useCallback(async (lock) => {
    const result = await fetchLockStatus(lock.id, lock.name);
    setLockStatusData(prev => ({
      ...prev,
      [lock.id]: result
    }));
  }, []);
  
  // Auto-refresh markers every 5 minutes to keep data in sync with dropdown
  // FIXED: Add proper dependency array
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 300000); // 5 minutes
    
    return () => clearInterval(refreshInterval);
  }, []); // Run once - no dependencies needed

  // Initialize map using Leaflet - only once
  // FIXED: Proper cleanup and no dependencies
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Dynamically load Leaflet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.async = true;
    script.onload = () => {
      const L = window.L;
      
      // Check if map container is already initialized (React Strict Mode double mount)
      if (mapContainer.current._leaflet_id) {
        return;
      }

      // Create map - view will be set after loading river data
      map.current = L.map(mapContainer.current, { 
        zoomControl: true,
        attributionControl: false // Hide Leaflet attribution
      }).setView([38.7, -84.5], 7); // Temporary initial view - will fit to river bounds after load

      // Determine which tile layer to use based on mapStyle
      let tileUrl, tileOptions;
      
      if (mapStyle === 'topo') {
        // OpenTopoMap - shows terrain, contours, and elevation
        tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
        tileOptions = {
          attribution: '',
          maxZoom: 17,
        };
      } else if (mapStyle === 'dark') {
        // CartoDB Dark Matter theme
        tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        tileOptions = {
          attribution: '',
          maxZoom: 19,
        };
      } else {
        // Default OpenStreetMap
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        tileOptions = {
          attribution: '',
          maxZoom: 18,
        };
      }

      // Add tile layer
      tileLayerRef.current = L.tileLayer(tileUrl, tileOptions).addTo(map.current);

      // Load Ohio River channel data from API - use requestIdleCallback for better performance
      const loadRiverData = () => {
        fetch(`/api/river-outline?t=${Date.now()}`, { cache: 'no-store' })
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then((data) => {
            if (!data || !data.success || !data.elements || data.elements.length === 0) {
              return;
            }

            const elements = Array.isArray(data.elements) ? data.elements : [];

            // Clear any existing river lines
            riverLinesRef.current.forEach(line => {
              if (map.current && line) {
                try {
                  map.current.removeLayer(line);
                } catch (e) {}
              }
            });
            riverLinesRef.current = [];
            riverCoordinatesRef.current = []; // Reset coordinates
            
            // Process each element and create polylines
            elements.forEach((el, idx) => {
              try {
                if (el.type === 'way' && el.coordinates && Array.isArray(el.coordinates) && el.coordinates.length > 1) {
                  // Validate coordinates before creating polyline
                  const validCoords = el.coordinates.filter(coord => {
                    return Array.isArray(coord) && coord.length >= 2 && 
                      typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                      isFinite(coord[0]) && isFinite(coord[1]);
                  });

                  if (validCoords.length > 1) {
                    // Store all river coordinates for city snapping
                    riverCoordinatesRef.current.push(...validCoords);
                    
                    const line = L.polyline(validCoords, {
                      color: el.color || '#06b6d4',
                      weight: el.weight || 4,
                      opacity: el.opacity || 0.9,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }).addTo(map.current);

                    riverLinesRef.current.push(line);
                  }
                }
              } catch (segmentErr) {}
            });

            // Trigger city markers to refresh after river coordinates load
            try {
              setRefreshTrigger(prev => prev + 1);
            } catch {}
            
            // Fit map to show all river segments on initial load
            if (!initialFitDone && riverLinesRef.current.length > 0) {
              try {
                // Create a feature group from all polylines to get combined bounds
                const group = L.featureGroup(riverLinesRef.current);
                const bounds = group.getBounds();
                
                // Check if bounds are valid using Leaflet's method
                if (bounds && bounds.isValid && bounds.isValid()) {
                  // Fit to entire Ohio River (Pittsburgh to Cairo) with appropriate zoom
                  map.current.fitBounds(bounds, { 
                    padding: [30, 30], // Smaller padding for better fit
                    maxZoom: 9, // Max zoom 9 to ensure entire river is visible
                    animate: false // No animation on initial load for immediate display
                  });

                  setInitialFitDone(true);
                } else {
                  setInitialFitDone(true);
                }
              } catch (fitErr) {
                setInitialFitDone(true);
              }
            }
          })
          .catch((err) => {});
      };

      // Use requestIdleCallback to defer heavy work if available
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(loadRiverData, { timeout: 2000 });
      } else {
        setTimeout(loadRiverData, 100);
      }

      setMapReady(true);
    };

    document.body.appendChild(script);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // FIXED: Empty dependency - only initialize once

  // Handle map style changes dynamically
  useEffect(() => {
    if (!map.current || !window.L || !mapReady || !tileLayerRef.current) return;
    if (prevMapStyleRef.current === mapStyle) return;

    const L = window.L;
    
    // Remove old tile layer
    map.current.removeLayer(tileLayerRef.current);
    
    // Determine new tile layer
    let tileUrl, tileOptions;
    
    if (mapStyle === 'topo') {
      // OpenTopoMap - shows terrain, contours, and elevation
      tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      tileOptions = {
        attribution: '',
        maxZoom: 17,
      };
    } else if (mapStyle === 'dark') {
      // CartoDB Dark Matter theme
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      tileOptions = {
        attribution: '',
        maxZoom: 19,
      };
    } else {
      // Default OpenStreetMap
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      tileOptions = {
        attribution: '',
        maxZoom: 18,
      };
    }
    
    // Add new tile layer
    tileLayerRef.current = L.tileLayer(tileUrl, tileOptions).addTo(map.current);
    prevMapStyleRef.current = mapStyle;
  }, [mapStyle, mapReady]);

  // Add/update lock markers when lock list changes.
  // Marker/icon/popup content updates are handled by dedicated effects below.
  useEffect(() => {
    if (!map.current || !window.L || !mapReady) return;
    
    const L = window.L;
    
    // Clear existing markers - only when locks array actually changes
    markersRef.current.forEach(marker => {
      map.current.removeLayer(marker);
    });
    markersRef.current = [];
    markersByLockIdRef.current = {};
    
    // Add locks as markers
    locks.forEach((lock) => {
      // Determine initial state (not_loaded or loading)
      const isLoading = getInFlightRequest(lock.id, lock.name) !== null;
      const state = isLoading ? 'loading' : 'not_loaded';

      const derivedActivity = lockActivityByIdRef.current?.[lock.id] || null;
      const color = derivedActivity?.markerColor || (state === 'loading' ? '#60a5fa' : '#d1d5db');

      // Create custom icon with colored background
      const icon = buildLockIcon(L, color);

      // Add marker
      const marker = L.marker([lock.lat, lock.lon], { icon }).addTo(map.current);
      markersRef.current.push(marker);
      markersByLockIdRef.current[lock.id] = marker;

      // Set initial popup content (not_loaded or loading state)
      const baseActivity = lockActivityByIdRef.current?.[lock.id] || null;
      const popupContent = createPopupContent(
        lock.name,
        lock.riverMile,
        state,
        null, null, null, null, null, null,
        color,
        false,
        null,
        lock.floodStages ?? null,
        lock.id === selectedLockIdRef.current ? selectedHydroRef.current : null,
        baseActivity,
        {
          riverLevel: currentRiverLevelRef.current,
          riverConditionLabel: riverConditionLabelRef.current,
          tempF: weatherNowRef.current?.tempF,
          tempHighF: weatherNowRef.current?.tempHighF,
          tempLowF: weatherNowRef.current?.tempLowF,
          windMph: weatherNowRef.current?.windMph,
          windDeg: weatherNowRef.current?.windDeg,
          windGustMph: weatherNowRef.current?.windGustMph,
          windGustHighMph: weatherNowRef.current?.windGustHighMph,
          precip: weatherNowRef.current?.precip,
          shortForecast: weatherNowRef.current?.shortForecast,
        }
      );
      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'lock-popup',
        autoPan: true,
        keepInView: true,
        autoPanPaddingTopLeft: [20, 20],
        autoPanPaddingBottomRight: [20, 30],
      });

      // When marker is clicked:
      // 1. If not loaded yet, fetch the status
      // 2. Always open the popup with appropriate content
      marker.on('click', async () => {
        // Get current status
        const statusResult = lockStatusData[lock.id];
        const isLoaded = statusResult !== undefined;
        const isCurrentlyLoading = getInFlightRequest(lock.id, lock.name) !== null;
        const baseActivity = lockActivityByIdRef.current?.[lock.id] || null;

        // Determine what to show in popup right now
        let currentState = 'not_loaded';
        let currentColor = '#d1d5db';
        
        if (isCurrentlyLoading) {
          currentState = 'loading';
          currentColor = '#60a5fa';
        } else if (isLoaded) {
          if (statusResult?.available && statusResult?.data) {
            currentState = 'live';
            currentColor = baseActivity?.dangerColor || '#9ca3af';
          } else {
            currentState = 'unavailable';
            currentColor = '#9ca3af';
          }
        }

        // Set popup content to current state and open it immediately
        const currentPopupContent = createPopupContent(
          lock.name,
          lock.riverMile,
          currentState,
          null,
          isLoaded ? statusResult?.data?.congestion ?? baseActivity?.congestion ?? null : baseActivity?.congestion ?? null,
          null,
          null,
          null,
          null,
          currentColor,
          isLoaded ? statusResult?.cached ?? false : false,
          isLoaded ? statusResult?.ageMinutes ?? null : null,
          lock.floodStages ?? null,
          lock.id === selectedLockIdRef.current ? selectedHydroRef.current : null,
          baseActivity,
          {
            riverLevel: currentRiverLevelRef.current,
            riverConditionLabel: riverConditionLabelRef.current,
            tempF: weatherNowRef.current?.tempF,
            tempHighF: weatherNowRef.current?.tempHighF,
            tempLowF: weatherNowRef.current?.tempLowF,
            windMph: weatherNowRef.current?.windMph,
            windDeg: weatherNowRef.current?.windDeg,
            windGustMph: weatherNowRef.current?.windGustMph,
            windGustHighMph: weatherNowRef.current?.windGustHighMph,
            precip: weatherNowRef.current?.precip,
            shortForecast: weatherNowRef.current?.shortForecast,
          }
        );
        marker.setPopupContent(currentPopupContent);
        marker.openPopup(); // Open popup immediately for user feedback

        // Remember that this popup should stay open after selection/zoom
        pendingOpenPopupLockIdRef.current = lock.id;

        // Trigger parent callback to update dropdown selection and zoom
        if (typeof onLockSelectRef.current === 'function') {
          onLockSelectRef.current(lock.id);
        }

        // If not yet loaded and not currently loading, fetch new data
        if (!isLoaded && !isCurrentlyLoading) {
          // Fetch and update state
          const result = await fetchLockStatus(lock.id, lock.name);
          setLockStatusData(prev => ({
            ...prev,
            [lock.id]: result
          }));
          
          // Update popup with new state (will be "unavailable" or "live")
          const newState = result?.available && result?.data ? 'live' : 'unavailable';
          
          // Determine color for new state
          let newColor = '#9ca3af'; // Default to gray for unavailable
          if (newState === 'live' && result?.data) {
            newColor = baseActivity?.dangerColor || '#9ca3af';
          }
          
          const newPopupContent = createPopupContent(
            lock.name,
            lock.riverMile,
            newState,
            null,
            result?.data?.congestion ?? baseActivity?.congestion ?? null,
            null,
            null,
            null,
            null,
            newColor,
            result?.cached ?? false,
            result?.ageMinutes ?? null,
            lock.floodStages ?? null,
            lock.id === selectedLockIdRef.current ? selectedHydroRef.current : null,
            baseActivity,
            {
              riverLevel: currentRiverLevelRef.current,
              riverConditionLabel: riverConditionLabelRef.current,
              tempF: weatherNowRef.current?.tempF,
              tempHighF: weatherNowRef.current?.tempHighF,
              tempLowF: weatherNowRef.current?.tempLowF,
              windMph: weatherNowRef.current?.windMph,
              windDeg: weatherNowRef.current?.windDeg,
              windGustMph: weatherNowRef.current?.windGustMph,
              windGustHighMph: weatherNowRef.current?.windGustHighMph,
              precip: weatherNowRef.current?.precip,
              shortForecast: weatherNowRef.current?.shortForecast,
            }
          );
          marker.setPopupContent(newPopupContent);
          
          // Ensure popup stays open after fetch completes
          if (!marker.isPopupOpen()) {
            marker.openPopup();
          }
        }
      });
    });
  }, [locks, mapReady, refreshTrigger]);

  // Update lock marker popups when lockStatusData changes (without recreating markers)
  useEffect(() => {
    if (!map.current || !window.L || !mapReady) return;
    
    // For each lock that has new status data, update its marker's popup content
    locks.forEach((lock) => {
      const marker = markersByLockIdRef.current[lock.id];
      if (!marker) return; // Marker not yet created
      
      const statusResult = lockStatusData[lock.id];
      const isLoading = !statusResult && getInFlightRequest(lock.id, lock.name) !== null;
      
      let state = 'not_loaded';
      let congestion = null;
      let color = '#d1d5db';

      if (isLoading) {
        state = 'loading';
        color = '#60a5fa';
      } else if (statusResult) {
        if (statusResult?.available && statusResult?.data) {
          state = 'live';
          congestion = statusResult.data.congestion ?? lockActivityById[lock.id]?.congestion ?? null;
          color = lockActivityById[lock.id]?.dangerColor || '#9ca3af';
        } else {
          state = 'unavailable';
          color = '#9ca3af';
        }
      }

      // Update popup content in-place without recreating marker
      const baseActivity = lockActivityById[lock.id] || null;
      const newPopupContent = createPopupContent(
        lock.name,
        lock.riverMile,
        state,
        null,
        congestion,
        null,
        null,
        null,
        null,
        color,
        statusResult?.cached ?? false,
        statusResult?.ageMinutes ?? null,
        lock.floodStages ?? null,
        lock.id === selectedLockId ? selectedHydro : null,
        baseActivity,
        {
          riverLevel: currentRiverLevel,
          riverConditionLabel,
          tempF: weatherNow?.tempF,
          tempHighF: weatherNow?.tempHighF,
          tempLowF: weatherNow?.tempLowF,
          windMph: weatherNow?.windMph,
          windDeg: weatherNow?.windDeg,
          windGustMph: weatherNow?.windGustMph,
          windGustHighMph: weatherNow?.windGustHighMph,
          precip: weatherNow?.precip,
          shortForecast: weatherNow?.shortForecast,
        }
      );
      marker.setPopupContent(newPopupContent);

    });
  }, [lockStatusData, lockActivityById, locks, mapReady, selectedLockId, selectedHydro, currentRiverLevel, riverConditionLabel, weatherNow?.windMph, weatherNow?.shortForecast]);

  useEffect(() => {
    if (!map.current || !window.L || !mapReady) return;

    locks.forEach((lock) => {
      const marker = markersByLockIdRef.current[lock.id];
      if (!marker) return;

      const activity = lockActivityById[lock.id];
      const markerColor = activity?.dangerColor || activity?.markerColor || '#9ca3af';
      marker.setIcon(buildLockIcon(window.L, markerColor));
    });
  }, [lockActivityById, locks, mapReady]);


  // Add city/township markers (non-L&D stations)
  // FIXED: Add proper dependency array and memoize filtering
  useEffect(() => {
    if (!map.current || !window.L || !mapReady || !stations || stations.length === 0) return;
    if (riverCoordinatesRef.current.length === 0) return; // Wait for river data
    
    const L = window.L;
    
    // Clear existing city markers
    cityMarkersRef.current.forEach(marker => {
      map.current.removeLayer(marker);
    });
    cityMarkersRef.current = [];
    
    // Filter out stations with "L&D" in their name (those are already shown as lock markers)
    const cityStations = stations.filter(station => {
      const hasLD = station && station.name && station.name.includes('L&D');
      return !hasLD;
    });
    
    // Helper function to find nearest river point
    const findNearestRiverPoint = (lat, lon) => {
      let nearestPoint = null;
      let minDistance = Infinity;
      
      riverCoordinatesRef.current.forEach(coord => {
        const distance = Math.sqrt(
          Math.pow((coord[0] - lat) * 69, 2) + // 69 miles per degree latitude
          Math.pow((coord[1] - lon) * 54 * Math.cos(lat * Math.PI / 180), 2) // longitude adjusted for latitude
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = coord;
        }
      });
      
      return { point: nearestPoint, distance: minDistance };
    };
    
    // Add city markers
    cityStations.forEach((city) => {
      // Find nearest river point to snap to
      const { point: riverPoint, distance } = findNearestRiverPoint(city.lat, city.lon);
      
      if (!riverPoint || distance > 20) {
        return; // Skip if no river point found or too far (>20 miles)
      }
      
      // Use river point for marker placement (snap to river)
      const [snapLat, snapLon] = riverPoint;
      
      // Create custom icon - half size of lock markers with dark background
      const icon = L.divIcon({
        html: `
          <div style="
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            background: #1e293b;
            border: 2px solid #06b6d4;
            border-radius: 50%;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5);
            cursor: pointer;
          " title="${city.name}">
            <img src="/city-hall-icon.svg" style="width: 10px; height: 10px;" alt="City" />
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
        className: 'city-marker',
      });

      // Add marker at snapped river position
      const marker = L.marker([snapLat, snapLon], { icon }).addTo(map.current);
      cityMarkersRef.current.push(marker);

      // Create popup content with dark theme and placeholders for level/temp
      const popupContent = `
        <div style="background: #1e293b; color: white; padding: 12px; border-radius: 8px; max-width: 260px; font-size: 12px; border: 1px solid #475569;">
          <h3 style="margin: 0 0 8px 0; color: #06b6d4; font-size: 14px; font-weight: bold;">🏛️ ${city.name}</h3>
          <div style="border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
            <div style="margin-bottom: 4px;">📍 River Mile: <strong>${city.riverMile || 'N/A'}</strong></div>
            <div style="margin-bottom: 4px;">📊 Station ID: <strong>${city.id}</strong></div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
            <div>🌊 Level: <strong>—</strong></div>
            <div>🌡 Temp: <strong>—</strong></div>
          </div>
          <div style="font-size: 11px; color: #94a3b8;">City monitoring station on Ohio River</div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 260,
        className: 'city-popup',
        closeButton: true,
        autoPan: true
      });

      // Fetch level and temperature when popup opens
      marker.on('popupopen', async () => {
        try {
          const levelUrl = `/api/river-data?site=${encodeURIComponent(city.id)}&lat=${city.lat}&lon=${city.lon}`;
          const wxUrl = `/api/weather?lat=${city.lat}&lon=${city.lon}`;
          const [levelRes, wxRes] = await Promise.allSettled([
            fetch(levelUrl),
            fetch(wxUrl)
          ]);

          let levelFt = null;
          if (levelRes.status === 'fulfilled' && levelRes.value.ok) {
            const j = await levelRes.value.json();
            levelFt = typeof j?.observed === 'number' ? j.observed : null;
          }
          let tempF = null;
          if (wxRes.status === 'fulfilled' && wxRes.value.ok) {
            const wj = await wxRes.value.json();
            tempF = typeof wj?.tempF === 'number' ? wj.tempF : (wj?.current?.tempF ?? null);
          }

          const updated = `
            <div style="background: #1e293b; color: white; padding: 12px; border-radius: 8px; max-width: 260px; font-size: 12px; border: 1px solid #475569;">
              <h3 style="margin: 0 0 8px 0; color: #06b6d4; font-size: 14px; font-weight: bold;">🏛️ ${city.name}</h3>
              <div style="border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
                <div style="margin-bottom: 4px;">📍 River Mile: <strong>${city.riverMile || 'N/A'}</strong></div>
                <div style="margin-bottom: 4px;">📊 Station ID: <strong>${city.id}</strong></div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px;">
                <div>🌊 Level: <strong>${levelFt != null ? `${levelFt.toFixed(2)} ft` : '—'}</strong></div>
                <div>🌡 Temp: <strong>${tempF != null ? `${Math.round(tempF)} °F` : '—'}</strong></div>
              </div>
              <div style="font-size: 11px; color: #94a3b8;">City monitoring station on Ohio River</div>
            </div>
          `;
          try { marker.setPopupContent(updated); } catch {}
        } catch (e) {}
      });

      // Notify parent if onClick is provided
      marker.on('click', () => {
        if (typeof onLockSelectRef.current === 'function') {
          onLockSelectRef.current(city.id);
        }
      });
    });
  }, [stations, mapReady, refreshTrigger]); // FIXED: Proper dependency array

  // Handle zoom to selected lock OR city
  // FIXED: Add proper dependency array
  useEffect(() => {
    if (!map.current || !window.L || !mapReady || !selectedLockId) return;
    
    // Only zoom if selection actually changed
    if (prevSelectedLockIdRef.current === selectedLockId) return;
    prevSelectedLockIdRef.current = selectedLockId;
    
    // Look for city first, then lock
    let selectedItem = Array.isArray(stations) ? stations.find(s => s.id === selectedLockId) : null;
    if (!selectedItem) {
      selectedItem = Array.isArray(locks) ? locks.find(lock => lock.id === selectedLockId) : null;
    }
    
    if (selectedItem) {
      const L = window.L;
      // Same zoom envelope as Find Me: about 5 miles each direction
      const mileOffset = 0.093; // ~5 miles in longitude degrees at river latitude
      const latOffset = 0.036;
      const bounds = L.latLngBounds(
        [selectedItem.lat - latOffset, selectedItem.lon - mileOffset],
        [selectedItem.lat + latOffset, selectedItem.lon + mileOffset]
      );
      try {
        map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12, animate: true, duration: 0.5 });
      } catch (fitErr) {
        map.current.setView([selectedItem.lat, selectedItem.lon], 11, { animate: true, duration: 0.5 });
      }
    }
  }, [selectedLockId, locks, stations, mapReady]); // FIXED: Proper dependency array

  // Re-open pending lock popup after selection/zoom settles
  // This ensures popup survives the fitBounds/setView that happens after onLockSelect
  useEffect(() => {
    if (!map.current || !window.L || !mapReady) return;
    
    const pendingId = pendingOpenPopupLockIdRef.current;
    if (!pendingId) return;
    
    const marker = markersByLockIdRef.current[pendingId];
    if (!marker) return;
    
    // Wait for fitBounds/setView to complete before reopening (animation is 0.5s, so 250ms is safe)
    const timeoutId = setTimeout(() => {
      try {
        marker.openPopup();
        pendingOpenPopupLockIdRef.current = null;
      } catch (e) {}
    }, 250);
    
    return () => clearTimeout(timeoutId);
  }, [selectedLockId, mapReady, lockStatusData, locks]);

  // Handle zoom to user location when "Find Me" is clicked
  // FIXED: Add proper dependency array
  useEffect(() => {
    if (!map.current || !window.L || !mapReady) return;
    
    const L = window.L;
    
    // Remove previous user marker if exists
    if (userMarkerRef.current) {
      try {
        map.current.removeLayer(userMarkerRef.current);
      } catch (e) {}
      userMarkerRef.current = null;
    }
    
    // If no user location, stop here (marker already removed)
    if (!userLocation) {
      prevUserLocationRef.current = null; // Reset so next location will be added
      return;
    }
    
    // Only zoom if location actually changed
    if (prevUserLocationRef.current?.lat === userLocation.lat && 
        prevUserLocationRef.current?.lon === userLocation.lon) return;
    prevUserLocationRef.current = userLocation;
    
    const { lat, lon } = userLocation;
    
    // Check if user is within 1 mile of river (simplified check)
    let distanceToRiver = Infinity;
    
    try {
      if (riverLinesRef.current && Array.isArray(riverLinesRef.current) && riverLinesRef.current.length > 0) {
        distanceToRiver = riverLinesRef.current.reduce((minDist, line) => {
          try {
            if (!line || typeof line.getLatLngs !== 'function') return minDist;
            
            const lineMinDist = line.getLatLngs().reduce((dist, point) => {
              if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return dist;
              
              const d = Math.sqrt(
                Math.pow((point.lat - lat) * 69, 2) + // 69 miles per degree latitude
                Math.pow((point.lng - lon) * 54 * Math.cos(lat * Math.PI / 180), 2) // 54 miles per degree longitude at this latitude
              );
              return Math.min(dist, d);
            }, Infinity);
            return Math.min(minDist, lineMinDist);
          } catch (lineErr) {
            return minDist;
          }
        }, Infinity);
      }
    } catch (err) {
      distanceToRiver = Infinity;
    }
    
    // Always add a cyan dot marker for user location
    try {
      userMarkerRef.current = L.marker([lat, lon], {
        icon: L.divIcon({
          html: '<div style="width: 12px; height: 12px; background: #06b6d4; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          className: 'user-location-marker'
        })
      }).addTo(map.current);
    } catch (markerErr) {
      return;
    }
    
    if (distanceToRiver <= 1) {
      // User is within 1 mile of river, zoom to show 5 miles on each side
      try {
        const mileOffset = 0.093; // 5 miles in longitude degrees at Ohio River latitude
        const latOffset = 0.036;
        const bounds = L.latLngBounds(
          [lat - latOffset, lon - mileOffset],
          [lat + latOffset, lon + mileOffset]
        );
        map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12, animate: true, duration: 0.5 });
      } catch (fitErr) {
        try {
          map.current.setView([lat, lon], 10, { animate: true, duration: 0.5 });
        } catch (viewErr) {}
      }
    } else {
      // Zoom to show user location even if not near river
      try {
        map.current.setView([lat, lon], 10, { animate: true, duration: 0.5 });
      } catch (viewErr) {}
    }
  }, [userLocation, mapReady]); // FIXED: Proper dependency array

  return (
    <div className="w-full">
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '500px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      />

      <div className="text-xs text-white/80 bg-slate-900/95 p-2.5 rounded border border-white/10">
        <p className="text-white/60 text-[10px]">
          <strong>Data Sources:</strong> Lock status uses USACE CWMS when available. Gauge stage/flow/trend come from NOAA NWPS gauge feeds. Weather inputs come from selected-station forecast/observation data (NWS with Open-Meteo fallback). Danger levels and estimated wait are model outputs for trip planning and are not measured queue telemetry.
        </p>
      </div>

      <style jsx>{`
        :global(.lock-popup .leaflet-popup-content) {
          margin: 0;
          padding: 0;
        }
        :global(.lock-popup .leaflet-popup-content-wrapper) {
          background: #1e293b;
          border: 1px solid #475569;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
        }
        :global(.lock-popup .leaflet-popup-tip) {
          background: #1e293b;
          border-left-color: #1e293b;
          border-right-color: #1e293b;
        }
        :global(.city-popup .leaflet-popup-content) {
          margin: 0;
          padding: 0;
        }
        :global(.city-popup .leaflet-popup-content-wrapper) {
          background: #1e293b;
          border: 1px solid #06b6d4;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
        }
        :global(.city-popup .leaflet-popup-tip) {
          background: #1e293b;
          border-left-color: #1e293b;
          border-right-color: #1e293b;
        }
      `}</style>
    </div>
  );
}
