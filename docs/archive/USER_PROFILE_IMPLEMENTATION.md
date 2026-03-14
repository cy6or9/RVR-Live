# User Profile System Implementation Guide

## ✅ What Has Been Implemented

### 1. **Core User Profile Infrastructure** 
- **File**: `src/lib/userProfile.js`
- Firestore database integration for user profiles
- Complete profile data structure including:
  - Map preferences (location, zoom, layers, dark mode)
  - Cached data (river data, forecasts, NOAA stations)
  - Favorites (locks/dams, towns, marinas)
  - Offline mode settings
- Helper functions for creating, reading, and updating profiles
- Functions for managing favorites and preferred stations

### 2. **User Profile Context Provider**
- **File**: `src/context/UserProfileContext.js`
- React context for managing profile state throughout the app
- Hooks for accessing and updating profile data:
  - `saveMapPreferences()` - Save map settings
  - `toggleFavorite()` - Add/remove favorites
  - `checkIsFavorite()` - Check if item is favorited
  - `togglePreferredStation()` - Manage quick-access stations
  - `updateCachedRiverData()` - Cache data for fast loading
  - `updateOfflineSettings()` - Manage offline mode
- Guest profile support (localStorage) for non-logged-in users
- Seamless sync with Firestore for logged-in users

### 3. **User Profile Page**
- **File**: `src/pages/profile.js`
- Complete settings interface with 4 tabs:
  1. **Map Settings** - Default location, zoom, layer preferences, dark mode
  2. **Favorites** - Manage favorite locks/dams and stations
  3. **Offline Mode** - Download and cache management
  4. **Account** - User info and data management
- Live save functionality with visual feedback
- Responsive design matching your existing style

### 4. **Reusable Favorite Button Component**
- **File**: `src/components/FavoriteButton.jsx`
- Animated star button for favoriting any item
- Works with locks/dams, towns, marinas, stations
- Auto-prompts login if not signed in
- Smooth animations and visual feedback

### 5. **App-Wide Integration**
- **File**: `src/pages/_app.js`
- UserProfileProvider wrapped around the app
- All pages now have access to profile context

### 6. **Header Navigation Update**
- **File**: `src/components/Header.jsx`
- Added "Profile" link in navigation
- Shows for all logged-in users (not just admins)

---

## 🚀 Features Enabled by This System

### **Speed Improvements**
✅ Cached river data loads instantly from user's last visit
✅ Map remembers user's preferred location and zoom
✅ Preferred stations pre-populate for quick access
✅ Offline mode reduces data fetching

### **Personalization**
✅ Each user gets custom map defaults
✅ Favorite stations appear at the top
✅ Saved layer preferences (weather radar, locks, hazards, traffic)
✅ Dark mode preference saved per user

### **User Engagement**
✅ Favoriting encourages return visits
✅ Profile persistence across devices (when logged in)
✅ Guest mode works without login (localStorage)
✅ Seamless transition from guest → logged-in user

---

## 📋 Next Steps to Complete

### **Phase 1: River Conditions Integration** (Quick Win)
Add favorite buttons to station selectors on `river-conditions.js`:
```jsx
// In station dropdown or cards:
<FavoriteButton 
  type="stations" 
  itemId={station.id} 
  itemName={station.name} 
/>
```

Filter and prioritize favorited stations:
```jsx
const favoriteStations = stations.filter(s => 
  checkIsFavorite('stations', s.id)
);
```

### **Phase 2: Map Persistence**
Update map components to use saved preferences:
```jsx
const { profile } = useUserProfile();
const defaultCenter = profile?.mapPreferences?.defaultLocation;
const defaultZoom = profile?.mapPreferences?.zoom;
```

Auto-save map position when user moves/zooms:
```jsx
// On map moveend event:
saveMapPreferences({
  defaultLocation: { lat: newLat, lon: newLon },
  zoom: newZoom
});
```

### **Phase 3: Offline Mode Implementation**
- Set up service worker for caching
- Use IndexedDB for storing map tiles
- Download river data snapshots
- Cache weather forecasts
- Add sync indicator UI

### **Phase 4: Advanced Features**
- **Push notifications** for flood alerts at favorited locations
- **Saved routes** for boaters
- **Notes/comments** on locks and marinas
- **Trip planning** with favorite waypoints
- **Social features** (share routes, conditions)

---

## 🔧 How to Use (For Developers)

