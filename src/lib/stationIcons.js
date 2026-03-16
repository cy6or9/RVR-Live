// /src/lib/stationIcons.js
// Generate icons for NOAA water level monitoring stations

/**
 * Create a station icon with SVG
 * Different from lock/dam icons to distinguish monitoring stations
 */
export function createStationIcon(isSelected = false) {
  return `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Outer circle -->
      <circle cx="16" cy="16" r="15" fill="${isSelected ? '#3b82f6' : '#06b6d4'}" stroke="white" stroke-width="2"/>
      
      <!-- Water droplet symbol -->
      <path d="M16 8 C16 8, 12 14, 12 17 C12 19.21, 13.79 21, 16 21 C18.21 21, 20 19.21, 20 17 C20 14, 16 8, 16 8 Z" 
            fill="white" opacity="0.9"/>
      
      <!-- Optional: small gauge symbol inside -->
      <line x1="14" y1="16" x2="18" y2="16" stroke="${isSelected ? '#3b82f6' : '#06b6d4'}" stroke-width="1" opacity="0.6"/>
    </svg>
  `;
}

/**
 * Create SVG data URL for use with Leaflet markers
 */
export function getStationIconDataUrl(isSelected = false) {
  const svgString = createStationIcon(isSelected);
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
}

/**
 * Create a Leaflet divIcon for stations
 * Can be used with L.marker() in Leaflet maps
 * Uses black city hall icon (🏛️) with no background
 */
export function createStationMarkerIcon(L, isSelected = false) {
  return L.divIcon({
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        cursor: pointer;
        font-size: 14px;
        background-color: #2d3748;
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        transition: all 0.2s ease;
        ${isSelected ? 'background-color: #1a202c; transform: scale(1.2); box-shadow: 0 0 10px rgba(59,130,246,0.6);' : ''}
      " title="NOAA Station">
        🏛️
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    className: 'station-marker',
  });
}

/**
 * Calculate distance between two coordinates in feet
 * Using haversine formula
 */
export function getDistanceInFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231; // Earth's radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Filter stations to exclude those within 1000 feet of a lock/dam
 */
export function filterStationsByLockProximity(stations, locks, proximityFeet = 1000) {
  return stations.filter(station => {
    // Check if any lock is within proximity distance
    const hasNearbyLock = locks.some(lock => {
      const distance = getDistanceInFeet(station.lat, station.lon, lock.lat, lock.lon);
      return distance <= proximityFeet;
    });
    return !hasNearbyLock;
  });
}

/**
 * Get hazard level color for station based on water conditions
 */
export function getStationHazardColor(hazardCode) {
  const hazardLevels = {
    0: '#10b981', // Green - Normal
    1: '#f59e0b', // Yellow - Elevated
    2: '#ef5350', // Orange - Near Flood
    3: '#c63d0f', // Red - Flooding
  };
  
  return hazardLevels[hazardCode] || hazardLevels[0];
}

/**
 * Get hazard label text
 */
export function getHazardLabel(hazardCode) {
  const labels = {
    0: 'Normal',
    1: 'Elevated',
    2: 'Near Flood',
    3: 'Flooding',
  };
  
  return labels[hazardCode] || 'Unknown';
}
