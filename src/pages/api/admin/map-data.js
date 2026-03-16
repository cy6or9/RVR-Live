// /src/pages/api/admin/map-data.js
// Admin endpoint for map changes (river points, locks, stations)
// NOTE: Admin authentication not yet implemented

export default async function handler(req, res) {
  // Only GET and POST allowed
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin authentication not yet implemented
  return res.status(501).json({ error: "Admin authentication not implemented" });
}
