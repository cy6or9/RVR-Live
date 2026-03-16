// src/hooks/useDeviceHeading.ts
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Heading source types in priority order (Tier A > Tier B > Tier C > GPS)
 */
export type HeadingSource =
  | "ios-webkit"                      // Tier A: iOS Safari webkitCompassHeading
  | "absolute-orientation-sensor"      // Tier A: Generic Sensor API
  | "deviceorientationabsolute"        // Tier B: deviceorientation with absolute flag
  | "deviceorientation"                // Tier C: deviceorientation alpha (relative)
  | "gps";                             // Safety Net: GPS course-over-ground

/**
 * Individual heading sample with quality score
 */
interface HeadingSample {
  headingDeg: number;  // 0-360
  quality: number;     // 0.0-1.0 (higher is better)
  source: HeadingSource;
  timestamp: number;
}

/**
 * Return type of the useDeviceHeading hook
 */
export interface UseDeviceHeadingResult {
  headingDeg: number | null;
  source: HeadingSource | null;
  quality: number;
  speedMph: number;
  offsetDeg: number;
  setOffsetDeg: (fn: (v: number) => number) => void;
  permissionState: "granted" | "denied" | "prompt" | "checking";
  requestPermission: () => Promise<void>;
}

const CALIBRATION_KEY = "compass-calibration-offset";
const CIRCULAR_BUFFER_SIZE_IOS = 15; // Rolling buffer for circular mean on iOS
const CIRCULAR_BUFFER_SIZE_ANDROID = 25; // Larger buffer for Android for better smoothing
const GPS_SPEED_THRESHOLD_LOW = 2;  // mph - below this, compass only
const GPS_SPEED_THRESHOLD_HIGH = 12; // mph - above this, GPS dominates
const GPS_MIN_ACCURACY = 50; // meters - skip GPS updates with worse accuracy
const GPS_MIN_DISTANCE = 10; // meters - minimum movement for bearing calculation
const COMPASS_QUALITY_THRESHOLD = 0.3; // Only use GPS if compass quality is below this
const MIN_SAMPLE_INTERVAL = 50; // ms - minimum time between samples to prevent overwhelming
const ANDROID_VARIANCE_WINDOW = 10; // Number of samples to check for variance

// Detect if running on iOS
const isIOS = (): boolean => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Convert degrees to radians
 */
const deg2rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Convert radians to degrees
 */
const rad2deg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Normalize angle to 0-360 range
 */
const normalizeAngle = (angle: number): number => {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
};

/**
 * Calculate circular mean of angles with quality weighting
 * MANDATORY: Uses sin/cos method, not linear averaging
 */
