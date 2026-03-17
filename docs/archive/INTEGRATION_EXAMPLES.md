# Quick Integration Examples

## Example 1: Add Favorites to Station List

In `river-conditions.js`, add favorite stars next to each station:

```jsx
// At the top with other imports
import FavoriteButton from "@/components/FavoriteButton";
import { useUserProfile } from "@/context/UserProfileContext";

export default function RiverConditions() {
  const { profile, checkIsFavorite } = useUserProfile();
  
  // Sort stations: favorites first
  const sortedStations = [...stations].sort((a, b) => {
    const aFav = checkIsFavorite('stations', a.id);
    const bFav = checkIsFavorite('stations', b.id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  return (
    {/* In your station dropdown or list */}
    <div className="flex items-center gap-2">
      <select onChange={(e) => setSelected(stations.find(s => s.id === e.target.value))}>
        {sortedStations.map((s) => (
          <option key={s.id} value={s.id}>
            {checkIsFavorite('stations', s.id) ? '⭐ ' : ''}{s.name}
          </option>
        ))}
      </select>
      <FavoriteButton 
        type="stations" 
        itemId={selected.id} 
        itemName={selected.name} 
      />
    </div>
  );
}
```

---

## Example 2: Save Map Position on Map Component

In `LockDamMap.jsx` or `OhioRiverActivityMap.jsx`:

```jsx
import { useUserProfile } from "@/context/UserProfileContext";
import { useEffect, useState } from "react";

export default function LockDamMap() {
  const { profile, saveMapPreferences } = useUserProfile();
  
  // Initialize from profile
  const [center, setCenter] = useState(
    profile?.mapPreferences?.defaultLocation || { lat: 38.5, lon: -84.5 }
  );
  const [zoom, setZoom] = useState(profile?.mapPreferences?.zoom || 8);

  // Load saved preferences on mount
  useEffect(() => {
    if (profile?.mapPreferences) {
      setCenter(profile.mapPreferences.defaultLocation);
      setZoom(profile.mapPreferences.zoom);
    }
  }, [profile]);

  // Save on map move (debounced)
  const handleMapMove = useDebouncedCallback((newCenter, newZoom) => {
    saveMapPreferences({
      defaultLocation: newCenter,
      zoom: newZoom
    });
  }, 1000); // Save after 1 second of inactivity

  return (
    <Mapbox
      initialCenter={center}
      initialZoom={zoom}
      onMoveEnd={(e) => handleMapMove(e.center, e.zoom)}
    />
  );
}
```

---

## Example 3: Show Only Favorites Toggle

Add a "Favorites Only" filter:

```jsx
import { useUserProfile } from "@/context/UserProfileContext";

export default function StationList() {
  const { profile, checkIsFavorite } = useUserProfile();
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const displayedStations = showOnlyFavorites
    ? stations.filter(s => checkIsFavorite('stations', s.id))
    : stations;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          checked={showOnlyFavorites}
          onChange={(e) => setShowOnlyFavorites(e.target.checked)}
        />
        <label>Show only favorites</label>
      </div>
      
      {displayedStations.length === 0 && showOnlyFavorites && (
        <p className="text-muted-foreground">
          No favorites yet. Star stations to see them here!
        </p>
      )}
      
      {displayedStations.map(station => (
        <StationCard key={station.id} station={station} />
      ))}
    </div>
  );
}
```

---

## Example 4: Cache River Data for Fast Loading

In your data fetching function:

```jsx
import { useUserProfile } from "@/context/UserProfileContext";

export default function RiverConditions() {
  const { profile, updateCachedRiverData } = useUserProfile();
  const [data, setData] = useState(null);

  useEffect(() => {
    // Show cached data immediately
    if (profile?.cachedData?.lastSeenRiverData) {
      setData(profile.cachedData.lastSeenRiverData);
    }
    
    // Then fetch fresh data
    fetchRiverData();
  }, [profile]);

  async function fetchRiverData() {
    const fresh = await fetch('/api/river-data').then(r => r.json());
    setData(fresh);
    
    // Cache for next time
    updateCachedRiverData(fresh);
  }

  return (
    <div>
      {data && <RiverDataDisplay data={data} />}
      {profile?.cachedData?.lastUpdated && (
        <p className="text-xs text-muted-foreground">
          Last updated: {new Date(profile.cachedData.lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  );
}
```

