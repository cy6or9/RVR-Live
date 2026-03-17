// src/hooks/useDeviceNav.ts
/**
 * Comprehensive device navigation hook for compass heading and GPS speed/course
 * 
 * Key features:
 * - Multi-source heading with quality scoring
 * - Proper Android alpha/beta/gamma rotation matrix math
 * - Always-on GPS for speed + course (not fallback-only)
 * - Explicit device vs travel modes
 * - Circular statistics (not linear EMA)
 * - Calibration offset persistence
 * - iOS permission gating
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================================
// Types
// ============================================================================

export type HeadingSource =
  | "ios-webkit"
  | "android-compass-math"
  | "absolute-orientation-sensor"
  | "gps-course"
  | "none";

export type NavMode = "device" | "travel";

interface HeadingSample {
  heading: number; // 0-360
  quality: number; // 0-1
  timestamp: number;
}

export interface UseDeviceNavResult {
  activeHeadingDeg: number | null;
  deviceHeadingDeg: number | null;
  travelCourseDeg: number | null;
  speedMph: number;
  speedMps: number;
  source: HeadingSource;
  quality: number;
  gpsAccuracyM: number | null;

  mode: NavMode;
  setMode: (m: NavMode) => void;

  autoModeEnabled: boolean;
  setAutoModeEnabled: (enabled: boolean) => void;
  baseMode: NavMode;
  setBaseMode: (m: NavMode) => void;

  offsetDeg: number;
  setOffsetDeg: (fn: (v: number) => number) => void;

  requestMotionPermission: () => Promise<"granted" | "denied" | "not-needed">;

  // Raw debug values
  rawAlpha: number | null;
  rawBeta: number | null;
  rawGamma: number | null;
  webkitAccuracy: number | null;
}

// ============================================================================
// Constants
// ============================================================================

const CALIBRATION_KEY = "compass-calibration-offset-v2";
const AUTO_MODE_KEY = "compass-auto-mode-enabled";
const BASE_MODE_KEY = "compass-base-mode";
const HEADING_BUFFER_SIZE_IOS = 15;
const HEADING_BUFFER_SIZE_ANDROID = 22; // Optimized for smooth Android rotation
const SPEED_BUFFER_SIZE = 6;
const AUTO_MODE_SPEED_THRESHOLD = 2.5; // mph
const SPIKE_REJECTION_ANGLE_DEG = 30; // Reject heading changes > 30° at low speed
const SPIKE_REJECTION_SPEED_MPS = 1.5; // ~3.4 mph
const PITCH_ROLL_MAX_DEG = 60; // Reject samples with excessive tilt
const GPS_MIN_ACCURACY_M = 50;
const GPS_MIN_DISTANCE_M = 5;
const GPS_MIN_INTERVAL_S = 0.8;
const GPS_MAX_INTERVAL_S = 5.0;
const COURSE_FLIP_THRESHOLD_DEG = 150; // Detect sudden ~180° flips
const SPEED_DECAY_TIMEOUT_MS = 5000; // Decay speed to 0 after 5s no update
const MIN_SPEED_FOR_COURSE_MPS = 0.5; // ~1.1 mph

// ============================================================================
// Math Utilities
// ============================================================================

const deg2rad = (deg: number): number => (deg * Math.PI) / 180;
const rad2deg = (rad: number): number => (rad * 180) / Math.PI;

const normalizeAngle = (angle: number): number => {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
};

const angularDifference = (a: number, b: number): number => {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
};

/**
 * Circular mean of angles with quality and recency weighting
 * Uses sin/cos method, NOT linear averaging
 * Newer samples weighted slightly higher for Android responsiveness
 */
const circularMean = (samples: HeadingSample[], isAndroid: boolean = false): number => {
  if (samples.length === 0) return 0;

  let sumSin = 0;
  let sumCos = 0;
  let totalWeight = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    let weight = sample.quality;
    
    // Android: weight newer samples slightly higher (1.0 to 1.3x)
    if (isAndroid && samples.length > 1) {
      const recencyFactor = 1.0 + (i / (samples.length - 1)) * 0.3;
      weight *= recencyFactor;
    }
    
    const rad = deg2rad(sample.heading);
    sumSin += Math.sin(rad) * weight;
    sumCos += Math.cos(rad) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return samples[samples.length - 1].heading;

  const meanRad = Math.atan2(sumSin / totalWeight, sumCos / totalWeight);
  return normalizeAngle(rad2deg(meanRad));
};

