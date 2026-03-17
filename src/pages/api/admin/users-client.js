// /pages/api/admin/users-client.js
// Fallback hint endpoint suggesting client SDK for direct Firestore access
// NOTE: This is a redirect hint, not an actual implementation

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // This endpoint suggests using the client SDK to query Firestore directly
  // It is not an actual user fetch implementation
  res.status(200).json({
    message: "Use client SDK to query Firestore directly",
    useClientSDK: true,
  });
}
