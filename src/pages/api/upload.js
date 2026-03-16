import { storage } from "@/lib/firebaseAdmin";
import { v4 as uuid } from "uuid";

export const config = {
  api: { bodyParser: false },
};

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// Map content-type to file extension
const CONTENT_TYPE_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const ALLOWED_CONTENT_TYPES = Object.keys(CONTENT_TYPE_TO_EXT);

/**
 * Read raw request body into a Buffer with size limit.
 * Rejects if total size exceeds maxBytes.
 */
function readRequestBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        req.destroy();
        reject(new Error("PAYLOAD_TOO_LARGE"));
      } else {
        chunks.push(chunk);
      }
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if Storage is configured
    if (!storage) {
      return res.status(503).json({ error: "Storage not configured" });
    }

    // Validate Content-Type header
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return res.status(415).json({ error: "Unsupported media type" });
    }

    // Read request body with size limit
    let fileBuffer;
    try {
      fileBuffer = await readRequestBuffer(req, MAX_UPLOAD_SIZE);
    } catch (error) {
      if (error.message === "PAYLOAD_TOO_LARGE") {
        return res.status(413).json({ error: "File too large" });
      }
      return res.status(500).json({ error: "Upload stream error" });
    }

    // Check if file is empty
    if (!fileBuffer.length) {
      return res.status(400).json({ error: "Empty file" });
    }

    // Get file extension from content-type
    const extension = CONTENT_TYPE_TO_EXT[contentType];
    const fileName = `article-images/${uuid()}${extension}`;

    // Upload to Firebase Storage
    const file = storage.file(fileName);

    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    // Generate signed URL (read-only, expires far in future)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-09-2491",
    });

    return res.status(200).json({
      imageUrl: signedUrl,
      url: signedUrl,
    });
  } catch (error) {
    console.error("[Upload API] Error:", error.message);
    return res.status(500).json({ error: "Upload failed" });
  }
}
