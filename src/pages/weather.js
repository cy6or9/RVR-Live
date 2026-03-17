import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function weatherDescription(code) {
  const map = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Moderate showers",
    82: "Violent showers",
    95: "Thunderstorm",
    99: "Severe thunderstorm",
  };
  return map[code] || "Unknown";
}

function degToCompass(deg) {
  if (deg === null || deg === undefined) return "";
  const dirs = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

function aqiLabel(v) {
  if (v <= 50) return "Good";
  if (v <= 100) return "Moderate";
  if (v <= 150) return "Unhealthy (Sensitive)";
  if (v <= 200) return "Unhealthy";
  if (v <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function aqiGradient(v) {
  // Same palette style as river-conditions bar
  return (
    "linear-gradient(to right, " +
    "#00E400, #FFFF00, #FF7E00, #FF0000, #8F3F97, #7E0023)"
  );
}

function aqiColor(v) {
  if (v <= 50) return "#00E400";
  if (v <= 100) return "#FFFF00";
  if (v <= 150) return "#FF7E00";
  if (v <= 200) return "#FF0000";
  if (v <= 300) return "#8F3F97";
  return "#7E0023";
}

function formatTime(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* --------------------------------------------------
   Page
-------------------------------------------------- */

export default function Weather() {
  const [coords, setCoords] = useState({ lat: 37.77, lon: -87.57 });
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [aqi, setAqi] = useState(null);
  const [loading, setLoading] = useState(true);

  /* Geolocation ------------------------------------------------ */
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
      },
      (err) => console.warn("Geolocation error:", err)
    );
  }, []);

  /* Fetch weather + forecast + AQI ---------------------------- */
  useEffect(() => {
    async function loadAll() {
      try {
        setLoading(true);

        // Main weather + daily forecast
        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,windspeed_10m_min,winddirection_10m_dominant&timezone=auto`;
        const wxRes = await fetch(wxUrl);
        const wx = await wxRes.json();

        const cw = wx.current_weather || {};
        const d = wx.daily || {};

        setWeather({
          tempC: cw.temperature ?? null,
          windKmh: cw.windspeed ?? null,
          windDirDeg: cw.winddirection ?? null,
          summary: weatherDescription(cw.weathercode),
          sunrise: d.sunrise?.[0] ?? null,
          sunset: d.sunset?.[0] ?? null,
          code: cw.weathercode ?? null,
        });

        setForecast({
          highC: d.temperature_2m_max?.[0] ?? null,
          lowC: d.temperature_2m_min?.[0] ?? null,
          highWindKmh: d.windspeed_10m_max?.[0] ?? null,
          lowWindKmh: d.windspeed_10m_min?.[0] ?? null,
          avgDirDeg: d.winddirection_10m_dominant?.[0] ?? null,
          rainChance: d.precipitation_probability_max?.[0] ?? 0,
        });

        // AQI (Open-Meteo AQI feed)
        const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}&hourly=us_aqi&timezone=auto`;
        const aqiRes = await fetch(aqiUrl);
        const aqiJson = await aqiRes.json();
        const list = aqiJson.hourly?.us_aqi || [];
        setAqi(list.length ? list[list.length - 1] : null);
      } catch (err) {

      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [coords]);

  /* Derived display values ------------------------------------ */

  const tempF =
    weather && weather.tempC != null
      ? weather.tempC * 9 / 5 + 32
      : null;

  const windMph =
    weather && weather.windKmh != null
      ? weather.windKmh / 1.609
      : null;

  const windKnots =
    windMph != null ? windMph / 1.151 : null;

  const hiF =
    forecast && forecast.highC != null
      ? forecast.highC * 9 / 5 + 32
      : null;

  const loF =
    forecast && forecast.lowC != null
      ? forecast.lowC * 9 / 5 + 32
      : null;

  const hiWindMph =
    forecast && forecast.highWindKmh != null
      ? forecast.highWindKmh / 1.609
      : null;

  const loWindMph =
    forecast && forecast.lowWindKmh != null
      ? forecast.lowWindKmh / 1.609
      : null;

  const windDirText =
    weather && weather.windDirDeg != null
      ? degToCompass(weather.windDirDeg)
      : "";

  const avgDirText =
    forecast && forecast.avgDirDeg != null
      ? degToCompass(forecast.avgDirDeg)
      : "";

  const aqiValue = aqi ?? 0;
  const aqiText = aqiLabel(aqiValue);

  const windyURL = `https://embed.windy.com/embed2.html?lat=${coords.lat}&lon=${coords.lon}&zoom=7&layer=wind&menu=&message=false&marker=&calendar=12&pressure=true&type=map&location=coordinates&detail=&forecast=24&embed=true`;

  /* --------------------------------------------------
     Render
  -------------------------------------------------- */

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* AQI-colored info bar like river-conditions */}
      <section
        className="w-full flex justify-center py-3 shadow-md"
        style={{
          background: aqiGradient(aqiValue),
        }}
      >
        <div
          className="max-w-6xl w-[95%] bg-zinc-900/90 text-white rounded-3xl px-5 py-3 flex flex-col gap-1 text-xs sm:text-sm md:text-base"
          style={{ border: "1px solid rgba(255,255,255,0.15)" }}
        >
          {/* Row 1 – current conditions */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {loading && <span>Loading current weather…</span>}

            {!loading && weather && tempF != null && windMph != null && (
              <>
                <span>
                  🌡 <strong>{tempF.toFixed(1)}°F</strong>{" "}
                  ({weather.tempC.toFixed(1)}°C)
                </span>
                <span>
                  💨 {windDirText}{" "}
                  {windMph.toFixed(1)} mph
                  {windKnots != null &&
                    ` (${windKnots.toFixed(1)} kts)`}
                </span>
                <span>☁ {weather.summary}</span>
                {weather.sunrise && (
                  <span>
                    🌅 {formatTime(weather.sunrise)}
                  </span>
                )}
                {weather.sunset && (
                  <span>
                    🌇 {formatTime(weather.sunset)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Row 2 – forecast & AQI */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {forecast && hiF != null && loF != null && (
              <>
                <span>
                  🔺 High{" "}
                  <strong>{hiF.toFixed(1)}°F</strong>{" "}
                  ({forecast.highC.toFixed(1)}°C)
                </span>
                <span>
                  🔻 Low{" "}
                  <strong>{loF.toFixed(1)}°F</strong>{" "}
                  ({forecast.lowC.toFixed(1)}°C)
                </span>
                {loWindMph != null && hiWindMph != null && (
                  <span>
                    💨 {avgDirText}{" "}
                    {loWindMph.toFixed(1)}–{hiWindMph.toFixed(1)} mph
                  </span>
                )}
                <span>
                  🌧 {Math.round(forecast.rainChance ?? 0)}% chance
                </span>
              </>
            )}

            {/* AQI pill */}
            <span
              className="px-2 py-1 rounded-full text-xs sm:text-sm ml-2"
              style={{
                backgroundColor: aqiColor(aqiValue),
                color: "#000",
                fontWeight: 600,
              }}
            >
              AQI {aqiValue ? Math.round(aqiValue) : "—"} ({aqiText})
            </span>
          </div>
        </div>
      </section>

      {/* Windy map (and you can keep/add radar/forecast iframes below if desired) */}
      <main className="flex-1 w-full mt-0">
        <section className="w-full">
          <iframe
            src={windyURL}
            width="100%"
            height="700"
            frameBorder="0"
            style={{ border: 0, display: "block" }}
            title="Live Wind Map"
            loading="lazy"
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
