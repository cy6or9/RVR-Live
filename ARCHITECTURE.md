# User Profile System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React App (_app.js)                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              AuthProvider (AuthContext.js)                 │ │
│  │  - Manages Firebase authentication state                   │ │
│  │  - Tracks login/logout events                              │ │
│  │  - Provides user object and admin status                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         UserProfileProvider (UserProfileContext.js)        │ │
│  │  - Manages user profile state                              │ │
│  │  - Syncs with Firestore (logged-in users)                  │ │
│  │  - Syncs with localStorage (guest users)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         QueryClientProvider (React Query)                  │ │
│  │  - Manages API data caching                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │             Pages & Components                             │ │
│  │  - Use useAuth() hook                                      │ │
│  │  - Use useUserProfile() hook                               │ │
│  │  - Display FavoriteButton components                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Profile Context Flow

```
User Component
    │
    ├─ useAuth()
    │   └─ { user, isAdmin, loginWithGoogle, logout }
    │
    └─ useUserProfile()
        ├─ profile (current user's profile object)
        │   ├── mapPreferences
        │   ├── cachedData
        │   ├── favorites
        │   └── offlineMode
        │
        └─ Actions
            ├─ saveMapPreferences(prefs) → Firestore ↔ localStorage
            ├─ toggleFavorite(type, itemId) → Firestore ↔ localStorage
            ├─ checkIsFavorite(type, itemId) → sync
            ├─ togglePreferredStation(stationId) → Firestore ↔ localStorage
            ├─ updateCachedRiverData(data) → Firestore ↔ localStorage
            └─ updateOfflineSettings(settings) → Firestore ↔ localStorage
```

---

## Data Flow Diagram

### Logged-In User Flow

```
User Signs In
    │
    ▼
Firebase Auth
    │
    ▼
onAuthStateChanged (AuthContext)
    │
    ▼
UserProfileProvider loads profile
    │
    ├─ Check if profile exists in Firestore
    │
    ├─ YES: Load from Firestore
    │
    └─ NO: Create new profile
            │
            ├─ Check localStorage for guest data
            │
            ├─ YES: Migrate guest data to Firestore
            │       (profileMigration.js)
            │
            └─ NO: Create with defaults
                   (defaultUserProfile)
    │
    ▼
Profile Context Updated
    │
    ▼
Components Re-render with Profile Data
    │
    ▼
User Interacts (changes preferences, adds favorite)
    │
    ├─ Update local state immediately (optimistic UI)
    │
    ├─ Save to Firestore (async)
    │
    └─ On error: Revert local state
```

### Guest User Flow

```
Visitor (Not Logged In)
    │
    ▼
Default Profile Loaded
    │
    ├─ Check localStorage for guestProfile
    │
    ├─ YES: Load and use it
    │
    └─ NO: Use defaultUserProfile
    │
    ▼
User Interacts (changes map settings)
    │
    ├─ Update local state
    │
    ├─ Save to localStorage
    │
    └─ Persist across page reloads
    │
    ▼
User Decides to Sign In
    │
    ├─ Click "Login"
    │
    └─ Guest profile automatically migrated to Firestore
```

---

## File Relationships

```
src/
├─ pages/
│  ├─ _app.js
│  │  └─ Wraps AuthProvider → UserProfileProvider → QueryClientProvider
│  │
│  ├─ login.js
│  │  └─ Uses useAuth() for Google sign-in
│  │
│  ├─ profile.js (NEW)
│  │  ├─ Uses useAuth() for user info
│  │  ├─ Uses useUserProfile() for all profile features
│  │  └─ Displays 4 settings tabs
│  │
│  ├─ river-conditions.js
│  │  ├─ Uses useUserProfile() for favorites
│  │  └─ Imports FavoriteButton component
│  │
│  └─ weather.js
│     └─ Can use useUserProfile() for cached weather
│
├─ components/
│  ├─ Header.jsx
│  │  └─ Shows Profile link when logged in
│  │
│  ├─ FavoriteButton.jsx (NEW)
│  │  └─ Reusable component for favoriting any item
│  │
│  ├─ LockDamMap.jsx
│  │  └─ Can use useUserProfile() for saved map position
│  │
│  └─ OhioRiverActivityMap.jsx
│     └─ Can use useUserProfile() for saved preferences
│
├─ context/
│  ├─ AuthContext.js (MODIFIED)
│  │  └─ Added profile migration tracking
│  │
│  └─ UserProfileContext.js (NEW)
│     ├─ Provides useUserProfile() hook
│     └─ Manages sync between local/Firestore
│
└─ lib/
   ├─ firebase.js
   │  └─ Firebase initialization and auth helpers
   │
   ├─ userProfile.js (NEW)
   │  ├─ Firestore CRUD operations
   │  ├─ Profile helpers
   │  └─ Favorite/station management
   │
   ├─ profileMigration.js (NEW)
   │  └─ Guest → User profile transfer
   │
   ├─ queryClient.js
   │  └─ React Query setup
   │
   └─ locks.js
      └─ Lock/dam data
```

