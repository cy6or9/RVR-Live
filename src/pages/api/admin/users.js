// /pages/api/admin/users.js
// Admin API endpoint to fetch all Firebase Authentication users
// Primary data source: Firebase Admin Auth
// Merged with: Firestore userProfiles (if they exist)
// Returns all auth users + profiles, even if profile is missing

import admin, { adminDb } from "@/lib/firebaseAdmin";

// Hardcoded admin email list (must match client-side AuthContext.js)
const ADMIN_EMAILS = ["triggaj51@gmail.com"];

/**
 * Convert Firestore Timestamp to ISO string
 */
function convertTimestamp(timestamp) {
  if (!timestamp) return null;
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  if (timestamp._seconds) {
    return new Date(timestamp._seconds * 1000).toISOString();
  }
  return null;
}

/**
 * Normalize a user object from Firebase Auth + optional Firestore profile
 */
function normalizeUser(authUser, profileData) {
  const profileMissing = !profileData;

  return {
    uid: authUser.uid,
    email: authUser.email || "",
    displayName: authUser.displayName || profileData?.displayName || "",
    photoURL: authUser.photoURL || profileData?.photoURL || null,
    privileges: {
      tier: profileData?.privileges?.tier || "Basic",
    },
    stats: {
      lastLoginAt: profileData
        ? convertTimestamp(profileData.stats?.lastLoginAt)
        : null,
      lastLoginAtRaw: profileData?.stats?.lastLoginAt?._seconds
        ? profileData.stats.lastLoginAt._seconds * 1000
        : null,
      totalOnlineSeconds: profileData?.stats?.totalOnlineSeconds || 0,
    },
    lastLocation: profileData?.lastLocation
      ? {
          lat: profileData.lastLocation.lat,
          lon: profileData.lastLocation.lon,
          city: profileData.lastLocation.city || null,
          state: profileData.lastLocation.state || null,
          county: profileData.lastLocation.county || null,
          updatedAt: convertTimestamp(profileData.lastLocation.updatedAt),
        }
      : null,
    profileMissing,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ========================================================================
    // SERVER-SIDE ADMIN AUTHORIZATION CHECK
    // ========================================================================
    // Get the Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify the ID token with Firebase Admin Auth
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error("[API /admin/users] Token verification failed:", error.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Check if the verified user's email is in the admin list
    const userEmail = decodedToken.email;
    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      console.warn(
        `[API /admin/users] Unauthorized access attempt by non-admin: ${userEmail}`
      );
      return res.status(403).json({ error: "Forbidden: admin access required" });
    }

    // ========================================================================
    // FETCH ALL FIREBASE AUTH USERS
    // ========================================================================
    if (!adminDb) {
      return res.status(503).json({ error: "Database not configured" });
    }

    // Get pagination token from query
    const pageToken = req.query.pageToken || undefined;

    let listResult;
    try {
      listResult = await admin.auth().listUsers(100, pageToken);
    } catch (error) {
      console.error("[API /admin/users] Auth listUsers failed:", error.message);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    // ========================================================================
    // FOR EACH AUTH USER, MERGE WITH FIRESTORE PROFILE
    // ========================================================================
    const users = await Promise.all(
      listResult.users.map(async (authUser) => {
        // Try to fetch the user's Firestore profile
        let profileData = null;
        try {
          const profileDoc = await adminDb
            .collection("userProfiles")
            .doc(authUser.uid)
            .get();

          if (profileDoc.exists) {
            profileData = profileDoc.data();
          }
        } catch (error) {
          console.error(
            `[API /admin/users] Firestore profile lookup failed for uid ${authUser.uid}:`,
            error.message
          );
          // Continue even if profile lookup fails; user will be returned with profileMissing=true
        }

        return normalizeUser(authUser, profileData);
      })
    );

    // ========================================================================
    // RETURN RESPONSE
    // ========================================================================
    res.status(200).json({
      users,
      pageToken: listResult.pageToken || null,
    });
  } catch (error) {
    console.error("[API /admin/users] Internal error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
}