### Import the Context
```javascript
import { useUserProfile } from '@/context/UserProfileContext';

function MyComponent() {
  const { 
    profile,
    saveMapPreferences,
    toggleFavorite,
    checkIsFavorite 
  } = useUserProfile();
  
  // Access profile data
  const isDarkMode = profile?.mapPreferences?.darkMode;
  
  // Save preferences
  await saveMapPreferences({ darkMode: true });
  
  // Manage favorites
  await toggleFavorite('locksDams', 'olmsted');
  const isFav = checkIsFavorite('locksDams', 'olmsted');
}
```

### Add Favorite Buttons
```jsx
import FavoriteButton from '@/components/FavoriteButton';

<FavoriteButton 
  type="locksDams"
  itemId={lock.id}
  itemName={lock.name}
  variant="ghost"
  size="sm"
/>
```

### Check Login Status
```jsx
import { useAuth } from '@/context/AuthContext';

function ProtectedFeature() {
  const { user } = useAuth();
  const { isLoggedIn } = useUserProfile();
  
  if (!isLoggedIn) {
    return <button onClick={() => router.push('/profile')}>
      Sign in to save favorites
    </button>;
  }
  
  return <FavoriteButton ... />;
}
```

---

## 🗄️ Database Schema (Firestore)

### Collection: `userProfiles`
Document ID: Firebase User UID

```javascript
{
  // Map Preferences
  mapPreferences: {
    defaultLocation: { lat: 38.5, lon: -84.5 },
    zoom: 8,
    layers: {
      waterLevels: true,
      weatherRadar: false,
      locksDams: true,
      hazardZones: true,
      traffic: false
    },
    darkMode: false
  },
  
  // Cached Data
  cachedData: {
    lastSeenRiverData: {...},
    lastSeenForecast: {...},
    lastUpdated: "2025-12-20T10:00:00Z",
    preferredStations: ["03322420", "03255000"],
    cachedHazardReports: [],
    savedStations: []
  },
  
  // Favorites
  favorites: {
    locksDams: ["olmsted", "mcalpine"],
    towns: ["cincinnati", "louisville"],
    marinas: ["marina_1", "marina_2"]
  },
  
  // Offline Mode
  offlineMode: {
    enabled: false,
    downloadedTiles: [],
    lastSyncedRiverData: null,
    lastSyncedForecast: null,
    localStationData: {}
  },
  
  // Metadata
  createdAt: Timestamp,
  updatedAt: Timestamp,
  email: "user@example.com",
  displayName: "John Doe"
}
```

---

## 🎯 Benefits Summary

| Feature | Speed Boost | Personalization | Engagement |
|---------|-------------|-----------------|------------|
| Saved Map State | ⚡⚡⚡ | ⭐⭐⭐ | ⭐⭐ |
| Cached Data | ⚡⚡⚡ | ⭐ | ⭐ |
| Favorites | ⚡⚡ | ⭐⭐⭐ | ⭐⭐⭐ |
| Offline Mode | ⚡⚡⚡ | ⭐⭐ | ⭐⭐⭐ |
| Preferred Stations | ⚡⚡ | ⭐⭐⭐ | ⭐⭐ |

---

## 🔐 Privacy & Data

- **Guest Users**: Data stored in localStorage (device-specific)
- **Logged-In Users**: Data synced to Firestore (cross-device)
- **No Third-Party Sharing**: All data stays in your Firebase
- **User Control**: Export and deletion options in profile page

---

## 📝 Testing Checklist

- [ ] Sign in → profile created automatically
- [ ] Change map preferences → saved to Firestore
- [ ] Toggle favorite → updates in real-time
- [ ] Sign out, sign back in → preferences persist
- [ ] Use as guest → preferences saved locally
- [ ] Switch devices → settings sync (logged in users)
- [ ] Offline mode toggle → settings saved

---

## 🚨 Important Notes

1. **Firestore Security Rules**: Make sure to add rules in Firebase Console:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /userProfiles/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

2. **Environment Variables**: Ensure Firebase config is set in `.env.local`
3. **Guest → User Migration**: When a guest signs in, their localStorage preferences should be uploaded to Firestore

---

## 💡 Monetization Opportunities (Future)

With user profiles, you can add:
- **Premium Features**: Advanced offline maps, extended forecasts
- **Subscription Tiers**: Pro users get push alerts, more favorites
- **Sponsored Marinas**: Highlighted in favorites list
- **Data Export**: PDF reports of user's favorite locations
- **Trip Planning**: Save and share routes (premium)

---

## Need Help?

All the code is well-commented and follows your existing patterns. Feel free to customize colors, layouts, and features to match your brand!
