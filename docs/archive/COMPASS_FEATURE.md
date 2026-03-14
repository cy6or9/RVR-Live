# Device Compass Feature

## Overview

A real-time device orientation compass with GPS fallback that integrates wind direction data, perfect for marine and outdoor navigation on the Ohio River.

## Features

### 1. **DeviceCompass Component** (`src/components/DeviceCompass.tsx`)
- Uses device orientation sensors (gyroscope/magnetometer) when available
- **GPS + map bearing fallback** when sensors unavailable or unsupported
- **Speed calculation** from GPS with selectable units (mph, knots, km/h)
- Rotates in real-time as the user turns
- Smooth motion with exponential moving average filter
- **High-contrast text** with drop shadows for outdoor visibility
- Shows cardinal directions (N, S, E, W, NE, SE, SW, NW)
- Degree markers for precise navigation
- Red triangle pointing to device heading
- **Cyan wind arrow** showing where wind is blowing TO (not from)
- **Corrected orientation** (flipped 180° for proper compass reading)

### 2. **Multi-Source Heading Detection**
The compass intelligently selects the best heading source:
1. **iOS Safari**: Uses `webkitCompassHeading` (true north, most accurate)
2. **Android/Chrome**: Uses `DeviceOrientationEvent.alpha` (magnetic north)
3. **GPS Fallback**: Calculates bearing from GPS movement when sensors unavailable
4. **Automatic Detection**: Tests sensors and falls back gracefully

### 3. **Speed Calculation**
- Calculates user speed from GPS movement
- Three unit options: mph, knots, km/h
- Tap speed display to cycle between units
- Uses both GPS-reported speed and calculated speed from position changes
- Filters out noise (ignores speeds below movement threshold)

### 4. **Permission Handling**
- Universal permission prompt for all browsers
- Requests both DeviceOrientation and DeviceMotion permissions
- Falls back to GPS if permission denied
- Shows clear status indicators (checking, granted, denied, GPS mode)

### 5. **Integration with RiverBottomBar**
- Toggle between static WindCompass and DeviceCompass
- Click "Device Compass →" / "← Static Compass" to switch modes
- Maintains all existing weather data display
- Wind data automatically overlays on device compass

### 6. **Standalone Compass Page** (`/compass`)
- Dedicated page for compass testing and usage
- Side-by-side comparison of static vs device compass
- Automatic wind data fetching based on user location
- Usage instructions and browser compatibility info

## How It Works

### Device Orientation API
```typescript
// iOS Safari (preferred) - corrected orientation
compassHeading = (event.webkitCompassHeading + 180) % 360

// Android/others - corrected orientation
compassHeading = (180 - event.alpha + 360) % 360
```

### GPS Fallback System
When sensors aren't available:
```typescript
// Calculate bearing from two GPS positions
bearing = atan2(
  sin(Δλ) * cos(φ2),
  cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ)
)

// Calculate speed from distance and time
speed = distance / timeDiff
```

### Speed Calculation
Three measurement systems supported:
```typescript
// Conversions
mph → knots: mph * 0.868976
mph → km/h: mph * 1.60934
m/s → mph: mps * 2.23694
```

Speed sources (in order of preference):
1. GPS-reported speed (if available and > 0.5 m/s)
2. Calculated from position changes (if moved > 5 meters)
3. Zero when stationary

### Wind Direction Logic
- **Meteorological Convention**: Wind direction = where wind comes FROM
- **User-Friendly Display**: Arrow points where wind is going TO
- **Implementation**: `windToDirection = (windFrom + 180) % 360`

### Smooth Rotation
```typescript
// Exponential moving average to prevent jitter
smoothed = current + (newValue - current) * 0.15
```

### Relative Positioning
```typescript
// Wind arrow rotates relative to compass (which rotates with device)
windArrowRotation = windToDirection - deviceHeading
```

## Sensor Detection & Fallback

The compass follows this priority chain:

1. **Check for DeviceOrientationEvent support**
   - If not supported → GPS fallback

2. **Check if permission required**
   - iOS 13+ or browsers requiring permission → Show prompt
   - Others → Test sensors

3. **Test sensor response**
   - Wait 2 seconds for sensor data
   - If no data → GPS fallback
   - If data received → Use sensors

4. **GPS Fallback Mode**
   - Track GPS position continuously
   - Calculate bearing from movement
   - Calculate speed from position changes
   - Requires movement > 5 meters to update bearing

## Browser Compatibility

