// src/components/DeviceCompass.tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { useDeviceNav } from "@/hooks/useDeviceNav";

interface DeviceCompassProps {
  /** Wind direction in meteorological degrees (0 = from North, 90 = from East) */
  windDirectionDeg?: number | null;
  /** Optional wind speed to show, in mph */
  windSpeedMph?: number | null;
  /** Size of the compass in pixels */
  size?: number;
  /** User's current GPS location */
  userLocation?: { lat: number; lon: number } | null;
}

type SpeedUnit = 'mph' | 'knots' | 'kmh';

// 16-point compass with detailed directions
const DIRECTIONS = [
  { label: "N", angle: 0 },
  { label: "NNE", angle: 22.5 },
  { label: "NE", angle: 45 },
  { label: "ENE", angle: 67.5 },
  { label: "E", angle: 90 },
  { label: "ESE", angle: 112.5 },
  { label: "SE", angle: 135 },
  { label: "SSE", angle: 157.5 },
  { label: "S", angle: 180 },
  { label: "SSW", angle: 202.5 },
  { label: "SW", angle: 225 },
  { label: "WSW", angle: 247.5 },
  { label: "W", angle: 270 },
  { label: "WNW", angle: 292.5 },
  { label: "NW", angle: 315 },
  { label: "NNW", angle: 337.5 },
];

// Speed conversion functions
const convertSpeed = {
  mphToKnots: (mph: number) => mph * 0.868976,
  mphToKmh: (mph: number) => mph * 1.60934,
};

/**
 * Device-orientation compass using multi-source heading strategy.
 * Uses useDeviceNav hook for all sensor and GPS logic.
 */
