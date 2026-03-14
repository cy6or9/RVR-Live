# Quick Fix for City Markers Not Showing

## The Problem
City markers aren't appearing because the `onLockSelect` callback isn't being passed to the map component, AND the selected city zooming won't work because `selected` isn't being changed when a city is clicked.

## Critical Fix Required in `/src/pages/river-conditions.js`

### Line 1271-1279 (Topo Map) - ADD onLockSelect
Change from:
```jsx
        <OhioRiverActivityMap 
          locks={ohioRiverLocks}
          stations={stations}
          selectedLockId={selected?.id}
          userLocation={userLocation}
          mapStyle="topo"
        />
```

To:
```jsx
        <OhioRiverActivityMap 
          locks={ohioRiverLocks}
          stations={stations}
          selectedLockId={selected?.id}
          userLocation={userLocation}
          onLockSelect={(id) => setSelected(stations.find(s => s.id === id) || locks.find(l => l.id === id))}
          mapStyle="topo"
        />
```

### Line 1281-1289 (Dark Map) - ADD onLockSelect
Change from:
```jsx
        <OhioRiverActivityMap 
          locks={ohioRiverLocks}
          stations={stations}
          selectedLockId={selected?.id}
          userLocation={userLocation}
          mapStyle="dark"
        />
```

To:
```jsx
        <OhioRiverActivityMap 
          locks={ohioRiverLocks}
          stations={stations}
          selectedLockId={selected?.id}
          userLocation={userLocation}
          onLockSelect={(id) => setSelected(stations.find(s => s.id === id) || locks.find(l => l.id === id))}
          mapStyle="dark"
        />
```

### Line 1291-1298 (Default Map) - ADD onLockSelect
Change from:
```jsx
        <OhioRiverActivityMap 
          locks={ohioRiverLocks}
          stations={stations}
          selectedLockId={selected?.id}
          userLocation={userLocation}
        />
```

To:
```jsx
        <OhioRiverActivityMap 
          locks={ohioRiverLocks}
          stations={stations}
          selectedLockId={selected?.id}
          userLocation={userLocation}
          onLockSelect={(id) => setSelected(stations.find(s => s.id === id) || locks.find(l => l.id === id))}
        />
```

## What This Fixes

1. **City markers will now respond to clicks** - When you click a city marker, it updates the selected station
2. **Dropdown selection will zoom to cities** - When you select a city from the dropdown, the map will zoom to it with the same "Find Me" style zoom
3. **Popup shows correct info** - City popups will display properly

## Testing After Fix

1. Refresh the page
2. Open browser Console (F12)
3. Look for city markers (small dark circles with cyan border)
4. Click a city marker - the dropdown should update
5. Select a city from the dropdown - the map should zoom to it
6. Click a lock marker - it should zoom to the lock area

## Expected Console Output
```
[RIVER-MAP] Adding city markers: {
  totalStations: 33,
  citiesAfterFilter: 17,
  riverCoordinatesAvailable: 5843,
  sampleCities: [ 'Pittsburgh, PA', 'Wheeling, WV', 'Marietta, OH' ]
}
[RIVER-MAP] ✓ City markers added: 17/17
```

If you see messages like `[RIVER-MAP] City markers skipped`, the issue is that stations aren't being passed properly.
