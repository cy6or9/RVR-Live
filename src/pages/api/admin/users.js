// /pages/api/admin/users.js
// Admin API endpoint to fetch all user profiles
// Returns user list with privileges and stats

import admin, { adminDb } from "@/lib/firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if adminDb is available
    if (!adminDb) {
      return res.status(503).json({ error: "Database not configured" });
    }

    // Fetch userProfiles collection
    let snapshot;
    try {
      snapshot = await adminDb.collection("userProfiles").get();
    } catch (error) {
      console.error("[API /admin/users] Firestore query failed:", error.message);

      // If collection/database not found, return empty array
      if (error.code === 5 || error.message?.includes("NOT_FOUND")) {
        return res.status(200).json([]);
      }

      throw error;
    }

    // Fetch user data from Firebase Auth and merge with Firestore data
    const users = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const uid = doc.id;

        // Fetch user from Firebase Auth to get email, displayName, photoURL
        let authUser = null;
        try {
          authUser = await admin.auth().getUser(uid);
        } catch (authError) {
          console.error(
            `[API /admin/users] Auth lookup failed for uid ${uid}:`,
            authError.message
          );
        }

        // Convert Firestore Timestamps to ISO strings
        const convertTimestamp = (timestamp) => {
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
        };

        return {
          uid,
          email: authUser?.email || data.email || "",
          displayName: authUser?.displayName || data.displayName || "",
          photoURL: authUser?.photoURL || data.photoURL || null,
          privileges: {
            tier: data.privileges?.tier || "Basic",
          },
          stats: {
            lastLoginAt: convertTimestamp(data.stats?.lastLoginAt),
            lastLoginAtRaw: data.stats?.lastLoginAt?._seconds
              ? data.stats.lastLoginAt._seconds * 1000
              : null,
            totalOnlineSeconds: data.stats?.totalOnlineSeconds || 0,
          },
          lastLocation: data.lastLocation
            ? {
                lat: data.lastLocation.lat,
                lon: data.lastLocation.lon,
                city: data.lastLocation.city || null,
                state: data.lastLocation.state || null,
                county: data.lastLocation.county || null,
                updatedAt: convertTimestamp(data.lastLocation.updatedAt),
              }
            : null,
        };
      })
    );

    res.status(200).json(users);
  } catch (error) {
    console.error("[API /admin/users] Internal error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
}
