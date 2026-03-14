# Firebase Admin SDK Configuration Update

## Summary
Updated Firebase Admin SDK and client configuration to support multiple environment variable naming conventions and fix production deployment issues on Netlify.

## Files Modified

### 1. `/src/lib/firebaseAdmin.js`
**Changes:**
- ✅ Added fallback environment variable mapping for backward compatibility
- ✅ Now supports: `FIREBASE_ADMIN_*`, `FIREBASE_*`, and `NEXT_PUBLIC_FIREBASE_*` naming conventions
- ✅ Added proper validation and error logging for missing credentials
- ✅ Exported `adminDb` as the primary Firestore export (with `firestore` as alias for backward compatibility)
- ✅ Added null check for storage bucket to prevent crashes when not configured

**Environment Variable Priority:**
```javascript
projectId: FIREBASE_ADMIN_PROJECT_ID || NEXT_PUBLIC_FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID
clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL || FIREBASE_CLIENT_EMAIL
privateKey: FIREBASE_ADMIN_PRIVATE_KEY || FIREBASE_PRIVATE_KEY
storageBucket: FIREBASE_ADMIN_STORAGE_BUCKET || NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || FIREBASE_STORAGE_BUCKET
```

### 2. `/src/lib/firebase.js`
**Changes:**
- ✅ Improved warning message for missing Firebase configuration
- ✅ Non-blocking warning that only shows in browser (not server-side)
- ✅ Added error handling for Firebase initialization failures
- ✅ Improved `logoutUser` helper with console warning when Firebase not initialized

### 3. `/src/context/AuthContext.js`
**Changes:**
- ✅ Added warning log when Firebase is not configured
- ✅ Imported `signOut` and `useRouter` for improved logout functionality
- ✅ Updated `logout` function to:
  - Use `signOut(auth)` directly instead of `firebaseLogout()` helper
  - Clear user state explicitly with `setUser(null)`
  - Redirect to `/login` page after logout
  - Include proper error handling
- ✅ Added router to useMemo dependencies array

### 4. `/src/pages/api/admin/users.js`
**Changes:**
- ✅ Changed import from `firestore` to `adminDb` for consistency
- ✅ Updated all references to use `adminDb` instead of `firestore`
- ✅ Already had proper try/catch error handling ✓

### 5. `/src/pages/admin/index.js`
**Changes:**
- ✅ Added React Query configuration to prevent infinite loops:
  - `retry: false` - Don't retry failed requests automatically
  - `refetchOnWindowFocus: false` - Don't refetch when window gains focus
  - `staleTime: 5 * 60 * 1000` - Consider data fresh for 5 minutes
- ✅ Prevents excessive API calls that could trigger rate limits or errors

## Environment Variables Required

### Client-Side (Required for Authentication)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Server-Side (Required for Admin SDK)
**Option 1: New naming convention (recommended)**
```bash
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account-email
FIREBASE_ADMIN_PRIVATE_KEY=your-private-key
FIREBASE_ADMIN_STORAGE_BUCKET=your-storage-bucket
```

**Option 2: Legacy naming (still supported)**
```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_STORAGE_BUCKET=your-storage-bucket
```

**Note:** The code will automatically try all naming conventions in priority order, so you only need to set one.

## Testing Checklist

### Local Development
- [ ] Test with no Firebase env vars (should show warnings but not crash)
- [ ] Test with client env vars only (auth should work)
- [ ] Test with admin env vars (API routes should work)

### Production (Netlify)
- [ ] Verify all `NEXT_PUBLIC_FIREBASE_*` variables are set
- [ ] Verify admin variables are set (choose naming convention)
- [ ] Test login/logout flow
- [ ] Test admin dashboard (`/admin`)
- [ ] Verify no infinite loops in React Query
- [ ] Check browser console for Firebase errors

## Benefits

1. **Backward Compatible:** Existing environment variable names still work
2. **Flexible Deployment:** Supports multiple hosting environments without code changes
3. **Better Error Handling:** Clear logging when credentials are missing
4. **Non-Blocking:** Missing Firebase in development doesn't crash the app
5. **Performance:** React Query optimizations prevent unnecessary API calls
6. **User Experience:** Logout now properly redirects to login page

## Build Verification

✅ Build completed successfully with no errors:
```
Route (pages)                              Size     First Load JS
┌ ƒ /                                      241 B           206 kB
├ ○ /404                                   1.08 kB         214 kB
├ ○ /admin                                 8.49 kB         221 kB
├ ○ /login                                 2.87 kB         216 kB
├ ○ /profile                               16.8 kB         234 kB
├ ○ /river-conditions                      19.6 kB         237 kB
└ ○ /weather                               4.3 kB          221 kB
```

## Next Steps

1. Deploy to Netlify with updated environment variables
2. Test authentication flow in production
3. Verify admin dashboard loads without errors
4. Monitor Firebase usage and console logs
5. Update documentation for team members

## Rollback Plan

If issues arise, the changes are backward compatible. Simply ensure:
- All original `FIREBASE_*` environment variables remain set
- No breaking changes to existing API routes
- All exports (`firestore` alias) maintain backward compatibility
