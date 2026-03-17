// /src/lib/userProfile.js
// User profile management for RiverValleyReport
// Handles saved map state, cached data, favorites, and offline mode preferences

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { app, firebaseEnabled } from "./firebase";

let db = null;

if (firebaseEnabled && app) {
  db = getFirestore(app);
}

// Default user profile structure
export const defaultUserProfile = {
  // Map State
  mapPreferences: {
    defaultLocation: { lat: 38.5, lon: -84.5 }, // Center of Ohio River
    zoom: 8,
    layers: {
      waterLevels: true,
      weatherRadar: false,
      locksDams: true,
      hazardZones: true,
      traffic: false,
    },
    darkMode: false,
  },

  // Cached Data (for fast loads)
  cachedData: {
    lastSeenRiverData: null,
    lastSeenForecast: null,
    lastUpdated: null,
    preferredStations: [], // Array of station IDs
    cachedHazardReports: [],
    savedStations: [], // For quick access
  },

  // Favorites
  favorites: {
    gauges: [], // Array of gauge/station IDs
    locksDams: [], // Array of lock IDs
    towns: [], // Array of town names or IDs
    marinas: [], // Array of marina IDs
  },

  // Offline Mode
  offlineMode: {
    enabled: false,
    downloadedTiles: [],
    lastSyncedRiverData: null,
    lastSyncedForecast: null,
    localStationData: {},
  },

  // User metadata
  createdAt: null,
  updatedAt: null,
  email: "",
  displayName: "",

  // Privileges / Subscription
  privileges: {
    tier: "Basic", // "Basic" | "Plus" | "Premium"
  },

  // Login and usage stats
  stats: {
    lastLoginAt: null,
    lastLogoutAt: null,
    totalOnlineSeconds: 0,
  },

  // Last known location (when Find Me is used)
  lastLocation: null,
};

/**
 * Create a new user profile in Firestore
 * @param {string} userId - Firebase user UID
 * @param {object} initialData - Optional initial data to merge with defaults
 * @returns {Promise<object>} Created profile
 */
