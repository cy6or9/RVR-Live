# City Markers Fix Guide

## Problem
City township icons are not appearing on the map even though the code is in place.

## Root Causes Identified

1. **Missing dependency in city markers useEffect**: The `stations` parameter might be undefined or empty when the useEffect runs
2. **River coordinates not ready**: The city markers useEffect runs before river data is fully loaded
3. **Zoom function doesn't handle cities**: When a city is selected from the dropdown, it only zooms to locks, not cities

## Required Fixes

### Fix 1: Update the selectedLockId handler to work with cities
**File**: `/workspaces/RVRBETA/src/components/OhioRiverActivityMap.jsx`
**Lines**: ~600-620 (the zoom to selected lock useEffect)

**Replace this section**:
```jsx
  // Handle zoom to selected lock
  useEffect(() => {
    if (!map.current || !window.L || !mapReady || !selectedLockId) return;
    
    // Only zoom if selection actually changed
    if (prevSelectedLockIdRef.current === selectedLockId) return;
    prevSelectedLockIdRef.current = selectedLockId;
    
    const selectedLock = locks.find(lock => lock.id === selectedLockId);
    if (selectedLock) {
      const L = window.L;
      // Calculate bounds for 5 miles east and west
      const mileOffset = 0.093;
      const latOffset = 0.036;
      const bounds = L.latLngBounds(
        [selectedLock.lat - latOffset, selectedLock.lon - mileOffset],
        [selectedLock.lat + latOffset, selectedLock.lon + mileOffset]
      );
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12, animate: true, duration: 0.5 });
      console.log('[RIVER-MAP] Zoomed to selected lock:', selectedLock.name);
    }
  }, [selectedLockId, locks, mapReady]);
```

**With this**:
```jsx
  // Handle zoom to selected lock OR city
  useEffect(() => {
    if (!map.current || !window.L || !mapReady || !selectedLockId) return;
    
    // Only zoom if selection actually changed
    if (prevSelectedLockIdRef.current === selectedLockId) return;
    prevSelectedLockIdRef.current = selectedLockId;
    
    // Look for city first, then lock
    let selectedItem = stations?.find(s => s.id === selectedLockId);
    if (!selectedItem) {
      selectedItem = locks.find(lock => lock.id === selectedLockId);
    }
    
    if (selectedItem) {
      const L = window.L;
      // Calculate bounds for 5 miles east and west
      const mileOffset = 0.093;
      const latOffset = 0.036;
      const bounds = L.latLngBounds(
        [selectedItem.lat - latOffset, selectedItem.lon - mileOffset],
        [selectedItem.lat + latOffset, selectedItem.lon + mileOffset]
      );
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12, animate: true, duration: 0.5 });
      console.log('[RIVER-MAP] Zoomed to:', selectedItem.name);
    }
  }, [selectedLockId, locks, stations, mapReady]);
```

### Fix 2: Improve city markers logging and error handling
**File**: `/workspaces/RVRBETA/src/components/OhioRiverActivityMap.jsx`
**Lines**: ~485-510 (city markers useEffect start)

Replace the early return section with better debugging:
```jsx
  // Add city/township markers (non-L&D stations)
  useEffect(() => {
    if (!map.current || !window.L || !mapReady) {
      console.log('[RIVER-MAP] City markers skipped - map not ready', { mapReady, hasMap: !!map.current, hasL: !!window.L });
      return;
    }
    
    if (!stations || stations.length === 0) {
      console.log('[RIVER-MAP] City markers skipped - no stations provided');
      return;
    }
    
    if (riverCoordinatesRef.current.length === 0) {
      console.log('[RIVER-MAP] City markers skipped - waiting for river coordinates');
      return;
    }
```

### Fix 3: Add try-catch around city marker creation
Wrap the city marker addition in try-catch:
```jsx
    let addedCount = 0;
    let skippedCount = 0;
    
    // Add city markers
    cityStations.forEach((city) => {
      try {
        // ... existing code ...
        addedCount++;
      } catch (err) {
        console.error('[RIVER-MAP] Error adding city marker for', city.name, ':', err);
        skippedCount++;
      }
    });
    
    console.log('[RIVER-MAP] City markers complete:', { 
      added: addedCount, 
      skipped: skippedCount, 
      total: cityStations.length 
    });
```

### Fix 4: Update city markers removeLayer calls
Wrap in try-catch:
```jsx
    // Clear existing city markers
    cityMarkersRef.current.forEach(marker => {
      try {
        map.current.removeLayer(marker);
      } catch (e) {
        console.warn('[RIVER-MAP] Error removing city marker:', e);
      }
    });
    cityMarkersRef.current = [];
```

## Verification Steps

After making these changes:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Load the river-conditions page
4. You should see logs like:
   - `[RIVER-MAP] Adding X city markers`
   - `[RIVER-MAP] ✓ City markers added: 17/17` (or similar)
5. Look for city markers (dark background, cyan border, 16px size) on the map
6. Test clicking a city in the dropdown - it should zoom to that city with "Find Me" style zoom
7. Test clicking a city marker - popup should appear with city info

## Expected Results

- ✅ 17 city markers visible on map (all non-L&D stations)
- ✅ Markers are 16x16px (half size of 32x32px lock markers)
- ✅ Dark background (#1e293b) with cyan border (#06b6d4)
- ✅ Markers snapped to nearest river coordinates
- ✅ Clicking dropdown city zooms map (like Find Me)
- ✅ Clicking city marker shows popup
- ✅ No console errors about missing coordinates or failed rendering