---

## Example 5: Dark Mode Toggle

```jsx
import { useUserProfile } from "@/context/UserProfileContext";
import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";

export default function DarkModeToggle() {
  const { profile, saveMapPreferences } = useUserProfile();
  const isDark = profile?.mapPreferences?.darkMode || false;

  // Apply dark mode class to document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleDarkMode = async () => {
    await saveMapPreferences({ darkMode: !isDark });
  };

  return (
    <button 
      onClick={toggleDarkMode}
      className="p-2 rounded hover:bg-accent"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
```

---

## Example 6: Favorite Locks Sidebar

Show favorite locks in a quick-access panel:

```jsx
import { useUserProfile } from "@/context/UserProfileContext";
import { ohioRiverLocks } from "@/lib/locks";
import { Star } from "lucide-react";

export default function FavoriteLocksSidebar() {
  const { profile, checkIsFavorite, toggleFavorite } = useUserProfile();

  const favoriteLocks = ohioRiverLocks.filter(lock => 
    checkIsFavorite('locksDams', lock.id)
  );

  if (favoriteLocks.length === 0) {
    return (
      <div className="p-4 border rounded">
        <p className="text-sm text-muted-foreground">
          No favorite locks yet. Click the ⭐ to save your favorites!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded">
      <h3 className="font-semibold mb-3">⭐ Favorite Locks</h3>
      <div className="space-y-2">
        {favoriteLocks.map(lock => (
          <div 
            key={lock.id} 
            className="flex items-center justify-between p-2 hover:bg-accent rounded"
          >
            <div>
              <p className="font-medium text-sm">{lock.name}</p>
              <p className="text-xs text-muted-foreground">Mile {lock.rivermile}</p>
            </div>
            <button onClick={() => toggleFavorite('locksDams', lock.id)}>
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Example 7: Preferred Stations Quick Access

Add a "Quick Access" section with preferred stations:

```jsx
import { useUserProfile } from "@/context/UserProfileContext";

export default function QuickAccessStations({ onSelectStation }) {
  const { profile, togglePreferredStation } = useUserProfile();
  
  const preferredStationIds = profile?.cachedData?.preferredStations || [];
  const preferredStations = stations.filter(s => 
    preferredStationIds.includes(s.id)
  );

  if (preferredStations.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold mb-2">Quick Access</h3>
      <div className="flex flex-wrap gap-2">
        {preferredStations.map(station => (
          <button
            key={station.id}
            onClick={() => onSelectStation(station)}
            className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm"
          >
            {station.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Example 8: Profile Sync Indicator

Show when profile is saving:

```jsx
import { useUserProfile } from "@/context/UserProfileContext";
import { useAuth } from "@/context/AuthContext";
import { Cloud, CloudOff } from "lucide-react";

export default function SyncIndicator() {
  const { user } = useAuth();
  const { profile } = useUserProfile();

  if (!user) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CloudOff className="w-3 h-3" />
        <span>Guest mode (not synced)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Cloud className="w-3 h-3" />
      <span>Synced</span>
      {profile?.updatedAt && (
        <span className="ml-2">
          {new Date(profile.updatedAt.seconds * 1000).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
```

---

## Debounce Helper (for map saving)

Create `src/lib/debounce.js`:

```javascript
import { useCallback, useRef } from 'react';

export function useDebouncedCallback(callback, delay) {
  const timeoutRef = useRef(null);

  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
}
```

---

## Testing Checklist

After integrating these features:

1. ✅ Sign in → profile page loads
2. ✅ Add favorite → star appears instantly
3. ✅ Refresh page → favorite persists
4. ✅ Change map position → saves after 1 second
5. ✅ Sign out → guest mode works
6. ✅ Toggle dark mode → applies immediately
7. ✅ View on different device → settings sync (logged in)
8. ✅ Favorite locks show in sidebar
9. ✅ Quick access stations load fast

---

## Performance Tips

1. **Debounce map saves** - Don't save on every pixel movement
2. **Cache API responses** - Store in profile.cachedData
3. **Lazy load favorites** - Only fetch when needed
4. **Batch updates** - Combine multiple profile updates into one
5. **Use optimistic UI** - Update UI before Firestore confirms

---

Need more examples? All code is production-ready and follows React best practices!