export async function createUserProfile(userId, initialData = {}) {
  if (!firebaseEnabled || !db) {
    return null;
  }

  try {
    const userRef = doc(db, "userProfiles", userId);
    
    // Check if profile already exists
    const existingDoc = await getDoc(userRef);
    
    if (existingDoc.exists()) {
      // Profile exists - only update the fields that are provided
      console.log("[userProfile] Profile exists for user:", userId);
      console.log("[userProfile] Updating with fields:", Object.keys(initialData));
      console.log("[userProfile] Update data:", { 
        ...initialData, 
        photoURL: initialData.photoURL ? 'present' : 'null' 
      });
      
      const updates = {
        ...initialData,
        updatedAt: serverTimestamp(),
      };
      
      // Don't overwrite privileges if not provided
      if (initialData.privileges) {
        updates.privileges = {
          ...(existingDoc.data().privileges || {}),
          ...initialData.privileges,
        };
      }
      
      await updateDoc(userRef, updates);
      console.log("[userProfile] Profile updated successfully");
      return { ...existingDoc.data(), ...updates };
    } else {
      // New profile - create with defaults
      console.log("[userProfile] Creating NEW profile for:", initialData.email);
      const profile = {
        ...defaultUserProfile,
        ...initialData,
        privileges: {
          tier: "Basic", // Always default to Basic
          ...initialData.privileges,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(userRef, profile);
      console.log("[userProfile] New profile created successfully");
      return profile;
    }
  } catch (error) {
    console.error("[userProfile] Error in createUserProfile:", error);
    throw error;
  }
}

/**
 * Get user profile from Firestore
 * @param {string} userId - Firebase user UID
 * @returns {Promise<object|null>} User profile or null if not found
 */
export async function getUserProfile(userId) {
  if (!firebaseEnabled || !db) {

    return defaultUserProfile;
  }

  try {
    const userRef = doc(db, "userProfiles", userId);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      // Create profile if it doesn't exist

      return await createUserProfile(userId);
    }
  } catch (error) {

    return defaultUserProfile;
  }
}

/**
 * Update user profile in Firestore
 * @param {string} userId - Firebase user UID
 * @param {object} updates - Partial profile data to update
 * @returns {Promise<void>}
 */
export async function updateUserProfile(userId, updates) {
  if (!firebaseEnabled || !db) {

    return;
  }

  try {
    const userRef = doc(db, "userProfiles", userId);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

  } catch (error) {

    throw error;
  }
}

/**
 * Update map preferences
 * @param {string} userId - Firebase user UID
 * @param {object} preferences - Map preferences to update
 */
export async function updateMapPreferences(userId, preferences) {
  return updateUserProfile(userId, {
    mapPreferences: preferences,
  });
}

/**
 * Update cached data
 * @param {string} userId - Firebase user UID
 * @param {object} cachedData - Cached data to update
 */
export async function updateCachedData(userId, cachedData) {
  return updateUserProfile(userId, {
    "cachedData.lastUpdated": serverTimestamp(),
    ...Object.keys(cachedData).reduce((acc, key) => {
      acc[`cachedData.${key}`] = cachedData[key];
      return acc;
    }, {}),
  });
}

/**
 * Add a favorite (lock, town, or marina)
 * @param {string} userId - Firebase user UID
 * @param {string} type - 'locksDams' | 'towns' | 'marinas'
 * @param {string} itemId - ID of the item to favorite
 */
export async function addFavorite(userId, type, itemId) {
  if (!firebaseEnabled || !db) return;

  try {
    const profile = await getUserProfile(userId);
    const currentFavorites = profile.favorites?.[type] || [];

    if (!currentFavorites.includes(itemId)) {
      currentFavorites.push(itemId);
      await updateUserProfile(userId, {
        [`favorites.${type}`]: currentFavorites,
      });
    }
  } catch (error) {

  }
}

/**
 * Remove a favorite
 * @param {string} userId - Firebase user UID
 * @param {string} type - 'locksDams' | 'towns' | 'marinas'
 * @param {string} itemId - ID of the item to unfavorite
 */
export async function removeFavorite(userId, type, itemId) {
  if (!firebaseEnabled || !db) return;

  try {
    const profile = await getUserProfile(userId);
    const currentFavorites = profile.favorites?.[type] || [];
    const filtered = currentFavorites.filter((id) => id !== itemId);

    await updateUserProfile(userId, {
      [`favorites.${type}`]: filtered,
    });
  } catch (error) {

  }
}

/**
 * Check if an item is favorited
 * @param {object} profile - User profile
 * @param {string} type - 'locksDams' | 'towns' | 'marinas'
 * @param {string} itemId - ID of the item
 * @returns {boolean}
 */
export function isFavorite(profile, type, itemId) {
  return profile?.favorites?.[type]?.includes(itemId) || false;
}

/**
 * Update offline mode settings
 * @param {string} userId - Firebase user UID
 * @param {object} offlineSettings - Offline settings to update
 */
export async function updateOfflineMode(userId, offlineSettings) {
  return updateUserProfile(userId, {
    offlineMode: offlineSettings,
  });
}

/**
 * Add a preferred station for quick access
 * @param {string} userId - Firebase user UID
 * @param {string} stationId - Station ID to add
 */
export async function addPreferredStation(userId, stationId) {
  if (!firebaseEnabled || !db) return;

  try {
    const profile = await getUserProfile(userId);
    const currentStations = profile.cachedData?.preferredStations || [];

    if (!currentStations.includes(stationId)) {
      currentStations.push(stationId);
      await updateUserProfile(userId, {
        "cachedData.preferredStations": currentStations,
      });
    }
  } catch (error) {

  }
}

/**
 * Remove a preferred station
 * @param {string} userId - Firebase user UID
 * @param {string} stationId - Station ID to remove
 */
export async function removePreferredStation(userId, stationId) {
  if (!firebaseEnabled || !db) return;

  try {
    const profile = await getUserProfile(userId);
    const currentStations = profile.cachedData?.preferredStations || [];
    const filtered = currentStations.filter((id) => id !== stationId);

    await updateUserProfile(userId, {
      "cachedData.preferredStations": filtered,
    });
  } catch (error) {

  }
}

/**
 * Update last login timestamp and create profile if missing
 * FIXED: Uses setDoc with merge to avoid offline errors
 * FIXED: Added abort signal handling and timeout protection
 * @param {string} userId - Firebase user UID
 * @param {string} email - User email
 */
export async function setLastLogin(userId, email, displayName = '', photoURL = null) {
  if (!firebaseEnabled || !db) return;

  try {
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 8000); // 8 second timeout

    try {
      const userRef = doc(db, "userProfiles", userId);
      
      // First, get existing stats to preserve totalOnlineSeconds
      let existingStats = {};
      try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          existingStats = docSnap.data().stats || {};
        }
      } catch (err) {
        // If we can't read the doc, just use empty stats
        console.log("[userProfile] Could not fetch existing stats, creating new");
      }
      
      // Build update object with proper nested structure
      const updates = {
        uid: userId,
        stats: {
          ...existingStats,
          lastLoginAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      };
      
      // Only set these fields if they have values
      if (email) updates.email = email;
      if (displayName) updates.displayName = displayName;
      if (photoURL) updates.photoURL = photoURL;
      
      console.log("[userProfile] setLastLogin updating user", userId);
      
      await setDoc(userRef, updates, { merge: true });
      console.log("[userProfile] setLastLogin complete for", userId);
    } finally {
      clearTimeout(timeoutId);
    }
    
  } catch (error) {
    // Log error but don't re-throw - allow login to continue
    console.warn("[userProfile] Warning: Could not set last login:", error.message);
    if (error.message.includes('aborted') || error.name === 'AbortError') {
      console.warn("[userProfile] Login write timed out - continuing anyway");
    }
  }
}