export function DeviceCompass({ 
  windDirectionDeg, 
  windSpeedMph,
  size = 160,
  userLocation,
}: DeviceCompassProps) {
  // Use the navigation hook
  const {
    activeHeadingDeg,
    deviceHeadingDeg,
    travelCourseDeg,
    speedMph,
    source,
    quality,
    gpsAccuracyM,
    mode,
    setMode,
    autoModeEnabled,
    setAutoModeEnabled,
    baseMode,
    setBaseMode,
    offsetDeg,
    setOffsetDeg,
    requestMotionPermission,
    rawAlpha,
    rawBeta,
    rawGamma,
    webkitAccuracy,
  } = useDeviceNav();

  const [speedUnit, setSpeedUnit] = React.useState<SpeedUnit>('mph');
  const [showDebug, setShowDebug] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = React.useState(false);
  const [permissionState, setPermissionState] = React.useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isCalibrating, setIsCalibrating] = React.useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = React.useState(0);
  const [calibrationMode, setCalibrationMode] = React.useState<'northUp' | 'figure8'>('figure8');
  
  const rotationHeadingRef = React.useRef<number>(0);
  const lastValidSpeedRef = React.useRef<number>(0);
  const lastMovementTimestampRef = React.useRef<number>(0);
  const consecutiveValidSamplesRef = React.useRef<number>(0);
  const [displaySpeed, setDisplaySpeed] = React.useState<number>(0);

  // Check initial permission state
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof (DeviceOrientationEvent as any).requestPermission !== "function") {
      setPermissionState('granted');
    }
  }, []);

  // Smooth rotation - fixed interpolation to avoid jitter
  React.useEffect(() => {
    if (activeHeadingDeg === null) return;
    
    const current = rotationHeadingRef.current;
    let target = activeHeadingDeg;
    let diff = target - (current % 360);
    
    // Take shortest angular path
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    
    // Fixed interpolation - hook already handles smoothing
    const isAndroid = !/iPad|iPhone|iPod/.test(navigator.userAgent);
    let lerp = 0.7;
    
    if (isAndroid) {
      // Fixed smooth interpolation for Android
      lerp = 0.18;
    } else {
      // iOS: keep quality-based behavior
      if (quality < 0.5) {
        lerp = 0.3;
      } else if (quality > 0.8) {
        lerp = 0.9;
      }
    }
    
    // Update rotation with fixed interpolation
    let newRotation = current + diff * lerp;
    // Normalize to 0-360
    newRotation = ((newRotation % 360) + 360) % 360;
    rotationHeadingRef.current = newRotation;
  }, [activeHeadingDeg, quality]);

  // Speed filtering with dead zone and decay
  React.useEffect(() => {
    const now = Date.now();
    const SPEED_THRESHOLD = 0.8; // mph
    const ACCURACY_THRESHOLD = 30; // meters
    const DECAY_DURATION = 2000; // 2 seconds
    const MIN_VALID_SAMPLES = 2;

    // Check if speed is valid (not GPS jitter)
    const isValidSpeed = speedMph >= SPEED_THRESHOLD && 
                         (gpsAccuracyM === null || gpsAccuracyM <= ACCURACY_THRESHOLD);

    if (isValidSpeed) {
      // Valid speed detected
      consecutiveValidSamplesRef.current += 1;
      
      if (consecutiveValidSamplesRef.current >= MIN_VALID_SAMPLES) {
        // Confirmed movement - update display immediately
        lastValidSpeedRef.current = speedMph;
        lastMovementTimestampRef.current = now;
        setDisplaySpeed(speedMph);
      }
    } else {
      // Below threshold or poor accuracy
      consecutiveValidSamplesRef.current = 0;
      
      if (lastMovementTimestampRef.current > 0) {
        const timeSinceMovement = now - lastMovementTimestampRef.current;
        
        if (gpsAccuracyM !== null && gpsAccuracyM > 50) {
          // Very poor accuracy - snap to zero
          setDisplaySpeed(0);
          lastValidSpeedRef.current = 0;
        } else if (timeSinceMovement < DECAY_DURATION) {
          // Decay to zero over 2 seconds
          const decayFactor = 1 - (timeSinceMovement / DECAY_DURATION);
          setDisplaySpeed(lastValidSpeedRef.current * decayFactor);
        } else {
          // Decay complete
          setDisplaySpeed(0);
          lastValidSpeedRef.current = 0;
        }
      } else {
        // Never moved or already at zero
        setDisplaySpeed(0);
      }
    }
  }, [speedMph, gpsAccuracyM]);

  const handleRequestPermission = async () => {
    try {
      const result = await requestMotionPermission();
      if (result === 'granted') {
        setPermissionState('granted');
        // Force a small delay to ensure sensors initialize
        setTimeout(() => {
          console.log('[DeviceCompass] Sensors should be active now');
        }, 100);
      } else if (result === 'denied') {
        setPermissionState('denied');
      } else {
        setPermissionState('granted'); // not-needed
      }
    } catch (error) {
      console.error('[DeviceCompass] Permission request error:', error);
      setPermissionState('denied');
    }
  };

  // Format speed display
  const getSpeedDisplay = () => {
    if (displaySpeed === 0 || displaySpeed < 0.1) return { value: '0.0', unit: speedUnit };
    
    let value: number;
    switch (speedUnit) {
      case 'knots':
        value = displaySpeed * 0.868976;
        break;
      case 'kmh':
        value = displaySpeed * 1.60934;
        break;
      default:
        value = displaySpeed;
    }
    
    return { value: value.toFixed(1), unit: speedUnit };
  };

  const cycleSpeedUnit = () => {
    const units: SpeedUnit[] = ['mph', 'knots', 'kmh'];
    const currentIndex = units.indexOf(speedUnit);
    const nextIndex = (currentIndex + 1) % units.length;
    setSpeedUnit(units[nextIndex]);
  };

  // Calculate wind direction relative to compass
  const hasWind = windDirectionDeg != null && !Number.isNaN(windDirectionDeg);
  const hasHeading = activeHeadingDeg !== null;
  
  // Wind arrow points TO where wind is going (opposite of FROM direction)
  const windToDirection = hasWind ? (windDirectionDeg! + 180) % 360 : 0;
  
  const rotationHeading = rotationHeadingRef.current;
  
  // Android rotation direction fix: flip sign at render layer only
  const isAndroid = !/iPad|iPhone|iPod/.test(navigator.userAgent);
  const uiRotationHeading = isAndroid ? -rotationHeading : rotationHeading;
  
  const windArrowRotation = hasWind && hasHeading 
    ? windToDirection - uiRotationHeading
    : hasWind 
      ? windToDirection 
      : 0;

  const radius = size / 2;
  const speedDisplay = getSpeedDisplay();

  // Source display names
  const sourceDisplayName: Record<string, string> = {
    'ios-webkit': 'iOS Compass',
    'android-compass-math': 'Android Compass',
    'absolute-orientation-sensor': 'Sensor API',
    'gps-course': 'GPS Course',
    'none': 'No Sensor',
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        {/* Permission request UI */}
      {permissionState === 'prompt' && (
        <button
          onClick={handleRequestPermission}
          className="mb-2 px-6 py-3 text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors shadow-lg"
        >
          Enable Motion & Orientation
        </button>
      )}
      
      {permissionState === 'denied' && (
        <div className="px-5 py-3 text-sm bg-red-900/50 text-red-100 font-semibold rounded-lg border-2 border-red-500/70 shadow-lg shadow-red-500/30">
          Sensor access denied. Speed may still work with location.
        </div>
      )}

      {/* Info display */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-xl border-2 border-emerald-400/50 shadow-lg shadow-emerald-500/30">
          <div className="text-white font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] text-sm">
            HDG: <span className="text-emerald-400 text-base">
              {hasHeading ? `${Math.round(activeHeadingDeg)}°` : '—'}
            </span>
          </div>
          {hasWind && (
            <div className="text-cyan-300 font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] text-sm">
              WIND: <span className="text-cyan-400 text-base">
                {Math.round(windToDirection)}°
              </span>
            </div>
          )}
        </div>
        {windSpeedMph != null && !Number.isNaN(windSpeedMph) && (
          <div className="text-cyan-300 font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] bg-black/70 backdrop-blur-sm px-4 py-1.5 rounded-lg border-2 border-cyan-400/50 shadow-lg shadow-cyan-500/30 text-sm">
            Wind: {windSpeedMph.toFixed(1)} mph
          </div>
        )}
      </div>

      {/* Debug information panel */}
      {showDebug && (
        <div className="bg-black/80 backdrop-blur-sm px-4 py-3 rounded-lg border border-white/20 text-xs font-mono space-y-1 w-full max-w-sm">
          <div className="text-white/70">
            Source: <span className="text-emerald-400">{sourceDisplayName[source] || source}</span>
          </div>
          <div className="text-white/70">
            Quality: <span className="text-emerald-400">{(quality * 100).toFixed(0)}%</span>
          </div>
          <div className="text-white/70">
            Speed: <span className="text-emerald-400">{displaySpeed.toFixed(1)} mph</span> (raw: {speedMph.toFixed(1)})
          </div>
          <div className="text-white/70">
            GPS Accuracy: <span className="text-emerald-400">
              {gpsAccuracyM !== null ? `${gpsAccuracyM.toFixed(0)}m` : '—'}
            </span>
          </div>
          <div className="text-white/70">
            Device Hdg: <span className="text-emerald-400">
              {deviceHeadingDeg !== null ? `${Math.round(deviceHeadingDeg)}°` : '—'}
            </span>
          </div>
          <div className="text-white/70">
            Travel Course: <span className="text-cyan-400">
              {travelCourseDeg !== null ? `${Math.round(travelCourseDeg)}°` : '—'}
            </span>
          </div>
          <div className="text-white/70">
            Offset: <span className="text-emerald-400">{offsetDeg.toFixed(0)}°</span>
          </div>
        </div>
      )}

      {/* Compass */}
      <div 
        className="relative rounded-full border-4 border-emerald-400/40 bg-gradient-to-b from-slate-800/95 to-slate-950/98 shadow-2xl shadow-emerald-500/20"
        style={{ width: size, height: size }}
      >
        {/* Neon green glow ring */}
        <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-emerald-500/20 via-green-500/20 to-emerald-500/20 blur-xl" />
        
        {/* Center SVG for markers and arrows */}
        <svg
          className="absolute inset-0"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ pointerEvents: 'none' }}
        >
          {/* Degree tick marks */}
          <g transform={hasHeading ? `rotate(${-uiRotationHeading} ${radius} ${radius})` : ''}>
            {Array.from({ length: 36 }, (_, i) => i * 10).map((angle) => {
              const isMajor = angle % 30 === 0;
              const rad = (angle - 90) * (Math.PI / 180);
              const innerRadius = radius - (isMajor ? 18 : 9);
              const outerRadius = radius - 5;
              
              const x1 = radius + innerRadius * Math.cos(rad);
              const y1 = radius + innerRadius * Math.sin(rad);
              const x2 = radius + outerRadius * Math.cos(rad);
              const y2 = radius + outerRadius * Math.sin(rad);
              const isNorth = angle === 0;

              return (
                <line
                  key={angle}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isNorth ? "#10b981" : "white"}
                  strokeOpacity={isNorth ? 0.9 : isMajor ? 0.8 : 0.4}
                  strokeWidth={isMajor ? 3 : 2}
                />
              );
            })}
            
            {/* Direction labels */}
            {DIRECTIONS.map((direction) => {
              const rad = (direction.angle - 90) * (Math.PI / 180);
              const labelRadius = radius - 28;
              const labelX = radius + labelRadius * Math.cos(rad);
              const labelY = radius + labelRadius * Math.sin(rad);
              const isNorth = direction.angle === 0;
              const isMajor = direction.label.length === 1;

              return (
                <text
                  key={direction.label}
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isNorth ? "#10b981" : isMajor ? "white" : "rgba(255,255,255,0.7)"}
                  fontSize={isNorth ? "20" : isMajor ? "18" : "12"}
                  fontWeight="bold"
                  className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                  transform={`rotate(${uiRotationHeading} ${labelX} ${labelY})`}
                >
                  {direction.label}
                </text>
              );
            })}
          </g>

          {/* Wind arrow (cyan) */}
          {hasWind && (
            <g transform={`rotate(${windArrowRotation} ${radius} ${radius})`}>
              <line
                x1={radius}
                y1={radius}
                x2={radius}
                y2={radius - 50}
                stroke="#06b6d4"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.95"
              />
              <polygon
                points={`${radius},${radius - 58} ${radius - 9},${radius - 42} ${radius + 9},${radius - 42}`}
                fill="#06b6d4"
                opacity="0.95"
              />
              <rect
                x={radius - 25}
                y={radius - 75}
                width="50"
                height="16"
                fill="rgba(0, 0, 0, 0.85)"
                rx="4"
              />
              <text
                x={radius}
                y={radius - 62}
                textAnchor="middle"
                fill="#06b6d4"
                fontSize="13"
                fontWeight="bold"
                className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
              >
                WIND
              </text>
            </g>
          )}

          {/* Center dot with neon green glow */}
          <circle
            cx={radius}
            cy={radius}
            r="8"
            fill="#10b981"
            opacity="0.3"
            filter="url(#glow)"
          />
          <circle
            cx={radius}
            cy={radius}
            r="5"
            fill="#10b981"
            opacity="0.95"
          />

          {/* Glow filter */}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Device heading pointer (red triangle) */}
          <polygon
            points={`${radius},12 ${radius - 20},45 ${radius + 20},45`}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.5"
            opacity="0.95"
          />
        </svg>
      </div>

      {/* Speed display with unit selector */}
      <button
        onClick={cycleSpeedUnit}
        className="px-6 py-2 bg-gradient-to-r from-slate-800/95 to-slate-900/95 rounded-xl border-2 border-emerald-400/50 hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-500/30 transition-all backdrop-blur-sm"
      >
        <div className="text-white font-semibold text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          <span className="text-emerald-400">{speedDisplay.value}</span>
          <span className="text-base ml-2 text-white/80">{speedDisplay.unit}</span>
        </div>
      </button>

      {/* Calibration controls */}
      {permissionState === 'granted' && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-emerald-400 text-xs font-semibold tracking-wide">
            CALIBRATION: {offsetDeg.toFixed(0)}°
          </div>
          {isCalibrating && (
            <div className="text-emerald-400 text-[10px] animate-pulse max-w-xs text-center">
              Move device in figure-8 motion...
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffsetDeg(prev => prev - 1)}
              className="px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600/80 text-white rounded-lg text-sm font-semibold transition-colors border border-white/20"
            >
              -1°
            </button>
            <button
              onClick={() => {
                if (offsetDeg === 0 && calibrationMode === 'figure8') {
                  // Start figure-8 calibration routine
                  setIsCalibrating(true);
                  setCalibrationCountdown(7);
                  const interval = setInterval(() => {
                    setCalibrationCountdown(prev => {
                      if (prev <= 1) {
                        clearInterval(interval);
                        setIsCalibrating(false);
                        // After figure-8, reset offset to 0 and trust the sensors
                        // The figure-8 motion calibrates the device's magnetometer
                        setOffsetDeg(() => 0);
                        return 0;
                      }
                      return prev - 1;
                    });
                  }, 1000);
                } else if (offsetDeg === 0 && calibrationMode === 'northUp') {
                  // Set current direction as North
                  if (deviceHeadingDeg !== null) {
                    const adjustment = Math.round(deviceHeadingDeg % 360);
                    setOffsetDeg(() => -adjustment);
                  }
                } else {
                  setOffsetDeg(() => 0);
                }
              }}
              className="px-4 py-1.5 bg-emerald-700/80 hover:bg-emerald-600/80 text-white rounded-lg text-sm font-semibold transition-colors border border-emerald-400/30"
            >
              {isCalibrating ? `Calibrate ${calibrationCountdown}s` : 'Reset'}
            </button>
            <button
              onClick={() => setOffsetDeg(prev => prev + 1)}
              className="px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600/80 text-white rounded-lg text-sm font-semibold transition-colors border border-white/20"
            >
              +1°
            </button>
          </div>
        </div>
      )}

      {/* Settings controls */}
      <div className="flex flex-col items-center gap-2 w-full max-w-sm">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
        >
          {showAdvanced ? '▲ Hide Settings' : '▼ Settings'}
        </button>

        {showAdvanced && (
          <div className="bg-black/90 backdrop-blur-sm px-4 py-4 rounded-lg border border-emerald-400/30 w-full space-y-4">
            {/* Mode Selection */}
            <div className="space-y-2">
              <div className="text-xs text-emerald-400 font-semibold">Navigation Mode</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (autoModeEnabled) {
                      setBaseMode('device');
                    } else {
                      setMode('device');
                    }
                  }}
                  className={
                    cn(
                      "flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors border",
                      (autoModeEnabled ? baseMode === 'device' : mode === 'device')
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-800/50 text-white/60 hover:text-white/80 border-white/20"
                    )
                  }
                >
                  DEVICE
                </button>
                <button
                  onClick={() => {
                    if (autoModeEnabled) {
                      setBaseMode('travel');
                    } else {
                      setMode('travel');
                    }
                  }}
                  className={
                    cn(
                      "flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors border",
                      (autoModeEnabled ? baseMode === 'travel' : mode === 'travel')
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-800/50 text-white/60 hover:text-white/80 border-white/20"
                    )
                  }
                >
                  TRAVEL
                </button>
              </div>
            </div>

            {/* Manual Calibration Mode */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-xs text-emerald-400 font-semibold">Manual Calibration</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCalibrationMode('northUp')}
                  className={
                    cn(
                      "flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors border",
                      calibrationMode === 'northUp'
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-800/50 text-white/60 hover:text-white/80 border-white/20"
                    )
                  }
                >
                  North Up
                </button>
                <button
                  onClick={() => setCalibrationMode('figure8')}
                  className={
                    cn(
                      "flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors border",
                      calibrationMode === 'figure8'
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-800/50 text-white/60 hover:text-white/80 border-white/20"
                    )
                  }
                >
                  Figure 8
                </button>
              </div>
              <div className="text-[10px] text-emerald-400">-When Reset is clicked at 0° offset.</div>
            </div>

            {/* Auto Mode Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="space-y-0.5">
                <div className="text-xs text-emerald-400 font-semibold">Auto Mode</div>
                <div className="text-[10px] text-emerald-400">Switch to travel at 2.5+ mph</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoModeEnabled}
                  onChange={(e) => setAutoModeEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Raw Sensor Values */}
            {(rawAlpha !== null || rawBeta !== null || rawGamma !== null) && (
              <div className="text-xs font-mono space-y-1 pt-2 border-t border-white/10">
                <div className="text-emerald-400 mb-1">Raw Sensor Values:</div>
                {rawAlpha !== null && (
                  <div className="text-emerald-400">α: {rawAlpha.toFixed(1)}°</div>
                )}
                {rawBeta !== null && (
                  <div className="text-emerald-400">β: {rawBeta.toFixed(1)}°</div>
                )}
                {rawGamma !== null && (
                  <div className="text-emerald-400">γ: {rawGamma.toFixed(1)}°</div>
                )}
                {webkitAccuracy !== null && (
                  <div className="text-emerald-400">Webkit Acc: {webkitAccuracy.toFixed(1)}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Section - Below Settings */}
      <div className="flex flex-col items-start gap-2 w-full max-w-sm">
        <button
          onClick={() => setShowInfoTooltip(!showInfoTooltip)}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-black/90 backdrop-blur-sm border-2 border-emerald-400/50 hover:border-emerald-400/80 hover:bg-emerald-500/20 transition-all shadow-lg shadow-emerald-500/20"
          title="Toggle help information"
        >
          <span className="text-emerald-400 text-sm font-bold">i</span>
          <span className="text-xs text-emerald-400 font-medium">Help & Info</span>
        </button>

        {/* Info Dropdown */}
        {showInfoTooltip && (
          <div className="w-full bg-black/95 backdrop-blur-md rounded-lg border-2 border-emerald-400/50 shadow-2xl shadow-emerald-500/30 max-h-[60vh] overflow-y-auto">
            <div className="p-4 space-y-4 text-xs text-emerald-400">
            {/* How to Use */}
            <div>
              <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                <span className="text-emerald-400">●</span> How to Use
              </h3>
              <div className="space-y-1.5 pl-4">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">1.</span>
                  <span>Tap "Enable Motion & Orientation" to grant sensor access (works on all browsers that support it)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">2.</span>
                  <span>If sensors aren't available, the compass automatically falls back to GPS + map bearing</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">3.</span>
                  <span>If prompted to calibrate, move your device in a figure-8 pattern</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">4.</span>
                  <span>The red triangle shows your current heading direction</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">5.</span>
                  <span>The cyan arrow shows where the wind is blowing TO (not from)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">6.</span>
                  <span>Tap the speed display to cycle between mph, knots, and km/h</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">7.</span>
                  <span>The compass face rotates as you turn, keeping North at the top of the world</span>
                </div>
              </div>
            </div>

            {/* Location Info */}
            {userLocation && (
              <div className="text-center text-emerald-400/80 text-[11px] border-t border-emerald-400/20 pt-2">
                Location: {userLocation.lat.toFixed(4)}°, {userLocation.lon.toFixed(4)}°
              </div>
            )}

            {/* Features */}
            <div className="border-t border-emerald-400/20 pt-3">
              <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                <span className="text-emerald-400">●</span> Features
              </h3>
              <ul className="space-y-1 pl-4">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Real-time device orientation tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  GPS + map bearing fallback when sensors unavailable
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Speed calculation from GPS (mph, knots, km/h)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Smooth rotation with motion damping
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Wind direction overlay (when location available)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  High-contrast text for outdoor visibility
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Cardinal direction labels (N, S, E, W, etc.)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Degree markers for precise navigation
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Works on iOS and Android devices
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Automatic sensor detection and fallback
                </li>
              </ul>
            </div>

            {/* Browser Compatibility */}
            <div className="bg-emerald-900/20 rounded-lg border border-emerald-400/30 p-3">
              <h4 className="text-sm font-semibold text-emerald-400 mb-2">
                Browser Compatibility
              </h4>
              <div className="space-y-1.5 text-[10px] text-emerald-400">
                <p>
                  <strong className="text-emerald-400">iOS:</strong> Requires iOS 13+ and Safari. Will prompt for motion & orientation permission.
                </p>
                <p>
                  <strong className="text-emerald-400">Android:</strong> Works in Chrome, Firefox, and Samsung Internet. Permission auto-granted.
                </p>
                <p>
                  <strong className="text-emerald-400">Desktop:</strong> Limited sensor support. Automatically falls back to GPS when available.
                </p>
                <p>
                  <strong className="text-emerald-400">GPS Fallback:</strong> When sensors unavailable, uses GPS location tracking to calculate heading and speed from movement.
                </p>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
    </>
  );
}
