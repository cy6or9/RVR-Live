# Admin Map Editing Features

## Overview
Admin users (triggaj51@gmail.com) can now edit map data including river path points, lock/dam locations, and NOAA station locations.

## Features Implemented

### 1. Admin Authentication
- Admin-only features visible when `isAdmin === true` (from Firebase auth)
- Admin email: `triggaj51@gmail.com`
- Button "🔧 Edit Map" appears only in Admin mode on river-conditions page

### 2. Admin Map Editor Modal
- Located at `src/components/AdminMapEditor.jsx`
- Provides 4 main functions:

#### A. Edit Lock/Dam Positions
- View all locks with current coordinates
- Placeholder for drag-and-drop functionality (marked "coming soon")
- Save button to persist changes to backend
- UI shows: ID, Name, River Mile, Lat, Lon for each lock

#### B. Edit Station Positions
- View all NOAA stations with current coordinates
- Placeholder for drag-and-drop functionality (marked "coming soon")
- Save button to persist changes
- UI shows: ID, Township, State, Lat, Lon, AHPS code for each station

#### C. Add New Station
- Form with fields:
  - **ID** (USGS site code, e.g., "03151500")
  - **Township** (administrative region)
  - **State** (two-letter abbreviation, e.g., "WV")
  - **Latitude** (numeric, validated)
  - **Longitude** (numeric, validated)
  - **AHPS** (optional NOAA gauge ID)
- Validates required fields and numeric coordinates
- Success/error messages with 2-second auto-dismiss

#### D. Add New Lock/Dam
- Form with fields:
  - **ID** (unique identifier)
  - **Name** (full name, e.g., "Belleville Lock")
  - **River Mile** (numeric, position on river)
  - **Latitude** (numeric, validated)
  - **Longitude** (numeric, validated)
- Validates required fields and numeric coordinates
- Confirmation dialogs prevent accidental additions

### 3. Backend API Endpoint
- Located at `src/pages/api/admin/map-data.js`
- POST endpoint supporting actions:

| Action | Parameters | Response |
|--------|-----------|----------|
| `updateRiverPoints` | `segments: []` | Saves river polyline segments |
| `updateLocks` | `locks: []` | Saves lock positions and metadata |
| `updateStations` | `stations: []` | Saves station positions and metadata |
| `addStation` | `{id, township, state, lat, lon, ahps}` | Creates new station, returns 201 |
| `removeStation` | `{id}` | Deletes station by ID |
| `addLock` | `{id, name, riverMile, lat, lon}` | Creates new lock, returns 201 |
| `removeLock` | `{id}` | Deletes lock by ID |

All responses return: `{ success: true/false, message, action, data }`

### 4. Integration with River Conditions Page
- Admin button visible in map controls section (only when isAdmin=true)
- Modal opens on click
- Callbacks wire up to update local state:
  - `onUpdateLocks(newLocks)` - Updates lock array
  - `onUpdateStations(newStations)` - Updates station array
  - `onAddStation(station)` - Adds new station to array
  - `onRemoveStation(stationId)` - Removes station by ID
  - `onAddLock(lock)` - Adds new lock to array
  - `onRemoveLock(lockId)` - Removes lock by ID

## File Structure
```
src/
  components/
    AdminMapEditor.jsx          (630+ lines, main modal UI)
  pages/
    river-conditions.js         (updated with admin button + modal)
    api/admin/
      map-data.js              (backend endpoint for updates)
```

## Current Limitations & Future Work

### Partially Complete (Placeholder UI)
- **Drag-and-drop editing**: UI shows "(Drag on map to update position — coming soon)"
  - Backend API ready for coordinates
  - Need to implement Leaflet `draggable: true` on markers
  - Need `dragend` event listeners to capture new positions
  - Need to sync changes across all open client instances

### Not Yet Implemented
- **Database persistence**: Currently logs to server console, doesn't persist to database
  - Need to connect to Firebase Firestore, PostgreSQL, or MongoDB
  - Need to save river polyline points, lock data, and station data
  - Need to retrieve persisted data on app load
  
- **Multi-user real-time sync**: Changes don't broadcast to other logged-in users
  - Option A: WebSocket server for instant push updates
  - Option B: Polling mechanism (check every 30s for updates)
  - Option C: Firebase Realtime Database for automatic sync
  - Currently: Client-side state updates only (single user session)

## Testing Checklist

- [ ] Log in as triggaj51@gmail.com
- [ ] Verify "🔧 Edit Map" button appears
- [ ] Click button, verify modal opens
- [ ] Switch between edit modes (Locks, Stations, Add Station, Add Lock)
- [ ] Try adding a station with missing fields → should show error
- [ ] Try adding a station with invalid lat/lon → should show error
- [ ] Add valid station → should show success message and appear in list
- [ ] Try removing a station → should show confirmation
- [ ] Check server console for `[ADMIN]` log messages confirming API calls
- [ ] Verify modal closes cleanly
- [ ] Log out → button should disappear

## Notes
- All form validations are client-side; backend provides server-side validation too
- Success/error messages auto-dismiss after 2 seconds
- No data persistence currently (ready for database integration)
- Drag-and-drop feature marked as "coming soon" with clear UI placeholder
- Feature fully functional for form-based add/remove operations
