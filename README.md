# River Valley Report — Next.js Merge

This is a merged Next.js project that combines the **RVRBETA** frontend and the **rvr-backend**
USGS / OpenWeather logic into a single app.

## Scripts

- `npm install`
- `npm run dev` — local dev on http://localhost:3000
- `npm run build && npm start` — production

## Clean local rebuild

For a guaranteed clean rebuild from source:

Windows (PowerShell):

```powershell
# From project root
Remove-Item -Recurse -Force .next, node_modules
npm install
npm run build
npm run dev
```

Linux/macOS:

```bash
# From project root
rm -rf .next node_modules
npm install
npm run build
npm run dev
```

## Environment

For **local development**, create a `.env.local` file in the project root:

```bash
OPENWEATHER_KEY=your_openweather_key_here
AIRNOW_API_KEY=your_airnow_key_here   # optional, for /api/aqi

# Firebase config (public client-side config)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain_here
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket_here
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id_here
NEXT_PUBLIC_FIREBASE_CLIENT_ID=your_firebase_client_id_here
