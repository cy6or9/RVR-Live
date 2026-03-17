// /src/context/UserProfileContext.js
// Context for managing user profiles throughout the app

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import RiverLoadingAnimation from "@/components/RiverLoadingAnimation";
import {
  getUserProfile,
  updateUserProfile,
  updateMapPreferences,
  addFavorite,
  removeFavorite,
  isFavorite,
  addPreferredStation,
  removePreferredStation,
  defaultUserProfile,
} from "@/lib/userProfile";

const UserProfileContext = createContext(null);
export const useUserProfile = () => useContext(UserProfileContext);

export function UserProfileProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Load user profile when user logs in
  useEffect(() => {
    async function loadProfile() {
      if (authLoading) return;

      if (!user) {
        // Not logged in - clear any cached profiles and use guest profile
        // Clear all user profile caches to prevent conflicts when switching users
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('userProfile_')) {
            localStorage.removeItem(key);
          }
        });
        
        const localProfile = localStorage.getItem("guestProfile");
        setProfile(localProfile ? JSON.parse(localProfile) : defaultUserProfile);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Check if user has changed - if so, invalidate cache
        const userChanged = currentUserId && currentUserId !== user.uid;
        if (userChanged) {
          console.log("[UserProfileContext] User changed, clearing old cache");
          // Clear old user's cache
          if (currentUserId) {
            localStorage.removeItem(`userProfile_${currentUserId}`);
            localStorage.removeItem(`userProfile_${currentUserId}_timestamp`);
          }
        }
        setCurrentUserId(user.uid);
        
        // Check cache first
        const cacheKey = `userProfile_${user.uid}`;
        const cacheTimeKey = `userProfile_${user.uid}_timestamp`;
        const cachedProfile = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);
        
        // Use cache if less than 5 minutes old AND user hasn't changed
        const isCacheFresh = cacheTime && (Date.now() - parseInt(cacheTime)) < 5 * 60 * 1000;
        
        if (cachedProfile && isCacheFresh && !userChanged) {
          console.log("[UserProfileContext] Using fresh cached profile, skipping Firestore fetch");
          setProfile(JSON.parse(cachedProfile));
          setLoading(false);
        } else if (cachedProfile && !userChanged) {
          // Cache exists but stale - use it immediately and refresh in background
          console.log("[UserProfileContext] Using stale cache, refreshing in background");
          setProfile(JSON.parse(cachedProfile));
          setLoading(false);
          
          // Fetch fresh data in background
          getUserProfile(user.uid).then((userProfile) => {
            setProfile(userProfile);
            localStorage.setItem(cacheKey, JSON.stringify(userProfile));
            localStorage.setItem(cacheTimeKey, Date.now().toString());
            console.log("[UserProfileContext] Profile refreshed in background");
          }).catch((error) => {
            console.error("[UserProfileContext] Background refresh failed:", error);
          });
        } else {
          // No cache - fetch from Firestore
          console.log("[UserProfileContext] No cache, fetching from Firestore");
          const userProfile = await getUserProfile(user.uid);
          setProfile(userProfile);
          localStorage.setItem(cacheKey, JSON.stringify(userProfile));
          localStorage.setItem(cacheTimeKey, Date.now().toString());
          setLoading(false);
          console.log("[UserProfileContext] Profile loaded and cached");
        }
      } catch (error) {
        console.error("[UserProfileContext] Error loading profile:", error);
        setProfile(defaultUserProfile);
        setLoading(false);
      }
    }

    loadProfile();
  }, [user, authLoading]);

  // Save guest profile to localStorage
  useEffect(() => {
    if (!user && profile) {
      localStorage.setItem("guestProfile", JSON.stringify(profile));
    }
  }, [profile, user]);

  // Update map preferences
  const saveMapPreferences = useCallback(
    async (preferences) => {
      const newPreferences = {
        ...profile.mapPreferences,
        ...preferences,
      };

      setProfile((prev) => ({
        ...prev,
        mapPreferences: newPreferences,
      }));

      if (user) {
        try {
          await updateMapPreferences(user.uid, newPreferences);
        } catch (error) {
          console.warn("[UserProfileContext] Error updating map preferences:", error.message);
          // Continue silently - local state already updated
        }
      }
    },
    [user, profile]
  );

  // Toggle favorite
  const toggleFavorite = useCallback(
    async (type, itemId) => {
      if (!profile) return;

      const isCurrentlyFavorited = isFavorite(profile, type, itemId);

      // Update local state immediately for responsiveness
      setProfile((prev) => {
        const currentFavorites = prev.favorites?.[type] || [];
        const newFavorites = isCurrentlyFavorited
          ? currentFavorites.filter((id) => id !== itemId)
          : [...currentFavorites, itemId];

        return {
          ...prev,
          favorites: {
            ...prev.favorites,
            [type]: newFavorites,
          },
        };
      });

      // Sync with Firestore if logged in
      if (user) {
        try {
          if (isCurrentlyFavorited) {
            await removeFavorite(user.uid, type, itemId);
          } else {
            await addFavorite(user.uid, type, itemId);
          }
        } catch (error) {
          console.warn("[UserProfileContext] Error syncing favorite to Firestore:", error.message);
          // Revert on error
          setProfile((prev) => {
            const currentFavorites = prev.favorites?.[type] || [];
            const revertedFavorites = isCurrentlyFavorited
              ? [...currentFavorites, itemId]
              : currentFavorites.filter((id) => id !== itemId);

            return {
              ...prev,
              favorites: {
                ...prev.favorites,
                [type]: revertedFavorites,
              },
            };
          });
        }
      }
    },
    [user, profile]
  );

  // Check if item is favorited
  const checkIsFavorite = useCallback(
    (type, itemId) => {
      return isFavorite(profile, type, itemId);
    },
    [profile]
  );

  // Toggle preferred station
  const togglePreferredStation = useCallback(
    async (stationId) => {
      if (!profile) return;

      const currentStations = profile.cachedData?.preferredStations || [];
      const isPreferred = currentStations.includes(stationId);

      // Update local state
      setProfile((prev) => {
        const newStations = isPreferred
          ? currentStations.filter((id) => id !== stationId)
          : [...currentStations, stationId];

        return {
          ...prev,
          cachedData: {
            ...prev.cachedData,
            preferredStations: newStations,
          },
        };
      });

      // Sync with Firestore if logged in
      if (user) {
        try {
          if (isPreferred) {
            await removePreferredStation(user.uid, stationId);
          } else {
            await addPreferredStation(user.uid, stationId);
          }
        } catch (error) {

        }
      }
    },
    [user, profile]
  );

  // Update cached data
  const updateCachedRiverData = useCallback(
    async (data) => {
      setProfile((prev) => ({
        ...prev,
        cachedData: {
          ...prev.cachedData,
          lastSeenRiverData: data,
          lastUpdated: new Date().toISOString(),
        },
      }));

      if (user) {
        try {
          await updateUserProfile(user.uid, {
            "cachedData.lastSeenRiverData": data,
            "cachedData.lastUpdated": new Date().toISOString(),
          });
        } catch (error) {

        }
      }
    },
    [user]
  );

  // Update cached forecast
  const updateCachedForecast = useCallback(
    async (forecast) => {
      setProfile((prev) => ({
        ...prev,
        cachedData: {
          ...prev.cachedData,
          lastSeenForecast: forecast,
          lastUpdatedForecast: new Date().toISOString(),
        },
      }));

      if (user) {
        try {
          await updateUserProfile(user.uid, {
            "cachedData.lastSeenForecast": forecast,
            "cachedData.lastUpdatedForecast": new Date().toISOString(),
          });
        } catch (error) {

        }
      }
    },
    [user]
  );

  // Update offline mode
  const updateOfflineSettings = useCallback(
    async (settings) => {
      setProfile((prev) => ({
        ...prev,
        offlineMode: {
          ...prev.offlineMode,
          ...settings,
        },
      }));

      if (user) {
        try {
          await updateUserProfile(user.uid, {
            offlineMode: {
              ...profile.offlineMode,
              ...settings,
            },
          });
        } catch (error) {

        }
      }
    },
    [user, profile]
  );

  const value = {
    profile,
    loading,
    saveMapPreferences,
    toggleFavorite,
    checkIsFavorite,
    togglePreferredStation,
    updateCachedRiverData,
    updateCachedForecast,
    updateOfflineSettings,
    isLoggedIn: !!user,
  };

  if (loading) {
    return <RiverLoadingAnimation userName={user?.displayName || user?.email?.split('@')[0]} />;
  }

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}
