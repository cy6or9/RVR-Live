// Server-side reverse geocoding proxy to avoid CORS issues
const STATE_ABBREV = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
};

// Known towns/cities indexed by county/state when OSM doesn't have them
// Format: "County, State" => [{ name, lat, lon }, ...]
const KNOWN_TOWNS = {
  "Union County, Kentucky": [
    { name: "Uniontown", lat: 37.7683, lon: -87.9480 },
  ],
  "Henderson County, Kentucky": [
    { name: "Henderson", lat: 37.8361, lon: -87.5900 },
    { name: "Corydon", lat: 37.7406, lon: -87.7019 },
    { name: "Robards", lat: 37.6808, lon: -87.5453 },
    { name: "Spottsville", lat: 37.8383, lon: -87.4147 },
  ],
};

function getStateAbbrev(stateName) {
  if (!stateName) return '';
  // Check if already abbreviated
  if (stateName.length === 2) return stateName.toUpperCase();
  // Look up full name
  return STATE_ABBREV[stateName] || stateName.substring(0, 2).toUpperCase();
}

function findNearestKnownTown(county, state, userLat, userLon) {
  const key = `${county}, ${state}`;
  const towns = KNOWN_TOWNS[key];
  if (!towns || towns.length === 0) return null;
  
  let closest = null;
  let closestDist = Infinity;
  
  for (const town of towns) {
    const distSquared = Math.pow(town.lat - userLat, 2) + Math.pow(town.lon - userLon, 2);
    if (distSquared < closestDist) {
      closest = town;
      closestDist = distSquared;
    }
  }
  
  // Return if within ~50km (0.5 degrees squared ~ 50km)
  return closestDist < 0.25 ? closest : null;
}