| Platform | Browser | Support | Notes |
|----------|---------|---------|-------|
| iOS 13+ | Safari | ✅ Full | Requires permission grant, GPS fallback if denied |
| iOS 12 | Safari | ✅ Auto | No permission needed |
| Android | Chrome | ✅ Full | Auto-granted, GPS fallback if sensors fail |
| Android | Firefox | ✅ Full | Auto-granted, GPS fallback if sensors fail |
| Android | Samsung | ✅ Full | Auto-granted, GPS fallback if sensors fail |
| Desktop | Any | ⚠️ GPS | No orientation sensors, uses GPS fallback |

## Usage

### In RiverBottomBar
```jsx
<RiverBottomBar
  windDirDeg={windDirection}
  windSpeedMph={windSpeed}
  useDeviceCompass={false} // optional, defaults to false
  // ... other props
/>
```

### Standalone Component
```jsx
import { DeviceCompass } from "@/components/DeviceCompass";

<DeviceCompass
  windDirectionDeg={270} // optional, wind from west
  windSpeedMph={12.5}    // optional, wind speed
  size={200}             // optional, compass size in pixels
/>
```

### Permission Handling
```javascript
// Component automatically handles permission for all browsers
// iOS 13+ and other browsers that require permission will show prompt
// If permission denied, automatically falls back to GPS

// Fallback indicators:
// - "📍 GPS Mode" badge when using GPS
// - "Checking sensors..." while testing
// - "Sensor access denied. Using GPS fallback." if denied
```

## Components

### DeviceCompass.tsx
- **Props:**
  - `windDirectionDeg?: number | null` - Wind direction (meteorological)
  - `windSpeedMph?: number | null` - Wind speed
  - `size?: number` - Compass diameter (default: 160px)
  - `onRequestPermission?: () => void` - Callback when permission requested

- **States:**
  - `heading` - Current device heading (0-360°)
  - `permissionState` - granted | denied | prompt | checking
  - `isCalibrating` - True when device needs calibration
  - `userSpeed` - Calculated speed in mph
  - `speedUnit` - Selected unit: mph | knots | kmh
  - `useGpsFallback` - True when using GPS instead of sensors

- **Features:**
  - Automatic sensor detection
  - GPS fallback when sensors unavailable
  - Speed calculation with unit conversion
  - High-contrast text for visibility
  - Smooth rotation with jitter filtering

### WindCompass.tsx (existing)
- Static compass for comparison
- Shows wind "from" direction with arrow pointing "to"
- No device sensors required

## Calibration

If compass shows "Move device in figure-8 pattern":
1. Hold device flat (parallel to ground)
2. Move in a figure-8 motion
3. Continue for 10-15 seconds
4. Compass will activate automatically

## Speed Unit Selection

Tap the speed display to cycle through units:
- **mph** (miles per hour) - Default, common in US
- **knots** (nautical miles per hour) - Standard for marine navigation
- **km/h** (kilometers per hour) - Metric standard

The selected unit persists across uses and applies to GPS-calculated speed.

## GPS Fallback Behavior

When using GPS mode (sensors unavailable):
- **Initial Position**: Compass shows last known heading or 0°
- **Movement Required**: Must move > 5 meters to calculate new bearing
- **Speed Threshold**: Speed only shown if > 0.2 mph to filter noise
- **Update Rate**: Bearing updates every 0.5 seconds when moving
- **Accuracy**: Depends on GPS accuracy (typically 5-10 meters)
- **Battery**: GPS fallback uses more battery than sensors

## Text Visibility Enhancements

All text now includes:
- **Drop shadows**: `drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]`
- **Larger fonts**: Cardinal directions scaled up (N is 18px, others 16px/14px)
- **Higher contrast**: White text on dark backgrounds
- **Background panels**: Text labels have semi-transparent dark backgrounds
- **Bold weights**: All critical text uses font-bold
- **Opacity tuning**: Text opacity increased from 70% to 90%

Makes the compass readable in:
- Direct sunlight
- Low light conditions
- Against bright backgrounds
- While in motion

## Future Enhancements

- [x] GPS fallback for heading
- [x] Speed calculation with units
- [x] Universal permission prompts
- [x] High-contrast text
- [x] Corrected orientation (180° flip)
- [ ] Save user preference (device vs static compass)
- [ ] Save speed unit preference
- [ ] Add compass bearing lock/unlock
- [ ] Show magnetic vs true north
- [ ] Add waypoint navigation overlay
- [ ] Integrate with map view for heading indicator
- [ ] Add heading history trail
- [ ] Augmented reality overlay (AR.js integration)
- [ ] Offline compass (works without network)

## Testing

Visit `/compass` page to:
- Test device orientation support
- Grant permissions (iOS)
- Compare static vs device compass
- View current wind data
- Read usage instructions

## Security & Privacy

- **Permissions:** iOS requires explicit user consent
- **Data:** Device orientation data stays on device (not sent to server)
- **Wind Data:** Fetched from Open-Meteo API using device location
- **Location:** Only used for weather/wind data, not stored