---

## State Management Architecture

```
                            Firestore (Cloud)
                                   │
                                   │
                         firestore.rules (Security)
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
              userProfiles/   articles/    comments/
              {userId}       {articleId}  {commentId}

                    ▲
                    │
            Firestore SDK
            (firebase/firestore)
                    │
                    │
         ┌──────────┴──────────────┐
         │                         │
         ▼                         ▼
    Logged-In User          Guest User
    (userId valid)          (userId = null)
         │                         │
         └──────────────┬──────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    UserProfileContext
    (React Context)
         │
    State: {
      profile: {
        mapPreferences: {...},
        cachedData: {...},
        favorites: {...},
        offlineMode: {...}
      },
      loading: boolean
    }
         │
    ┌────┴────────────────────┐
    │                         │
    ▼                         ▼
Components              useUserProfile()
re-render              Hook for access
```

---

## Component Dependency Tree

```
App (_app.js)
│
├─ AuthProvider
│  │
│  └─ UserProfileProvider
│     │
│     ├─ Header
│     │  └─ useAuth()
│     │  └─ Profile link (logged-in users)
│     │
│     ├─ /profile page
│     │  ├─ useAuth()
│     │  ├─ useUserProfile()
│     │  └─ 4 Settings Tabs
│     │
│     ├─ /river-conditions page
│     │  ├─ useAuth()
│     │  ├─ useUserProfile()
│     │  └─ Station list with FavoriteButton
│     │     └─ FavoriteButton
│     │        ├─ useAuth()
│     │        └─ useUserProfile()
│     │
│     ├─ /weather page
│     │  └─ useUserProfile() (optional)
│     │
│     └─ Footer
│        └─ Static (no hooks)
```

---

## Data Persistence Strategy

### Logged-In Users (Firestore Primary)
```
User Changes Setting
    │
    ▼
Local State Update (Optimistic UI)
    │
    ├─ User sees change immediately
    │
    └─ Async Firestore Update
       │
       ├─ On Success: No-op (state already correct)
       │
       └─ On Error: Revert local state + show error
```

### Guest Users (localStorage Primary)
```
User Changes Setting
    │
    ▼
Local State Update
    │
    ├─ Reflected immediately
    │
    └─ Saved to localStorage (sync)
       │
       └─ Persists across page reloads
           (until user signs in)
```

---

## Security & Isolation

```
Firestore Database Structure:

/firestore
└─ userProfiles/
   │
   ├─ 12345... (User A's UID)
   │  └─ User A's profile only
   │     └─ Only User A can read/write
   │
   ├─ 67890... (User B's UID)
   │  └─ User B's profile only
   │     └─ Only User B can read/write
   │
   └─ abcde... (User C's UID)
      └─ User C's profile only
         └─ Only User C can read/write

Firestore Security Rules (enforced server-side):
match /userProfiles/{userId} {
  allow read, write: if request.auth.uid == userId;
}
```

---

## Performance Optimizations

```
React Component Rendering
        │
        ├─ useAuth() → Minimal re-renders
        │             (only on auth state change)
        │
        └─ useUserProfile() 
           ├─ Profile loaded once from Firestore
           ├─ Cached in React state
           ├─ Updates applied immediately (optimistic)
           ├─ Async sync to Firestore (non-blocking)
           └─ Debounced map saves (1s delay)
```

---

## Integration Points

### Easy to Add:
```
✅ River Conditions Page
   - Add FavoriteButton next to stations
   - Filter by favorites
   - Show preferred stations first

✅ Map Components
   - Load saved location/zoom
   - Save on move/zoom (debounced)
   - Apply dark mode from profile

✅ Weather Page
   - Cache forecasts in profile
   - Show weather for favorite locations

✅ Navigation
   - Show/hide features based on login state
```

### Medium Complexity:
```
⚠️ Offline Mode
   - Service worker for caching
   - IndexedDB for storage
   - Sync on reconnect

⚠️ Push Notifications
   - Alert on favorites
   - Flood warnings
   - New conditions
```

### High Complexity:
```
🔴 Social Features
   - Share favorite spots
   - Comments on conditions
   - Trip planning

🔴 Analytics Dashboard
   - User behavior tracking
   - Engagement metrics
   - Usage patterns
```

---

## Deployment Architecture

```
Local Development
├─ .env.local (Firebase keys)
├─ npm run dev
├─ localhost:3000
└─ Firestore (test mode)

Netlify Production
├─ Netlify Env Vars (Firebase keys)
├─ npm run build
├─ npm run start
├─ RiverValleyReport.com
└─ Firestore (production rules)

Google Cloud
├─ Firebase Project
├─ Firestore Database
├─ Authentication
└─ Storage (future)
```

---

This architecture ensures:
- ✅ **Speed**: Cached data + optimistic UI
- ✅ **Security**: Firestore rules + user isolation
- ✅ **Scalability**: Firestore handles growth
- ✅ **Offline**: localStorage for guests
- ✅ **Sync**: Real-time Firestore updates
- ✅ **DX**: Clean React hooks + context
