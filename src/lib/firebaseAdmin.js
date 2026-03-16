// /src/lib/firebaseAdmin.js
// Firebase Admin SDK for server-side operations (safe lazy-init pattern)
// Used in API routes for Firestore access

import * as admin from "firebase-admin";

// ============================================================================
// Configuration: Multi-source env var fallback (Netlify, local, etc.)
// ============================================================================

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const clientEmail =
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
  process.env.FIREBASE_CLIENT_EMAIL;

const privateKey = (
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.FIREBASE_PRIVATE_KEY ||
  ""
)
  .replace(/\\n/g, "\n") // Replace escaped newlines
  .replace(/^"|"$/g, "") // Remove surrounding quotes
  .trim();

const storageBucket =
  process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

// ============================================================================
// Safe credential validation helper (no secret logging)
// ============================================================================

function validateCredentials() {
  const config = {
    hasProjectId: !!projectId,
    hasClientEmail: !!clientEmail,
    hasPrivateKey: !!privateKey,
    hasStorageBucket: !!storageBucket,
  };

  const isValid = config.hasProjectId && config.hasClientEmail && config.hasPrivateKey;
  return { isValid, config };
}

// ============================================================================
// Lazy single-init pattern with safe error handling
// ============================================================================

let isInitialized = false;
let initializationAttempted = false;

function initializeAdmin() {
  if (initializationAttempted) {
    return isInitialized;
  }

  initializationAttempted = true;
  const { isValid, config } = validateCredentials();

  // If credentials missing, log warning and bail safely
  if (!isValid) {
    console.warn(
      "[Firebase Admin] Missing required admin credentials; server features disabled"
    );
    return false;
  }

  // Attempt initialization
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        ...(storageBucket && { storageBucket }),
      });

      isInitialized = true;
      console.info("[Firebase Admin] Initialized successfully");
    } else {
      isInitialized = true;
    }
  } catch (error) {
    console.error("[Firebase Admin] Initialization error:", error.message);
    isInitialized = false;
  }

  return isInitialized;
}

// ============================================================================
// Safe lazy getters
// ============================================================================

let cachedDb = undefined; // undefined = not yet attempted

export function getAdminDb() {
  if (cachedDb !== undefined) {
    return cachedDb;
  }

  if (!initializeAdmin()) {
    cachedDb = null;
    return null;
  }

  try {
    cachedDb = admin.firestore();
    // Set once after getting the instance
    cachedDb.settings({
      ignoreUndefinedProperties: true,
    });
  } catch (error) {
    console.error("[Firebase Admin] Firestore error:", error.message);
    cachedDb = null;
  }

  return cachedDb;
}

let cachedStorage = undefined; // undefined = not yet attempted

export function getStorage() {
  if (cachedStorage !== undefined) {
    return cachedStorage;
  }

  if (!initializeAdmin() || !storageBucket) {
    cachedStorage = null;
    return null;
  }

  try {
    cachedStorage = admin.storage().bucket(storageBucket);
  } catch (error) {
    console.error("[Firebase Admin] Storage error:", error.message);
    cachedStorage = null;
  }

  return cachedStorage;
}

// ============================================================================
// Initialize once at module load
// ============================================================================

initializeAdmin();

// ============================================================================
// Exports for backward compatibility
// ============================================================================

export const adminDb = getAdminDb();
export const storage = getStorage();

export function isFirebaseAdminReady() {
  return isInitialized;
}

export default admin;
