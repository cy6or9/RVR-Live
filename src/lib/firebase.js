// /src/lib/firebase.js
// Firebase v9 modular SDK with Google Auth enabled
// Client-side Firebase initialization

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const AUTH_DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1" || process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
const authDebugLog = (...args) => {
  if (AUTH_DEBUG) {
    console.log(...args);
  }
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "dummy",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dummy",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abc123def456",
};

// Check if Firebase is properly configured
const firebaseEnabled =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (typeof window !== 'undefined') {
  authDebugLog("[Firebase] Configuration check:", {
    enabled: firebaseEnabled,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    currentURL: window.location.href
  });
}

// Initialize Firebase app (always, using dummy values if needed for build)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize services
export const auth = getAuth(app);
export const firestore = getFirestore(app);

// Set persistence BEFORE any auth operations (synchronously during initialization)
if (firebaseEnabled && typeof window !== 'undefined') {
  // Set persistence immediately and wait for it
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error("[Firebase] Failed to set persistence:", err);
  });
}

// Google Auth provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account",
});

// Export app and provider
export { app, provider, firebaseEnabled, getRedirectResult, signInWithPopup };

// --- AUTH HELPERS ---

export async function loginWithGoogle() {
  if (!firebaseEnabled) {
    throw new Error("Firebase Auth is not configured. Please set environment variables.");
  }
  
  authDebugLog("[Firebase] Starting Google sign-in...");
  authDebugLog("[Firebase] Auth domain:", firebaseConfig.authDomain);
  authDebugLog("[Firebase] Current location:", window.location.href);
  
  try {
    // Try popup first (more reliable), fallback to redirect if blocked
    try {
      authDebugLog("[Firebase] Attempting popup sign-in...");
      const result = await signInWithPopup(auth, provider);
      authDebugLog("[Firebase] Popup sign-in successful:", result.user.email);
      
      // Import and call setLastLogin for popup logins
      try {
        const { setLastLogin, createUserProfile } = await import('./userProfile');
        
        // Create/update profile with auth data
        await createUserProfile(result.user.uid, {
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
        });
        
        // Record login timestamp
        await setLastLogin(
          result.user.uid,
          result.user.email,
          result.user.displayName || '',
          result.user.photoURL
        );
        authDebugLog("[Firebase] Login tracking completed");
      } catch (trackError) {
        console.error("[Firebase] Error tracking login:", trackError);
      }
      
      return result;
    } catch (popupError) {
      authDebugLog("[Firebase] Popup blocked or failed, falling back to redirect:", popupError);
      // If popup fails (blocked), use redirect as fallback
      await signInWithRedirect(auth, provider);
      authDebugLog("[Firebase] Redirect initiated");
    }
  } catch (error) {
    console.error("[Firebase] Sign-in error:", error);
    throw error;
  }
}

export async function logoutUser() {
  return signOut(auth);
}

// Protect admin routes on the client
export function requireAuth(user, router) {
  if (!user) {
    router.push("/login");
  }
}