/**
 * Haversine distance in meters
 */
const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3;
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δφ = deg2rad(lat2 - lat1);
  const Δλ = deg2rad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Bearing from point1 to point2
 */
const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δλ = deg2rad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return normalizeAngle(rad2deg(Math.atan2(y, x)));
};

/**
 * Android compass heading from alpha/beta/gamma using full rotation matrix
 * with proper tilt compensation.
 * 
 * Uses W3C DeviceOrientation spec rotation matrix (Z-X'-Y'') to compute:
 * - heading: compass direction (0-360°)
 * - pitch: forward/backward tilt
 * - roll: left/right tilt
 * 
 * Reference: https://www.w3.org/TR/orientation-event/
 */
const computeAndroidCompassHeading = (
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number
): { headingDeg: number; pitchDeg: number; rollDeg: number } => {
  // Convert to radians
  const alphaRad = deg2rad(alpha);
  const betaRad = deg2rad(beta);
  const gammaRad = deg2rad(gamma);

  // Compute rotation matrix elements (Z-X'-Y'' rotation order)
  const cA = Math.cos(alphaRad);
  const sA = Math.sin(alphaRad);
  const cB = Math.cos(betaRad);
  const sB = Math.sin(betaRad);
  const cG = Math.cos(gammaRad);
  const sG = Math.sin(gammaRad);

  // Full rotation matrix R = Rz(alpha) * Rx(beta) * Ry(gamma)
  const R11 = cA * cG - sA * sB * sG;
  const R21 = sA * cG + cA * sB * sG;
  const R31 = -cB * sG;
  const R32 = sB;
  const R33 = cB * cG;

  // Compute tilt-compensated heading using atan2(R21, R11)
  // This projects device forward direction onto horizontal plane
  let headingRad = Math.atan2(R21, R11);
  let headingDeg = normalizeAngle(rad2deg(headingRad));

  // Adjust for screen orientation
  headingDeg = normalizeAngle(headingDeg - screenOrientation);

  // Compute pitch and roll for gating
  const pitchDeg = rad2deg(Math.asin(R32));
  const rollDeg = rad2deg(Math.atan2(-R31, R33));

  return { headingDeg, pitchDeg, rollDeg };
};

const getScreenOrientation = (): number => {
  if (typeof window === "undefined") return 0;
  
  // Prefer Screen Orientation API
  if (window.screen?.orientation?.angle !== undefined) {
    return window.screen.orientation.angle;
  }
  
  // Fallback to deprecated window.orientation
  if (typeof window.orientation === "number") {
    return window.orientation;
  }
  
  return 0;
};

const isIOS = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

// ============================================================================
// Main Hook
// ============================================================================

