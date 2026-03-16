/**
 * River Outline API — Ohio River channel geometry
 * 
 * Provides polyline coordinates for rendering the Ohio River on maps.
 * Priority:
 * 1. Local pre-downloaded GeoJSON (public/geo/ohio-river.json)
 * 2. USGS National Hydrography Dataset (WFS)
 * 
 * Does NOT use Overpass API (unreliable, slow) or static waypoints (misleading).
 * Returns 503 if no valid geometry is available.
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate that coordinates array has usable geometry
 */
function validateCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  
  // Check that each coordinate is [lat, lon] with valid numbers
  for (const coord of coords) {
    if (!Array.isArray(coord) || coord.length < 2) return false;
    const lat = parseFloat(coord[0]);
    const lon = parseFloat(coord[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  }
  
  return true;
}

export default async function handler(req, res) {
  // GET-only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Try local file first (fastest, no network needed)
    const localDataPath = path.join(process.cwd(), 'public', 'geo', 'ohio-river.json');
    
    if (fs.existsSync(localDataPath)) {
      try {
        const localData = JSON.parse(fs.readFileSync(localDataPath, 'utf8'));
        let elements = [];
        
        if (localData.polylines && Array.isArray(localData.polylines)) {
          // New format: multiple polylines
          for (const line of localData.polylines) {
            if (validateCoordinates(line.coordinates)) {
              elements.push({
                type: 'way',
                name: line.name || 'Ohio River',
                coordinates: line.coordinates,
                color: '#06b6d4',
                weight: 4,
                opacity: 0.9
              });
            }
          }
        } else if (localData.coordinates && Array.isArray(localData.coordinates)) {
          // Old format: single coordinates array
          if (validateCoordinates(localData.coordinates)) {
            elements.push({
              type: 'way',
              name: 'Ohio River',
              coordinates: localData.coordinates,
              color: '#06b6d4',
              weight: 4,
              opacity: 0.9
            });
          }
        }
        
        if (elements.length > 0) {
          return res.status(200).json({
            success: true,
            source: localData.source || 'Local GeoJSON (cached)',
            elements: elements
          });
        }
      } catch (parseErr) {
        // Local file exists but is invalid - continue to upstream source
      }
    }

    // Try USGS National Hydrography Dataset WFS API with timeout
    const wfsUrl = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query';
    
    const params = new URLSearchParams({
      where: "gnis_name='Ohio River'",
      outFields: '*',
      returnGeometry: 'true',
      geometryType: 'esriGeometryPolyline',
      f: 'geojson',
      outSR: '4326'
    });

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(`${wfsUrl}?${params}`, { signal: ctrl.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`USGS API error: ${response.status}`);
      }

      const geojson = await response.json();

      if (geojson.features && geojson.features.length > 0) {
        // Extract coordinates from GeoJSON features
        const allCoordinates = [];
        
        for (const feature of geojson.features) {
          if (feature.geometry && feature.geometry.type === 'LineString') {
            // GeoJSON uses [lon, lat], map needs [lat, lon]
            const coords = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            if (validateCoordinates(coords)) {
              allCoordinates.push(...coords);
            }
          } else if (feature.geometry && feature.geometry.type === 'MultiLineString') {
            // Handle MultiLineString
            for (const line of feature.geometry.coordinates) {
              const coords = line.map(coord => [coord[1], coord[0]]);
              if (validateCoordinates(coords)) {
                allCoordinates.push(...coords);
              }
            }
          }
        }

        if (allCoordinates.length > 0) {
          return res.status(200).json({
            success: true,
            source: 'USGS National Hydrography Dataset',
            elements: [{
              type: 'way',
              name: 'Ohio River',
              coordinates: allCoordinates,
              color: '#06b6d4',
              weight: 4,
              opacity: 0.9
            }]
          });
        }
      }

      // USGS returned valid response but no usable geometry
      throw new Error('No valid geometry in USGS response');

    } catch (fetchErr) {
      clearTimeout(timeoutId);
      // Timeout or fetch error - continue to error response
      throw new Error('USGS API unavailable');
    }
    
  } catch (err) {
    console.error('[API /river-outline] Error:', err.message);
    return res.status(503).json({ error: 'River outline unavailable' });
  }
}
