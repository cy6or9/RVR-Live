# Environment Setup for User Profiles

## Firebase Configuration

To enable user profiles and authentication, you need to set up Firebase environment variables.

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a new project" or select existing
3. Name it (e.g., "RiverValleyReport")
4. Enable Google Analytics (optional)
5. Click "Create project"

### Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** → **Get started**
2. Click **Google** provider
3. Enable it and set your OAuth consent screen
4. Copy your **Web SDK configuration**

### Step 3: Enable Firestore

1. Go to **Firestore Database** → **Create database**
2. Start in **Test mode** (or Production with custom rules)
3. Select your region (closest to your users)
4. Click **Create**

**Important**: Later, update security rules in Firestore Console:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /userProfiles/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Step 4: Get Your Firebase Config

In Firebase Console:
1. Click **Project Settings** (gear icon)
2. Go to **General** tab
3. Scroll down to "Your apps"
4. Click **Web** if you haven't created an app
5. Copy the Firebase config object

### Step 5: Set Environment Variables

Create `.env.local` in the root of your project:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Replace with actual values from Firebase Console.

### Step 6: Test Authentication

1. Run `npm run dev`
2. Navigate to `/profile`
3. Click "Sign In with Google"
4. Verify you can sign in
5. Check Firestore Console to see profile created in `userProfiles` collection

---

## Firestore Security Rules Setup

### Development (Test Mode - Open Access)
Good for testing, **NOT for production**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Production (Recommended)
Replace `YOUR_EMAIL@example.com` with your admin email:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // User Profiles - only own profile
    match /userProfiles/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Articles - public read, admin write
    match /articles/{articleId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null && 
        request.auth.token.email in [
          'YOUR_EMAIL@example.com',
          'triggaj51@gmail.com'
        ];
    }
    
    // Default deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Steps to Deploy Rules:

1. Go to Firestore Database → **Rules** tab
2. Replace content with rules above
3. Click **Publish**
4. Test in Firestore Console

---

## Google OAuth Setup

### Configure OAuth Consent Screen

1. In Firebase Console, go to **Authentication** → **Settings** → **Authorized domains**
2. Add your domains:
   - `localhost` (for local dev)
   - `localhost:3000` (local Next.js)
   - `yoursite.com` (production)
   - `yoursite.netlify.app` (Netlify)

3. Go to **Google Cloud Console** → **OAuth consent screen**
4. Set app name: "River Valley Report"
5. Add scopes needed:
   - `email`
   - `profile`
6. Add test users (your email)

### Authorized Redirect URIs

These are usually auto-configured, but if needed:
1. In Google Cloud Console → **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Add to "Authorized redirect URIs":
   - `http://localhost:3000`
   - `https://yoursite.com`
   - `https://yoursite.netlify.app`

---

## Netlify Deployment

### Add Environment Variables to Netlify

1. Go to Netlify → Your Site → **Settings** → **Environment variables**
2. Add each Firebase config variable:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   etc.
   ```

### Enable Function Logging

Optional, for debugging:
1. Netlify Site Settings → **Functions**
2. Enable logging if needed

### Test Production

After deployment, test:
1. Visit your live site
2. Click "Login"
3. Verify profile saves to Firestore
4. Check Firestore Database tab in Firebase Console

---

## Troubleshooting

### "Firebase is not configured"
- Check `.env.local` has correct Firebase keys
- Verify `NEXT_PUBLIC_` prefix on all variables
- Restart `npm run dev`

### "Firestore permission denied"
- Check Firestore Security Rules
- Ensure `userProfiles/{userId}` rule allows read/write
- User UID must match document ID

### "Google Sign-In not working"
- Check authorized domains in Google Cloud Console
- Verify OAuth Client ID is correct
- Clear browser cookies and try again

### "Profile not saving"
- Check browser DevTools → Network → failed requests
- Look at Firestore Console for write errors
- Verify user is authenticated (check `request.auth.uid`)

### Environment Variables Not Loading
- Restart dev server after adding `.env.local`
- Prefix all public vars with `NEXT_PUBLIC_`
- Check for typos in variable names

---

## Database Structure

### userProfiles Collection

Document ID: Firebase User UID

```
/userProfiles/{uid}
├── mapPreferences
│   ├── defaultLocation: { lat, lon }
│   ├── zoom: number
│   ├── layers: { waterLevels, weatherRadar, locksDams, ... }
│   └── darkMode: boolean
├── cachedData
│   ├── lastSeenRiverData: object
│   ├── lastSeenForecast: object
│   ├── preferredStations: string[]
│   └── lastUpdated: timestamp
├── favorites
│   ├── locksDams: string[]
│   ├── towns: string[]
│   └── marinas: string[]
├── offlineMode
│   ├── enabled: boolean
│   ├── downloadedTiles: string[]
│   └── lastSyncedRiverData: object
├── createdAt: timestamp
├── updatedAt: timestamp
├── email: string
└── displayName: string
```

---

## Performance Tips

### Indexes
For faster queries, Firestore may suggest auto-creating indexes:
- Accept these suggestions
- Check Firestore → **Indexes** tab

### Data Size
- Limit cached data to ~100KB per user
- Archive old weather forecasts
- Compress tile data

### Query Optimization
- Use `checkIsFavorite()` helper (doesn't require DB query)
- Cache profile in memory during session
- Batch updates with `updateUserProfile()`

---

## Monitoring

### Firebase Console
- **Firestore** → **Usage** tab to see read/write operations
- **Authentication** → **Users** to see registered accounts
- **Firestore** → **Indexes** to optimize queries

### Debugging
Enable verbose logging in development:
```javascript
// In src/lib/firebase.js or src/lib/userProfile.js
if (process.env.NODE_ENV === 'development') {
  enableLogging(true);
}
```

---

## Next Steps

1. ✅ Set up Firebase project
2. ✅ Get Firebase config keys
3. ✅ Add environment variables
4. ✅ Configure OAuth consent
5. ✅ Deploy security rules
6. ✅ Test authentication
7. ✅ Integrate into your pages (see INTEGRATION_EXAMPLES.md)
8. ✅ Deploy to Netlify

---

## Support

If issues arise:
1. Check Firebase Console logs
2. Review DevTools → Network tab
3. Enable Firebase verbose logging
4. Check Firestore Rules tab for errors

Good luck! 🚀