export function useDeviceNav(): UseDeviceNavResult {
  // State
  const [deviceHeadingDeg, setDeviceHeadingDeg] = useState<number | null>(null);
  const [travelCourseDeg, setTravelCourseDeg] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState<number>(0);
  const [speedMph, setSpeedMph] = useState<number>(0);
  const [source, setSource] = useState<HeadingSource>("none");
  const [quality, setQuality] = useState<number>(0);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [mode, setMode] = useState<NavMode>("device");
  const [autoModeEnabled, setAutoModeEnabled] = useState<boolean>(false);
  const [baseMode, setBaseMode] = useState<NavMode>("device");
  const [offsetDeg, setOffsetDeg] = useState<number>(0);

  // Raw debug values
  const [rawAlpha, setRawAlpha] = useState<number | null>(null);
  const [rawBeta, setRawBeta] = useState<number | null>(null);
  const [rawGamma, setRawGamma] = useState<number | null>(null);
  const [webkitAccuracy, setWebkitAccuracy] = useState<number | null>(null);

  // Refs
  const headingBufferRef = useRef<HeadingSample[]>([]);
  const speedBufferRef = useRef<number[]>([]);
  const gpsWatchIdRef = useRef<number | null>(null);
  const lastGpsRef = useRef<{
    lat: number;
    lon: number;
    time: number;
    course: number | null;
  } | null>(null);
  const lastSpeedUpdateRef = useRef<number>(0);
  const lastCourseRef = useRef<number | null>(null);
  const absoluteOrientationSensorRef = useRef<any>(null);
  const motionPermissionGranted = useRef<boolean>(false);
  const lastAcceptedAndroidHeadingRef = useRef<number | null>(null);

  // Load persisted calibration offset and auto mode settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(CALIBRATION_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) setOffsetDeg(parsed);
    }

    const savedAutoMode = localStorage.getItem(AUTO_MODE_KEY);
    if (savedAutoMode === "true") setAutoModeEnabled(true);

    const savedBaseMode = localStorage.getItem(BASE_MODE_KEY) as NavMode | null;
    if (savedBaseMode === "device" || savedBaseMode === "travel") {
      setBaseMode(savedBaseMode);
    }
  }, []);

  // Save calibration offset
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CALIBRATION_KEY, offsetDeg.toString());
  }, [offsetDeg]);

  // Save auto mode and base mode settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTO_MODE_KEY, autoModeEnabled.toString());
  }, [autoModeEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(BASE_MODE_KEY, baseMode);
  }, [baseMode]);

  // ============================================================================
  // GPS Tracking (Always-On for Speed + Course)
  // ============================================================================

  const setupGPS = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    if (gpsWatchIdRef.current !== null) {
      return; // Already running
    }

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading, accuracy } = position.coords;
        const now = Date.now();

        setGpsAccuracyM(accuracy || null);

        // Handle speed
        let currentSpeedMps: number | null = null;

        if (speed !== null && speed >= 0) {
          // Use GPS-provided speed
          currentSpeedMps = speed;
        } else if (lastGpsRef.current) {
          // Compute speed from position change
          const prev = lastGpsRef.current;
          const dt = (now - prev.time) / 1000;
          const distance = haversineDistance(prev.lat, prev.lon, latitude, longitude);

          if (dt >= GPS_MIN_INTERVAL_S && dt <= GPS_MAX_INTERVAL_S && distance >= GPS_MIN_DISTANCE_M) {
            currentSpeedMps = distance / dt;
          }
        }

        // Update speed buffers and state
        if (currentSpeedMps !== null) {
          // SUPPRESS GPS JITTER: reject very low speeds with poor accuracy
          if (currentSpeedMps < 0.4 && (accuracy === null || accuracy > 30)) {
            // Likely GPS noise, not real movement
            return;
          }

          speedBufferRef.current.push(currentSpeedMps);
          if (speedBufferRef.current.length > SPEED_BUFFER_SIZE) {
            speedBufferRef.current.shift();
          }

          // Median filter to remove spikes
          const sorted = [...speedBufferRef.current].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];

          setSpeedMps(median);
          setSpeedMph(median * 2.23694);
          lastSpeedUpdateRef.current = now;
        }

        // RELIABLE MOVEMENT DETECTION
        // True only when speed is confirmed above noise threshold with good accuracy
        const isMovingReliable =
          speedMps > 0.8 &&
          accuracy !== null &&
          accuracy < 25 &&
          speedBufferRef.current.length >= 3;

        // Handle course (travel direction)
        let currentCourse: number | null = null;

        if (accuracy && accuracy < GPS_MIN_ACCURACY_M) {
          const effectiveSpeed = speedMps;

          if (heading !== null && heading >= 0 && effectiveSpeed > MIN_SPEED_FOR_COURSE_MPS) {
            // Use GPS-provided heading
            currentCourse = heading;
          } else if (lastGpsRef.current && effectiveSpeed > MIN_SPEED_FOR_COURSE_MPS) {
            // Compute bearing from movement
            const prev = lastGpsRef.current;
            const dt = (now - prev.time) / 1000;
            const distance = haversineDistance(prev.lat, prev.lon, latitude, longitude);

            if (
              dt >= GPS_MIN_INTERVAL_S &&
              dt <= GPS_MAX_INTERVAL_S &&
              distance >= GPS_MIN_DISTANCE_M
            ) {
              const bearing = calculateBearing(prev.lat, prev.lon, latitude, longitude);

              // Flip detection: reject sudden ~180° jumps
              if (lastCourseRef.current !== null) {
                const diff = Math.abs(angularDifference(bearing, lastCourseRef.current));
                if (diff > COURSE_FLIP_THRESHOLD_DEG && accuracy < 20) {
                  // Likely reversed/noisy, skip
                  console.warn("[useDeviceNav] Rejected flipped course:", bearing);
                } else {
                  currentCourse = bearing;
                }
              } else {
                currentCourse = bearing;
              }
            }
          }
        }

        // GATE COURSE UPDATES: Only update when reliably moving
        if (currentCourse !== null && isMovingReliable) {
          lastCourseRef.current = currentCourse;
          setTravelCourseDeg(currentCourse);
        }

        // Store position for next update
        lastGpsRef.current = {
          lat: latitude,
          lon: longitude,
          time: now,
          course: currentCourse,
        };
      },
      (error) => {
        console.error("[useDeviceNav] GPS error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      }
    );

    console.log("[useDeviceNav] GPS tracking started");
  }, [speedMps]);

  // Decay speed to 0 if no updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastSpeedUpdateRef.current > 0) {
        const elapsed = Date.now() - lastSpeedUpdateRef.current;
        if (elapsed > SPEED_DECAY_TIMEOUT_MS) {
          setSpeedMps(0);
          setSpeedMph(0);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // Sensor Setup
  // ============================================================================

  const addHeadingSample = useCallback(
    (heading: number, qual: number, src: HeadingSource) => {
      const sample: HeadingSample = {
        heading,
        quality: qual,
        timestamp: Date.now(),
      };

      headingBufferRef.current.push(sample);
      // Use larger buffer on Android for smoother rotation
      const android = !isIOS();
      const maxSize = android ? HEADING_BUFFER_SIZE_ANDROID : HEADING_BUFFER_SIZE_IOS;
      if (headingBufferRef.current.length > maxSize) {
        headingBufferRef.current.shift();
      }

      const mean = circularMean(headingBufferRef.current, android);
      const calibrated = normalizeAngle(mean + offsetDeg);

      setDeviceHeadingDeg(calibrated);
      setSource(src);
      setQuality(qual);
    },
    [offsetDeg]
  );

  // Setup AbsoluteOrientationSensor (Tier A on Android if available)
  const setupAbsoluteOrientationSensor = useCallback(() => {
    if (typeof window === "undefined" || !("AbsoluteOrientationSensor" in window)) {
      return false;
    }

    try {
      // @ts-ignore
      const sensor = new AbsoluteOrientationSensor({ frequency: 8 });

      sensor.addEventListener("reading", () => {
        const quat = sensor.quaternion;
        if (!quat || quat.length < 4) return;

        const [x, y, z, w] = quat;
        const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
        const heading = normalizeAngle(rad2deg(yaw));

        addHeadingSample(heading, 0.9, "absolute-orientation-sensor");
      });

      sensor.addEventListener("error", (event: any) => {
        console.error("[useDeviceNav] AbsoluteOrientationSensor error:", event.error);
      });

      sensor.start();
      absoluteOrientationSensorRef.current = sensor;
      console.log("[useDeviceNav] AbsoluteOrientationSensor started");
      return true;
    } catch (error) {
      console.error("[useDeviceNav] AbsoluteOrientationSensor failed:", error);
      return false;
    }
  }, [addHeadingSample]);

  // Setup deviceorientation (iOS webkit or Android compass math)
  const setupDeviceOrientation = useCallback(() => {
    const handler = (event: DeviceOrientationEvent) => {
      const { alpha, beta, gamma, absolute } = event;

      setRawAlpha(alpha);
      setRawBeta(beta);
      setRawGamma(gamma);

      // iOS Safari: webkitCompassHeading (TIER A)
      if ((event as any).webkitCompassHeading !== undefined) {
        const heading = (event as any).webkitCompassHeading;
        const accuracy = (event as any).webkitCompassAccuracy;

        setWebkitAccuracy(accuracy);

        // Quality from accuracy
        let qual = 0.8;
        if (accuracy !== undefined) {
          if (accuracy < 0) qual = 0.3;
          else if (accuracy <= 15) qual = 0.95;
          else if (accuracy <= 30) qual = 0.8;
          else if (accuracy <= 50) qual = 0.6;
          else qual = 0.4;
        }

        // webkitCompassHeading is already correct - use as is
        addHeadingSample(heading, qual, "ios-webkit");
        return;
      }

      // Android: Use rotation matrix math with tilt compensation
      if (alpha !== null && beta !== null && gamma !== null) {
        const screenOrientation = getScreenOrientation();
        const result = computeAndroidCompassHeading(alpha, beta, gamma, screenOrientation);
        const { headingDeg, pitchDeg, rollDeg } = result;

        // GATING: Reject samples with excessive tilt (Android only)
        if (Math.abs(pitchDeg) > PITCH_ROLL_MAX_DEG || Math.abs(rollDeg) > PITCH_ROLL_MAX_DEG) {
          // Sample rejected - do not add to buffer
          return;
        }

        // RELIABLE MOVEMENT DETECTION (for spike rejection)
        const isMovingReliable =
          speedMps > 0.8 &&
          gpsAccuracyM !== null &&
          gpsAccuracyM < 25 &&
          speedBufferRef.current.length >= 3;

        // SPIKE REJECTION: Reject sudden jumps when not reliably moving (Android only)
        if (lastAcceptedAndroidHeadingRef.current !== null) {
          const delta = Math.abs(angularDifference(headingDeg, lastAcceptedAndroidHeadingRef.current));
          if (delta > SPIKE_REJECTION_ANGLE_DEG && !isMovingReliable) {
            // Likely magnetometer spike - reject
            return;
          }
        }

        // Sample passed all gates - accept it
        lastAcceptedAndroidHeadingRef.current = headingDeg;

        // Quality based on absolute flag and sensor stability
        let qual = 0.7;
        if (absolute === true) {
          qual = 0.85; // Higher quality for absolute orientation
        } else {
          qual = 0.5; // Lower for relative
        }

        // Reduce quality for moderate tilt (but not reject)
        const maxTilt = Math.max(Math.abs(pitchDeg), Math.abs(rollDeg));
        if (maxTilt > 45) {
          qual *= 0.7;
        } else if (maxTilt > 30) {
          qual *= 0.85;
        }

        addHeadingSample(headingDeg, qual, "android-compass-math");
        return;
      }

      // Fallback: alpha-only (lowest quality)
      if (alpha !== null) {
        // Use alpha directly, but mark as very low quality
        const heading = normalizeAngle(alpha);
        addHeadingSample(heading, 0.3, "android-compass-math");
      }
    };

    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, [addHeadingSample, speedMps, gpsAccuracyM]);

  // Request motion permission (iOS 13+)
  const requestMotionPermission = useCallback(async (): Promise<
    "granted" | "denied" | "not-needed"
  > => {
    if (typeof window === "undefined") return "not-needed";

    if (typeof (DeviceOrientationEvent as any).requestPermission !== "function") {
      motionPermissionGranted.current = true;
      return "not-needed";
    }

    try {
      const permission = await (DeviceOrientationEvent as any).requestPermission();
      if (permission === "granted") {
        motionPermissionGranted.current = true;
        console.log("[useDeviceNav] Motion permission granted, sensors will initialize");
        return "granted";
      }
      console.warn("[useDeviceNav] Motion permission denied");
      return "denied";
    } catch (error) {
      console.error("[useDeviceNav] Permission request failed:", error);
      return "denied";
    }
  }, []);

  // Main sensor setup effect
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cleanupOrientation: (() => void) | null = null;

    const setup = async () => {
      // Check if we need permission
      const needsPermission =
        typeof (DeviceOrientationEvent as any).requestPermission === "function";

      if (needsPermission && !motionPermissionGranted.current) {
        // Don't auto-request, wait for user action
        return;
      }

      // Try sensors
      const sensorStarted = setupAbsoluteOrientationSensor();
      cleanupOrientation = setupDeviceOrientation();

      console.log(
        `[useDeviceNav] Sensors active: ${sensorStarted ? "AbsoluteOrientationSensor + " : ""}deviceorientation`
      );
    };

    setup();

    return () => {
      if (cleanupOrientation) cleanupOrientation();
      if (absoluteOrientationSensorRef.current) {
        try {
          absoluteOrientationSensorRef.current.stop();
        } catch (e) {}
        absoluteOrientationSensorRef.current = null;
      }
    };
  }, [setupAbsoluteOrientationSensor, setupDeviceOrientation, motionPermissionGranted.current]);

  // GPS setup effect
  useEffect(() => {
    setupGPS();

    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, [setupGPS]);

  // ============================================================================
  // Active Heading (Device or Travel based on mode + Auto mode logic)
  // ============================================================================

  // Auto mode: automatically switches to travel when speed > threshold
  let effectiveMode = mode;
  if (autoModeEnabled) {
    if (speedMph > AUTO_MODE_SPEED_THRESHOLD && gpsAccuracyM !== null && gpsAccuracyM < 50) {
      effectiveMode = "travel";
    } else {
      effectiveMode = baseMode;
    }
  }

  // Travel mode: remember last course when stopped (don't set to null)
  const activeHeadingDeg =
    effectiveMode === "travel"
      ? travelCourseDeg // Use last known course even when stopped
      : deviceHeadingDeg;

  return {
    activeHeadingDeg,
    deviceHeadingDeg,
    travelCourseDeg,
    speedMph,
    speedMps,
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
  };
}
