// /src/context/AuthContext.js
// Central authentication state + admin role check

import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, getRedirectResult } from "firebase/auth";
import { 
  setLastLogin,
  setLastLogout,
  saveSessionDuration,
  createUserProfile
} from "@/lib/userProfile";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const AUTH_DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1" || process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
const authDebugLog = (...args) => {
  if (AUTH_DEBUG) {
    console.log(...args);
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirectHandled, setRedirectHandled] = useState(false);
  const router = useRouter();
  const sessionStartRef = useRef(null);
  const loginRecordedRef = useRef(false);
  const previousUserRef = useRef(null);
  const profileCreationRef = useRef(new Set()); // Track in-flight profile creations

  // Handle redirect result from Google Sign-In - MUST happen before any navigation
  useEffect(() => {
    authDebugLog("[AuthContext] Checking for redirect result...");
    authDebugLog("[AuthContext] Current auth state:", auth.currentUser?.email || "no user");
    
    // Set a flag to prevent navigation until redirect is handled
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        authDebugLog("[AuthContext] getRedirectResult resolved:", result ? 'success' : 'null');
        
        if (result && result.user) {
          authDebugLog("[AuthContext] Redirect result found, user:", result.user.email);
          
          // Deduplicate profile creation - don't create if already in flight
          if (!profileCreationRef.current.has(result.user.uid)) {
            profileCreationRef.current.add(result.user.uid);
            
            // Create user profile if needed
            try {
              await createUserProfile(result.user.uid, {
                email: result.user.email,
                displayName: result.user.displayName,
                photoURL: result.user.photoURL,
              });
              authDebugLog("[AuthContext] Profile creation successful");
            } catch (error) {
              console.error("[AuthContext] Error creating user profile:", error.message);
            } finally {
              profileCreationRef.current.delete(result.user.uid);
            }
            
            // Record login with full user data
            try {
              await setLastLogin(
                result.user.uid, 
                result.user.email,
                result.user.displayName || '',
                result.user.photoURL
              );
            } catch (error) {
              console.error("[AuthContext] Error recording login:", error.message);
            }
          }
          
          // Set session start
          sessionStartRef.current = Date.now();
          loginRecordedRef.current = true;
          
          authDebugLog("[AuthContext] Login recorded, waiting for onAuthStateChanged...");
        } else {
          authDebugLog("[AuthContext] No redirect result, checking current user...");
          // Check if user is already logged in from persistence
          if (auth.currentUser) {
            authDebugLog("[AuthContext] User already logged in from persistence:", auth.currentUser.email);
          }
        }
      } catch (error) {
        console.error("[AuthContext] getRedirectResult error:", error.message);
        if (error.code !== 'auth/popup-closed-by-user') {
          // Don't show alert for fetch abort errors
          if (!error.message.includes('aborted')) {
            alert("Login failed: " + error.message);
          }
        }
      } finally {
        // Mark redirect as handled
        setRedirectHandled(true);
      }
    };
    
    handleRedirect();
  }, []);

  // Single auth state listener
  useEffect(() => {
    authDebugLog("[AuthContext] Setting up onAuthStateChanged listener");
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      authDebugLog("[AuthContext] Auth state changed:", firebaseUser ? firebaseUser.email : "null");
      const prevUser = previousUserRef.current;
      
      // Handle logout - save session if user is logging out
      // NOTE: Stats saving on logout is skipped because user is already signed out
      // and Firestore rules prevent writes. Session duration is saved before signOut.
      if (prevUser && !firebaseUser && sessionStartRef.current) {
        authDebugLog("[AuthContext] User logged out, clearing session refs");
        sessionStartRef.current = null;
        loginRecordedRef.current = false;
      }

      // Handle login - record session start ONCE
      if (firebaseUser && !loginRecordedRef.current) {
        authDebugLog("[AuthContext] Recording new login session");
        loginRecordedRef.current = true;
        sessionStartRef.current = Date.now();
        
        // Login tracking is handled by login.js - no need to duplicate here
        // This prevents redundant Firestore writes
      }

      // Update refs and state
      previousUserRef.current = firebaseUser;
      setUser(firebaseUser || null);
      setLoading(false);
      authDebugLog("[AuthContext] User state updated, loading:", false);
    });

    return () => {
      authDebugLog("[AuthContext] Cleaning up auth listener");
      unsub();
    };
  }, []);

  // Handle page close/hide: save session duration
  useEffect(() => {
    const saveSession = () => {
      if (sessionStartRef.current && user?.uid) {
        const elapsedSeconds = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        if (elapsedSeconds > 5) {
          try {
            // Use Promise.allSettled to prevent one failure from blocking others
            Promise.allSettled([
              saveSessionDuration(user.uid, elapsedSeconds).catch(() => {}),
              setLastLogout(user.uid).catch(() => {})
            ]).catch(() => {
              // Silently fail - don't block page unload
            });
          } catch (error) {
            // Silently fail - don't block page unload
          }
        }
      }
    };

    const handleBeforeUnload = () => saveSession();
    const handlePageHide = () => saveSession();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveSession();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  // Define admin emails
  const adminEmails = useMemo(() => ["triggaj51@gmail.com"], []);
  const isAdmin = useMemo(() => {
    return !!user && adminEmails.includes(user.email ?? "");
  }, [user, adminEmails]);

  // Logout function
  const logout = useCallback(async () => {
    authDebugLog("[AuthContext] Logout function called");
    
    // Determine where to redirect after logout
    const currentPath = router.pathname;
    const protectedRoutes = ['/profile', '/admin'];
    const isProtectedRoute = protectedRoutes.some(route => currentPath.startsWith(route));
    const redirectPath = isProtectedRoute ? '/' : currentPath;
    
    authDebugLog("[AuthContext] Current path:", currentPath);
    authDebugLog("[AuthContext] Redirect path after logout:", redirectPath);
    
    // Save session BEFORE logout - MUST complete while user is still authenticated
    if (sessionStartRef.current && user) {
      authDebugLog("[AuthContext] Saving session before logout");
      const elapsedSeconds = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      if (elapsedSeconds > 5) {
        try {
          // Use allSettled to not block logout even if save fails
          const results = await Promise.allSettled([
            saveSessionDuration(user.uid, elapsedSeconds),
            setLastLogout(user.uid)
          ]);
          
          // Log results but don't fail on errors
          const errors = results.filter(r => r.status === 'rejected');
          if (errors.length > 0) {
            console.warn("[AuthContext] Some session saves failed (continuing with logout):", errors);
          } else {
            authDebugLog("[AuthContext] Session saved successfully");
          }
        } catch (error) {
          console.error("[AuthContext] Error saving session on logout:", error.message);
          // Continue with logout even if save fails
        }
      }
      sessionStartRef.current = null;
      loginRecordedRef.current = false;
    }
    
    // Sign out and redirect
    try {
      authDebugLog("[AuthContext] Calling signOut...");
      await signOut(auth);
      authDebugLog("[AuthContext] signOut successful");
      
      // Clear user state after signout
      setUser(null);
      
      authDebugLog("[AuthContext] Redirecting to:", redirectPath);
      router.push(redirectPath);
    } catch (error) {
      console.error("[AuthContext] Logout failed:", error);
      alert("Logout failed: " + error.message);
    }
  }, [user, router]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    user,
    isAdmin,
    loading,
    loginWithGoogle: async () => {
      const { loginWithGoogle: login } = await import("@/lib/firebase");
      return login();
    },
    logout,
  }), [user, isAdmin, loading, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