const circularMean = (samples: HeadingSample[]): number => {
  if (samples.length === 0) return 0;

  let sumSin = 0;
  let sumCos = 0;
  let totalWeight = 0;

  for (const sample of samples) {
    const weight = sample.quality;
    const rad = deg2rad(sample.headingDeg);
    sumSin += Math.sin(rad) * weight;
    sumCos += Math.cos(rad) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return samples[samples.length - 1].headingDeg;

  sumSin /= totalWeight;
  sumCos /= totalWeight;

  const meanRad = Math.atan2(sumSin, sumCos);
  const meanDeg = rad2deg(meanRad);

  return normalizeAngle(meanDeg);
};

/**
 * Calculate shortest angular difference (handles wrap-around)
 */
const angularDifference = (a: number, b: number): number => {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
};

/**
 * Blend two headings along shortest angular path
 */
const blendHeadings = (h1: number, h2: number, weight: number): number => {
  const diff = angularDifference(h2, h1);
  const blended = h1 + diff * weight;
  return normalizeAngle(blended);
};

/**
 * Calculate bearing between two GPS coordinates
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
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return normalizeAngle(rad2deg(θ));
};

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 */
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth radius in meters
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
 * Convert m/s to mph
 */
const mpsToMph = (mps: number): number => mps * 2.23694;

/**
 * High-accuracy multi-source compass hook with sensor fusion
 * 
 * Features:
 * - Multi-tier heading sources (iOS webkit, Sensor API, deviceorientation)
 * - GPS course-over-ground fusion when moving
 * - Quality scoring per sample
 * - Circular mean smoothing (NOT linear)
 * - Per-device calibration offset (localStorage)
 * - Handles 359° → 0° wrap correctly
 */
export function useDeviceHeading(): UseDeviceHeadingResult {
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [currentSource, setCurrentSource] = useState<HeadingSource | null>(null);
  const [currentQuality, setCurrentQuality] = useState<number>(0);
  const [speedMph, setSpeedMph] = useState<number>(0);
  const [offsetDeg, setOffsetDeg] = useState<number>(0);
  const [permissionState, setPermissionState] = useState<
    "granted" | "denied" | "prompt" | "checking"
  >("checking");

  // Circular buffer for heading samples
  const headingBufferRef = useRef<HeadingSample[]>([]);
  
  // GPS tracking state
  const gpsWatchIdRef = useRef<number | null>(null);
  const lastGpsPositionRef = useRef<{
    lat: number;
    lon: number;
    time: number;
  } | null>(null);
  const lastGpsBearingRef = useRef<number | null>(null);
  const gpsEnabledRef = useRef<boolean>(false);
  const lowQualityCountRef = useRef<number>(0);
  
  // Android-specific smoothing
  const lastSampleTimeRef = useRef<number>(0);
  const recentVarianceRef = useRef<number[]>([]);

  // Sensor API references
  const absoluteOrientationSensorRef = useRef<any>(null);

  /**
   * Load calibration offset from localStorage on mount
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const savedOffset = localStorage.getItem(CALIBRATION_KEY);
    if (savedOffset !== null) {
      const parsed = parseFloat(savedOffset);
      if (!isNaN(parsed)) {
        setOffsetDeg(parsed);
      }
    }
  }, []);

  /**
   * Save calibration offset to localStorage when changed
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CALIBRATION_KEY, offsetDeg.toString());
  }, [offsetDeg]);

  /**
   * Add a new heading sample to the circular buffer
   */
  const addHeadingSample = useCallback(
    (heading: number, quality: number, source: HeadingSource) => {
      const now = Date.now();
      const isiOS = isIOS();
      
      // Throttle samples on Android to prevent overwhelming the buffer
      if (!isiOS && (now - lastSampleTimeRef.current) < MIN_SAMPLE_INTERVAL) {
        return; // Skip this sample, too soon
      }
      lastSampleTimeRef.current = now;

      // On Android, adjust quality based on recent variance (stability)
      let adjustedQuality = quality;
      if (!isiOS && source !== "gps") {
        // Track recent headings to calculate variance
        if (headingBufferRef.current.length > 0) {
          const lastHeading = headingBufferRef.current[headingBufferRef.current.length - 1].headingDeg;
          const diff = Math.abs(angularDifference(heading, lastHeading));
          
          recentVarianceRef.current.push(diff);
          if (recentVarianceRef.current.length > ANDROID_VARIANCE_WINDOW) {
            recentVarianceRef.current.shift();
          }
          
          // Calculate average variance
          if (recentVarianceRef.current.length >= 5) {
            const avgVariance = recentVarianceRef.current.reduce((a, b) => a + b, 0) / recentVarianceRef.current.length;
            
            // High variance = lower quality
            // If variance > 10°, reduce quality
            if (avgVariance > 15) {
              adjustedQuality *= 0.5; // Very unstable
            } else if (avgVariance > 10) {
              adjustedQuality *= 0.7; // Somewhat unstable
            } else if (avgVariance < 3) {
              adjustedQuality *= 1.1; // Very stable, boost quality
              adjustedQuality = Math.min(1.0, adjustedQuality);
            }
          }
        }
      }

      const sample: HeadingSample = {
        headingDeg: heading,
        quality: adjustedQuality,
        source,
        timestamp: now,
      };

      headingBufferRef.current.push(sample);

      // Keep buffer size limited - larger buffer for Android for better smoothing
      const maxBufferSize = isiOS ? CIRCULAR_BUFFER_SIZE_IOS : CIRCULAR_BUFFER_SIZE_ANDROID;
      if (headingBufferRef.current.length > maxBufferSize) {
        headingBufferRef.current.shift();
      }

      // Compute circular mean of all samples
      const meanHeading = circularMean(headingBufferRef.current);

      // Apply calibration offset AFTER all calculations
      const calibratedHeading = normalizeAngle(meanHeading + offsetDeg);

      setHeadingDeg(calibratedHeading);
      setCurrentSource(source);
      setCurrentQuality(adjustedQuality);

      // On Android: Monitor quality and enable GPS only if quality drops
      if (!isiOS && !gpsEnabledRef.current) {
        if (adjustedQuality < COMPASS_QUALITY_THRESHOLD) {
          lowQualityCountRef.current++;
          // Enable GPS if quality is poor for 5 consecutive readings
          if (lowQualityCountRef.current >= 5) {
            console.log("[useDeviceHeading] Android: Poor compass quality detected, enabling GPS");
          }
        } else {
          lowQualityCountRef.current = 0;
        }
      }
    },
    [offsetDeg]
  );

  /**
   * Determine quality score from webkitCompassAccuracy
   * Lower accuracy value = higher quality
   */
  const getWebkitQuality = (accuracy: number | undefined): number => {
    if (accuracy === undefined || accuracy < 0) return 0.7; // default good quality
    
    // accuracy ranges: 
    // -1 = uncalibrated
    // 0-15 = high accuracy
    // 15-50 = medium accuracy
    // 50+ = low accuracy
    if (accuracy < 0) return 0.3;
    if (accuracy <= 15) return 0.95;
    if (accuracy <= 30) return 0.75;
    if (accuracy <= 50) return 0.5;
    return 0.3;
  };

  /**
   * Setup GPS tracking for speed and course-over-ground
   * On iOS: Always enable for speed tracking
   * On Android: Only enable when compass quality is poor
   */
  const setupGpsTracking = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    // Check if GPS is already running
    if (gpsWatchIdRef.current !== null) {
      return;
    }

    const isiOS = isIOS();
    
    // Use less aggressive GPS settings on Android to prevent flashing
    const gpsOptions = isiOS 
      ? {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000,
        }
      : {
          enableHighAccuracy: false, // Android: use lower power mode
          maximumAge: 10000, // Android: allow 10s cached position
          timeout: 10000, // Android: longer timeout to reduce re-requests
        };

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed: gpsSpeed, accuracy } = position.coords;
        const currentTime = Date.now();

        // Skip updates with poor accuracy
        if (accuracy && accuracy > GPS_MIN_ACCURACY) {
          return;
        }

        // Update speed (convert m/s to mph)
        if (gpsSpeed !== null && gpsSpeed >= 0) {
          const mph = mpsToMph(gpsSpeed);
          setSpeedMph(Math.round(mph * 10) / 10); // round to 1 decimal
        }

        // Calculate bearing from movement
        if (lastGpsPositionRef.current) {
          const prev = lastGpsPositionRef.current;
          const timeDiff = (currentTime - prev.time) / 1000; // seconds

          if (timeDiff > 1.0) {
            // Update at least every 1 second (was 0.5s)
            const distance = calculateDistance(
              prev.lat,
              prev.lon,
              latitude,
              longitude
            );

            // Only calculate bearing if moved significantly
            if (distance > GPS_MIN_DISTANCE) {
              const bearing = calculateBearing(
                prev.lat,
                prev.lon,
                latitude,
                longitude
              );
              lastGpsBearingRef.current = bearing;

              // Determine if we should use GPS bearing
              const currentSpeed = gpsSpeed !== null ? mpsToMph(gpsSpeed) : 0;

              // On Android, only use GPS bearing if compass quality is poor
              // On iOS, use normal fusion logic
              const shouldUseGps = isiOS || currentQuality < COMPASS_QUALITY_THRESHOLD;

              if (currentSpeed < GPS_SPEED_THRESHOLD_LOW) {
                // Low speed: compass only (GPS bearing not reliable)
                // Don't add GPS sample
              } else if (shouldUseGps && currentSpeed > GPS_SPEED_THRESHOLD_HIGH) {
                // High speed: GPS dominates (or full override if compass quality is poor)
                const compassQuality = currentQuality;
                
                if (compassQuality < 0.5) {
                  // Poor compass quality, use GPS exclusively
                  addHeadingSample(bearing, 0.9, "gps");
                } else {
                  // Good compass, but blend heavily toward GPS
                  addHeadingSample(bearing, 0.85, "gps");
                }
              } else if (shouldUseGps && currentSpeed >= GPS_SPEED_THRESHOLD_LOW) {
                // Medium speed: blend compass → GPS based on speed
                const blendFactor =
                  (currentSpeed - GPS_SPEED_THRESHOLD_LOW) /
                  (GPS_SPEED_THRESHOLD_HIGH - GPS_SPEED_THRESHOLD_LOW);
                
                // Add GPS sample with quality proportional to speed
                const gpsQuality = 0.6 + blendFactor * 0.3; // 0.6 to 0.9
                addHeadingSample(bearing, gpsQuality, "gps");
              }

              lastGpsPositionRef.current = {
                lat: latitude,
                lon: longitude,
                time: currentTime,
              };
            }
          }
        } else {
          lastGpsPositionRef.current = {
            lat: latitude,
            lon: longitude,
            time: currentTime,
          };
        }
      },
      (error) => {
        console.error("[useDeviceHeading] GPS error:", error);
      },
      gpsOptions
    );
    
    gpsEnabledRef.current = true;
    console.log(`[useDeviceHeading] GPS tracking started (${isiOS ? 'iOS' : 'Android'} mode)`);
  }, [addHeadingSample, currentQuality]);

  /**
   * Setup Absolute Orientation Sensor (Generic Sensor API)
   * Extract yaw from quaternion
   */
  const setupAbsoluteOrientationSensor = useCallback(() => {
    if (typeof window === "undefined") return false;

    // Check if AbsoluteOrientationSensor is available
    if (!("AbsoluteOrientationSensor" in window)) {
      return false;
    }

    try {
      // Use lower frequency on Android to prevent jitter (5Hz instead of 10Hz)
      const frequency = isIOS() ? 10 : 5;
      // @ts-ignore - AbsoluteOrientationSensor is not in TypeScript standard lib yet
      const sensor = new AbsoluteOrientationSensor({ frequency });

      sensor.addEventListener("reading", () => {
        // Extract quaternion [x, y, z, w]
        const quat = sensor.quaternion;
        if (!quat || quat.length < 4) return;

        const [x, y, z, w] = quat;

        // Convert quaternion to Euler angles (yaw)
        // Yaw = atan2(2*(w*z + x*y), 1 - 2*(y^2 + z^2))
        const yaw = Math.atan2(
          2 * (w * z + x * y),
          1 - 2 * (y * y + z * z)
        );

        let heading = rad2deg(yaw);
        heading = normalizeAngle(heading);

        // High quality for AbsoluteOrientationSensor
        addHeadingSample(heading, 0.9, "absolute-orientation-sensor");
      });

      sensor.addEventListener("error", (event: any) => {
        console.error("[useDeviceHeading] AbsoluteOrientationSensor error:", event.error);
      });

      sensor.start();
      absoluteOrientationSensorRef.current = sensor;

      console.log("[useDeviceHeading] AbsoluteOrientationSensor started");
      return true;
    } catch (error) {
      console.error("[useDeviceHeading] Failed to start AbsoluteOrientationSensor:", error);
      return false;
    }
  }, [addHeadingSample]);

  /**
   * Setup deviceorientation event listeners (iOS webkit, absolute, or fallback)
   */
  const setupDeviceOrientation = useCallback(() => {
    const handler = (event: DeviceOrientationEvent) => {
      let heading: number | null = null;
      let quality = 0.5;
      let source: HeadingSource = "deviceorientation";

      // TIER A: iOS Safari webkitCompassHeading (preferred)
      if ((event as any).webkitCompassHeading !== undefined) {
        heading = (event as any).webkitCompassHeading;
        const accuracy = (event as any).webkitCompassAccuracy;
        quality = getWebkitQuality(accuracy);
        source = "ios-webkit";
      }
      // TIER B: deviceorientationabsolute (absolute flag = true)
      else if (event.alpha !== null && event.absolute === true) {
        // Alpha on Android with absolute flag
        // Alpha: 0 = North, increases clockwise
        // Some Android devices provide better readings with webkitCompassHeading format
        heading = event.alpha;
        
        // Higher quality for absolute orientation on Android
        // Will be further adjusted by variance in addHeadingSample
        quality = 0.85; // Start with high quality, variance will adjust down if needed
        source = "deviceorientationabsolute";
      }
      // TIER C: deviceorientation alpha (fallback, relative heading)
      else if (event.alpha !== null) {
        heading = event.alpha;
        quality = 0.5; // Medium quality for relative orientation (was 0.4)
        source = "deviceorientation";
      }

      if (heading !== null) {
        addHeadingSample(heading, quality, source);
      }
    };

    window.addEventListener("deviceorientation", handler, true);

    return () => {
      window.removeEventListener("deviceorientation", handler, true);
    };
  }, [addHeadingSample]);

  /**
   * Request permission for device sensors (iOS 13+)
   */
  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined") return;

    const needsPermission =
      typeof (DeviceOrientationEvent as any).requestPermission === "function";

    if (!needsPermission) {
      setPermissionState("granted");
      return;
    }

    try {
      const permission = await (DeviceOrientationEvent as any).requestPermission();
      
      if (permission === "granted") {
        setPermissionState("granted");
      } else {
        setPermissionState("denied");
      }
    } catch (error) {
      console.error("[useDeviceHeading] Permission request failed:", error);
      setPermissionState("denied");
    }
  }, []);

  /**
   * Main setup effect: initialize all heading sources
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cleanupOrientation: (() => void) | null = null;

    const setup = async () => {
      // Check if sensors are supported
      if (!("DeviceOrientationEvent" in window)) {
        console.log("[useDeviceHeading] DeviceOrientation not supported");
        setPermissionState("granted");
        setupGpsTracking(); // GPS fallback only
        return;
      }

      // Check if permission is needed
      const needsPermission =
        typeof (DeviceOrientationEvent as any).requestPermission === "function";

      if (needsPermission && permissionState !== "granted") {
        setPermissionState("prompt");
        return;
      }

      // Permission granted or not needed, set up sensors
      setPermissionState("granted");

      // Try Absolute Orientation Sensor first (Tier A)
      const sensorStarted = setupAbsoluteOrientationSensor();

      // Always set up deviceorientation as well (fallback or additional source)
      cleanupOrientation = setupDeviceOrientation();

      // GPS setup strategy:
      // iOS: Always set up GPS for speed tracking and fusion
      // Android: Only set up if needed (will be enabled on-demand if quality drops)
      const isiOS = isIOS();
      if (isiOS) {
        setupGpsTracking();
      }

      if (sensorStarted) {
        console.log(`[useDeviceHeading] Multi-source compass active: AbsoluteOrientationSensor + deviceorientation ${isiOS ? '+ GPS' : '(GPS on-demand)'}`);
      } else {
        console.log(`[useDeviceHeading] Multi-source compass active: deviceorientation ${isiOS ? '+ GPS' : '(GPS on-demand)'}`);
      }
    };

    setup();

    return () => {
      // Cleanup
      if (cleanupOrientation) {
        cleanupOrientation();
      }

      if (absoluteOrientationSensorRef.current) {
        try {
          absoluteOrientationSensorRef.current.stop();
        } catch (error) {
          console.error("[useDeviceHeading] Error stopping sensor:", error);
        }
        absoluteOrientationSensorRef.current = null;
      }

      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, [
    permissionState,
    setupAbsoluteOrientationSensor,
    setupDeviceOrientation,
    setupGpsTracking,
  ]);

  /**
   * Monitor quality on Android and enable GPS on-demand if needed
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Only for Android, not iOS
    if (isIOS()) return;
    
    // Check if we should enable GPS based on quality
    if (!gpsEnabledRef.current && 
        lowQualityCountRef.current >= 5 && 
        permissionState === "granted") {
      console.log("[useDeviceHeading] Android: Enabling GPS due to poor compass quality");
      setupGpsTracking();
    }
  }, [currentQuality, permissionState, setupGpsTracking]);

  return {
    headingDeg,
    source: currentSource,
    quality: currentQuality,
    speedMph,
    offsetDeg,
    setOffsetDeg,
    permissionState,
    requestPermission,
  };
}
