/**
 * AQI API — Air Quality Index data
 * 
 * Primary provider: AirNow (US EPA data)
 * Requires: AIRNOW_API_KEY environment variable
 * 
 * OpenAQ v2 has been deprecated. OpenAQ v3 integration
 * should be added separately when stable.
 * 
 * Returns 200 for expected unavailable states.
 */

const AQI_LABELS = [
  { max: 50, label: "Good" },
  { max: 100, label: "Moderate" },
  { max: 150, label: "USG" },
  { max: 200, label: "Unhealthy" },
  { max: 300, label: "VeryUnhealthy" },
  { max: 500, label: "Hazardous" },
];

function getCategory(aqi) {
  if (aqi == null) return "Unknown";
  return AQI_LABELS.find((l) => aqi <= l.max)?.label ?? "Hazardous";
}

function unavailableBody(reason, message = "Air quality unavailable") {
  return {
    available: false,
    reason,
    message,
  };
}

async function fetchAirNow(lat, lon) {
  const key = process.env.AIRNOW_API_KEY;
  if (!key) {
    return unavailableBody("missing_api_key");
  }

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000); // 10 second timeout

    const url = `https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude=${lat}&longitude=${lon}&distance=25&API_KEY=${key}`;
    const response = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        return unavailableBody("rate_limited");
      }
      return unavailableBody("upstream_unavailable");
    }

    const data = await response.json();
    if (Array.isArray(data) && data[0]?.AQI != null) {
      const aqiValue = parseFloat(data[0].AQI);
      if (Number.isFinite(aqiValue)) {
        return {
          available: true,
          aqi: aqiValue,
          category: getCategory(aqiValue),
          source: "AirNow",
        };
      }
    }
    return unavailableBody("invalid_response");
  } catch {
    return unavailableBody("upstream_unavailable");
  }
}

export default async function handler(req, res) {
  // GET-only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { lat, lon } = req.query;

  // Validate required parameters
  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon" });
  }

  // Validate lat/lon are numbers
  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);

  if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
    return res.status(400).json({ error: "Invalid lat/lon format" });
  }

  // Validate geographic ranges
  if (userLat < -90 || userLat > 90) {
    return res.status(400).json({ error: "Latitude must be between -90 and 90" });
  }

  if (userLon < -180 || userLon > 180) {
    return res.status(400).json({ error: "Longitude must be between -180 and 180" });
  }

  try {
    const result = await fetchAirNow(userLat, userLon);

    if (result?.available === true) {
      return res.status(200).json(result);
    }

    // All known AQI unavailability paths are expected and should be quiet in browser devtools.
    if (result?.available === false) {
      return res.status(200).json(result);
    }

    // Defensive fallback for malformed internal return values.
    return res.status(500).json(unavailableBody("upstream_unavailable"));
  } catch {
    return res.status(500).json(unavailableBody("upstream_unavailable"));
  }
}