/**
 * Update last logout timestamp
 * FIXED: Uses setDoc with merge to avoid updateDoc on non-existent docs
 * FIXED: Added better error handling for network issues
 * @param {string} userId - Firebase user UID
 */
export async function setLastLogout(userId) {
  if (!firebaseEnabled || !db) return;

  try {
    const userRef = doc(db, "userProfiles", userId);
    
    // Get existing stats to preserve other fields
    let existingStats = {};
    try {
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        existingStats = docSnap.data().stats || {};
      }
    } catch (err) {
      console.log("[userProfile] Could not fetch existing stats for logout");
    }
    
    // Use setDoc with merge to safely update without checking existence
    await setDoc(userRef, {
      stats: {
        ...existingStats,
        lastLogoutAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    // Don't re-throw on logout - just warn
    console.warn("[userProfile] Warning setting last logout:", error.message);
  }
}

/**
 * Save session duration (called once on logout/tab close)
 * FIXED: Uses setDoc with merge to avoid updateDoc on non-existent docs
 * FIXED: Added timeout protection and abort signal handling
 * @param {string} userId - Firebase user UID
 * @param {number} elapsedSeconds - Number of seconds to add
 */
export async function saveSessionDuration(userId, elapsedSeconds) {
  if (!firebaseEnabled || !db) return;
  if (elapsedSeconds <= 0) return;

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 8000); // 8 second timeout

    try {
      const userRef = doc(db, "userProfiles", userId);
      
      // Get existing stats to preserve lastLoginAt and other fields
      let existingStats = {};
      try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          existingStats = docSnap.data().stats || {};
        }
      } catch (err) {
        console.log("[userProfile] Could not fetch existing stats for session save");
      }
      
      // Calculate new total seconds
      const newTotalSeconds = (existingStats.totalOnlineSeconds || 0) + elapsedSeconds;
      
      // Use setDoc with merge to safely update
      await setDoc(userRef, {
        stats: {
          ...existingStats,
          totalOnlineSeconds: newTotalSeconds,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      console.log("[userProfile] Session duration saved:", elapsedSeconds, "seconds");
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.warn("[userProfile] Warning saving session duration:", error.message);
  }
}

/**
 * Update user's last known location (from Find Me)
 * @param {string} userId - Firebase user UID
 * @param {object} location - Location data
 * @param {number} location.lat - Latitude
 * @param {number} location.lon - Longitude
 * @param {string} [location.city] - City name
 * @param {string} [location.state] - State name
 */
export async function updateUserLocation(userId, location) {
  if (!firebaseEnabled || !db) return;
  if (!location?.lat || !location?.lon) return;

  try {
    console.log("[userProfile] Updating user location:", {
      userId,
      city: location.city,
      state: location.state,
      county: location.county,
    });
    
    await updateUserProfile(userId, {
      lastLocation: {
        lat: location.lat,
        lon: location.lon,
        city: location.city || null,
        state: location.state || null,
        county: location.county || null,
        updatedAt: serverTimestamp(),
      },
    });
    
    console.log("[userProfile] Location updated successfully");
  } catch (error) {
    console.error("Error updating user location:", error);
  }
}

export { db };