export default async function handler(req, res) {
  // GET-only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { lat, lon } = req.query;

  // Validate lat/lon are provided
  if (!lat || !lon) {
    return res
      .status(400)
      .json({ error: "Missing lat or lon parameter" });
  }

  // Validate lat/lon are numbers
  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);

  if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
    return res
      .status(400)
      .json({ error: "Invalid lat or lon format" });
  }

  // Validate geographic ranges
  if (userLat < -90 || userLat > 90) {
    return res
      .status(400)
      .json({ error: "Latitude must be between -90 and 90" });
  }

  if (userLon < -180 || userLon > 180) {
    return res
      .status(400)
      .json({ error: "Longitude must be between -180 and 180" });
  }

  // Disable caching for geocode requests
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    // Use Nominatim API from server-side (no CORS issues)
    // First try reverse geocoding with high detail
    const geocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLon}&zoom=18&addressdetails=1`;

    // Add timeout protection
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000); // 10 second timeout

    const response = await fetch(geocodeUrl, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "RiverValleyReport/1.0 (GitHub @cy6or9/RVRBETA)",
        "Accept": "application/json",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data || !data.address) {
      // Nominatim returned valid response but no address data for this coordinate
      // Return 200 with null values instead of 404, as this is a valid "no match" result
      return res.status(200).json({
        success: false,
        location: {
          formatted: null,
          city: null,
          county: null,
          state: null,
          name: null,
        },
        message: "No location match found for coordinates"
      });
    }

    // Extract location components with enhanced priority
    // OSM place names hierarchy: city > town > village > hamlet > suburb > county
    let city = null;
    const place_name = data.address.name; // Fallback to the main name field

    // Try to get best city/town name in priority order
    if (data.address.city) {
      city = data.address.city;
    } else if (data.address.town) {
      city = data.address.town;
    } else if (data.address.village) {
      city = data.address.village;
    } else if (data.address.hamlet) {
      city = data.address.hamlet;
    } else if (data.address.suburb) {
      city = data.address.suburb;
    }

    // If no city found, check known towns database first
    if (
      !city &&
      data.address.county &&
      data.address.state
    ) {
      const knownTown = findNearestKnownTown(
        data.address.county,
        data.address.state,
        userLat,
        userLon
      );
      if (knownTown) {
        city = knownTown.name;
      }
    }

    // If still no city found, try searching for nearby named places
    if (!city) {
      try {
        // First, try searching for towns/cities/villages near the coordinate
        const coordSearchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=20&addressdetails=1&exclude_place_ids=${data.place_id || ""}&lat=${userLat}&lon=${userLon}&featuretype=city,town,village,hamlet`;

        const coordCtrl = new AbortController();
        const coordTimeoutId = setTimeout(() => coordCtrl.abort(), 8000);

        const coordSearchResponse = await fetch(coordSearchUrl, {
          signal: coordCtrl.signal,
          headers: {
            "User-Agent": "RiverValleyReport/1.0 (GitHub @cy6or9/RVRBETA)",
            "Accept": "application/json",
          },
        });
        clearTimeout(coordTimeoutId);

        if (coordSearchResponse.ok) {
          const coordSearchResults = await coordSearchResponse.json();

          if (coordSearchResults && coordSearchResults.length > 0) {
            // Find the closest place within ~10km
            let closestPlace = null;
            let closestDistance = Infinity;

            for (const result of coordSearchResults) {
              const resLat = parseFloat(result.lat);
              const resLon = parseFloat(result.lon);

              // Calculate distance (simple Euclidean)
              const distSquared =
                Math.pow(resLat - userLat, 2) +
                Math.pow(resLon - userLon, 2);

              // If closer than current best and within ~10km (~0.09 degrees squared)
              if (distSquared < 0.008) {
                const placeName = result.name;
                if (
                  placeName &&
                  !placeName.includes("County") &&
                  !placeName.includes(data.address.state)
                ) {
                  if (distSquared < closestDistance) {
                    closestPlace = {
                      name: placeName,
                      distance: distSquared,
                    };
                    closestDistance = distSquared;
                  }
                }
              }
            }

            if (closestPlace) {
              city = closestPlace.name;
            }
          }
        }
      } catch (err) {
        // Silently continue to next fallback
      }
    }

    // If still no city, try searching for places by county/state
    if (!city) {
      try {
        const countySearchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=30&addressdetails=1&q=${encodeURIComponent(
          data.address.county
        )}%20${encodeURIComponent(
          data.address.state
        )}&featuretype=city,town,village`;

        const countyCtrl = new AbortController();
        const countyTimeoutId = setTimeout(() => countyCtrl.abort(), 8000);

        const countySearchResponse = await fetch(countySearchUrl, {
          signal: countyCtrl.signal,
          headers: {
            "User-Agent": "RiverValleyReport/1.0 (GitHub @cy6or9/RVRBETA)",
            "Accept": "application/json",
          },
        });
        clearTimeout(countyTimeoutId);

        if (countySearchResponse.ok) {
          const countySearchResults = await countySearchResponse.json();

          if (countySearchResults && countySearchResults.length > 0) {
            // Find the closest place within ~20km
            let closestPlace = null;
            let closestDistance = Infinity;

            for (const result of countySearchResults) {
              const resLat = parseFloat(result.lat);
              const resLon = parseFloat(result.lon);

              // Calculate distance
              const distSquared =
                Math.pow(resLat - userLat, 2) +
                Math.pow(resLon - userLon, 2);

              // If closer than current best and within ~20km
              if (distSquared < 0.032) {
                const placeName = result.name;
                if (placeName && !placeName.includes("County")) {
                  if (distSquared < closestDistance) {
                    closestPlace = {
                      name: placeName,
                      distance: distSquared,
                    };
                    closestDistance = distSquared;
                  }
                }
              }
            }

            if (closestPlace) {
              city = closestPlace.name;
            }
          }
        }
      } catch (err) {
        // Silently continue to final fallback
      }
    }

    // Use place name from reverse geocoding as final fallback
    if (!city && place_name) {
      city = place_name;
    }

    const county = data.address.county;
    const state = data.address.state;

    // Build formatted location string - Format: "City, State (County)"
    let locationStr = "";
    const stateAbbrev = getStateAbbrev(state);

    // If we have a city/town, use "City, State (County)" format
    if (city && state) {
      locationStr = `${city}, ${stateAbbrev}`;
      // Add county in parentheses if available and different from city name
      if (
        county &&
        !county.toLowerCase().includes(city.toLowerCase())
      ) {
        locationStr += ` (${county})`;
      }
    } else if (county && state) {
      // Try to extract town name from county name (e.g., "Henderson County" -> "Henderson")
      const countyBase = county.replace(/\s+County$/i, "").trim();
      if (countyBase && countyBase !== county) {
        // County name had "County" suffix, use the base as town name
        locationStr = `${countyBase}, ${stateAbbrev} (${county})`;
        city = countyBase; // Set city for return value
      } else {
        // No "County" suffix found, fallback to full county name
        locationStr = `${county}, ${stateAbbrev}`;
      }
    } else if (state) {
      // Last resort: State only
      locationStr = stateAbbrev;
    }

    return res.status(200).json({
      success: true,
      location: {
        formatted: locationStr,
        city: city || null,
        county: county || null,
        state: stateAbbrev || null,
        name: place_name || null,
      },
      raw: data.address,
    });
  } catch (error) {
    console.error("[API /geocode] Error:", error.message);
    // Return 503 for service unavailability, not 500
    // This includes timeouts, fetch failures, and upstream API errors
    return res.status(503).json({ error: "Geocoding service unavailable" });
  }
}
