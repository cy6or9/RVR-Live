/**
 * WEATHER API — Unified format for UI
 * Uses Open-Meteo (free, no key required)
 * Returns: tempF, windSpeed, windDir, windCompass, summary
 */

function windDirToCompass(deg) {
  if (isNaN(deg)) return "";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
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

  // Validate that they are numbers
  const latNum = Number(lat);
  const lonNum = Number(lon);
  
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return res.status(400).json({ error: "Invalid lat/lon format" });
  }

  // Validate ranges
  if (latNum < -90 || latNum > 90) {
    return res.status(400).json({ error: "Latitude must be between -90 and 90" });
  }

  if (lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ error: "Longitude must be between -180 and 180" });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&current_weather=true`;
    
    // Add timeout protection
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000); // 10 second timeout
    
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    
    if (!r.ok) {
      throw new Error(`Open-Meteo HTTP ${r.status}`);
    }

    const j = await r.json();
    const cw = j.current_weather ?? {};

    const tempC = cw.temperature ?? null;
    const tempF = tempC !== null ? (tempC * 9) / 5 + 32 : null;

    const windKmh = cw.windspeed ?? null;
    const windMph = windKmh !== null ? windKmh * 0.621371 : null;

    const windDir = cw.winddirection ?? null;

    const summary = typeof cw.weathercode === "number"
      ? `Code ${cw.weathercode}`
      : "Clear";

    return res.status(200).json({
      tempF,
      windSpeed: windMph,
      windDir,
      windCompass: windDirToCompass(windDir),
      summary,
    });
  } catch (error) {
    console.error("[API /weather] Error:", error.message);
    return res.status(500).json({ error: "Weather unavailable" });
  }
}
