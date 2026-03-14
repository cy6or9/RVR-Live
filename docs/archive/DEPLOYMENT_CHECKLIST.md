# RiverValleyReport User Profile System - Deployment Checklist

## ✅ Pre-Deployment (Do This First)

### Firebase Setup
- [ ] Create Firebase project at https://console.firebase.google.com
- [ ] Enable Authentication (Google provider)
- [ ] Enable Firestore Database
- [ ] Copy Firebase config keys
- [ ] Create `.env.local` file with Firebase keys
- [ ] Deploy Firestore security rules from `firestore.rules`
- [ ] Configure OAuth consent screen
- [ ] Add authorized domains to Firebase

### Local Testing
- [ ] Run `npm install` (should already have firebase)
- [ ] Start dev server: `npm run dev`
- [ ] Visit `http://localhost:3000/profile`
- [ ] Test "Sign In with Google" button
- [ ] Verify profile page loads after login
- [ ] Check Firestore Console for new `userProfiles` collection
- [ ] Test sign out and sign back in
- [ ] Verify preferences persist

## 🔧 Implementation Tasks

### Priority 1 (Core)
- [ ] Test complete flow: sign in → profile page → change settings → persist
- [ ] Verify Firestore rules are deployed
- [ ] Verify AuthContext profile migration is working
- [ ] Check Header shows Profile link when logged in

### Priority 2 (Integration)
- [ ] Add FavoriteButton to locks in profile page
- [ ] Add FavoriteButton to river-conditions page stations
- [ ] Create "Favorites Only" filter on stations
- [ ] Add quick-access favorites sidebar

### Priority 3 (Map Features)
- [ ] Integrate map preferences into map component
- [ ] Save map position on drag/zoom
- [ ] Load map from saved preferences
- [ ] Add dark mode toggle to map

### Priority 4 (Offline Mode)
- [ ] Create service worker for tile caching
- [ ] Implement IndexedDB for offline storage
- [ ] Add "Download Current View" button
- [ ] Add "Clear Cache" functionality

## 📋 Deployment Checklist

### Before Going Live
- [ ] All local tests passing
- [ ] Firebase production rules deployed
- [ ] Admin email list updated in `firestore.rules`
- [ ] Environment variables added to Netlify
- [ ] OAuth scopes correct (email, profile)
- [ ] Authorized redirect URIs include production domain

### Netlify Deployment
- [ ] Add Firebase env vars to Netlify settings
- [ ] Run `npm run build` locally and verify no errors
- [ ] Deploy to Netlify
- [ ] Test sign-in on live site
- [ ] Verify profile saves to Firestore
- [ ] Check Firestore Console for new documents

### Post-Launch
- [ ] Monitor Firestore usage in Firebase Console
- [ ] Check for any auth errors in browser console
- [ ] Verify users can toggle favorites
- [ ] Confirm map preferences persist
- [ ] Test on different devices/browsers

## 🧪 Testing Scenarios

### Scenario 1: Complete First-Time User Flow
- [ ] User visits site (not logged in)
- [ ] User can view river-conditions without login
- [ ] User can change map position (saved to localStorage)
- [ ] User clicks "Login"
- [ ] User signs in with Google
- [ ] User redirected to `/profile` page
- [ ] Profile page loads with settings options
- [ ] User changes a preference
- [ ] Setting saves with "Saved!" confirmation
- [ ] User signs out
- [ ] User signs back in
- [ ] Previous settings persist

### Scenario 2: Favorites Workflow
- [ ] Logged-in user visits profile page
- [ ] User sees locks list under "Favorites" tab
- [ ] User clicks star to favorite a lock
- [ ] Star appears filled immediately
- [ ] Refresh page
- [ ] Star remains filled
- [ ] User visits river-conditions page
- [ ] Favorite button shows next to station
- [ ] User unfavorites from river-conditions page
- [ ] Favorite updates in profile page (if viewed)

### Scenario 3: Guest → User Migration
- [ ] New visitor (not logged in)
- [ ] User changes map settings
- [ ] Settings saved to localStorage
- [ ] User signs in
- [ ] Settings migrated to Firestore automatically
- [ ] localStorage cleared
- [ ] User preferences accessible in profile

### Scenario 4: Cross-Device Sync
- [ ] User signs in on Device A (phone)
- [ ] User changes preferences
- [ ] User signs in on Device B (desktop)
- [ ] Same preferences appear on Device B
- [ ] User changes preference on Device B
- [ ] User refreshes Device A
- [ ] Updated preference appears on Device A

### Scenario 5: Offline Mode
- [ ] User enables offline mode in profile
- [ ] User downloads current map view
- [ ] User goes offline (disable internet)
- [ ] User can still view map tiles
- [ ] User can still see cached river data
- [ ] User goes back online
- [ ] Data syncs automatically

## 📊 Monitoring

### Daily
- [ ] Check Firebase usage in console
- [ ] Monitor Firestore reads/writes
- [ ] Check for authentication errors

### Weekly
- [ ] Review user profile data size
- [ ] Check for failed API calls
- [ ] Monitor database growth rate

### Monthly
- [ ] Review user engagement metrics
- [ ] Analyze favorite trends
- [ ] Plan feature improvements

## 🚨 Troubleshooting Guide

### Problem: "Firebase not configured"
**Solution:**
1. Check `.env.local` has Firebase keys
2. Verify `NEXT_PUBLIC_` prefix on all vars
3. Restart dev server
4. Check browser console for errors

### Problem: Sign-in button not working
**Solution:**
1. Check Firebase Authentication is enabled
2. Verify OAuth consent screen configured
3. Check authorized domains in Firebase
4. Check browser cookies are allowed
5. Try incognito mode

### Problem: Profile doesn't save
**Solution:**
1. Check Firestore is enabled in Firebase
2. Verify security rules are deployed
3. Check network tab for failed requests
4. Verify user is authenticated
5. Check browser console for errors

### Problem: Guest settings not persisting
**Solution:**
1. Check localStorage is enabled
2. Check browser private/incognito mode
3. Verify localStorage has sufficient space
4. Clear browser cache and try again

### Problem: Favorites appear/disappear randomly
**Solution:**
1. Check network latency to Firestore
2. Verify user UID matches document ID
3. Check for duplicate update calls
4. Use debouncing for rapid updates

## 📞 Emergency Contacts

If issues occur:
1. **Firebase Status**: https://status.firebase.google.com
2. **Firebase Support**: https://firebase.google.com/support
3. **Next.js Docs**: https://nextjs.org/docs
4. **Your Code Comments**: Check source files

## 🎯 Success Criteria

✅ System is ready when:
- [ ] All tests pass
- [ ] No console errors on production
- [ ] Users can sign in and out
- [ ] Preferences save to Firestore
- [ ] Favorites toggle works
- [ ] Guest mode works
- [ ] Cross-device sync works
- [ ] Firestore usage is minimal
- [ ] Response times are fast (<1s)
- [ ] No security warnings

## 📝 Documentation to Share

After deployment, share with team:
- [ ] `IMPLEMENTATION_SUMMARY.md` - Project overview
- [ ] `INTEGRATION_EXAMPLES.md` - Code examples for new features
- [ ] `FIREBASE_SETUP.md` - Setup instructions
- [ ] Source code comments - For developers

## 🎁 Future Enhancements

Ready to build after launch:
- [ ] Push notifications for favorites
- [ ] Social sharing of favorite spots
- [ ] Premium offline maps
- [ ] Advanced analytics dashboard
- [ ] Trip planning features
- [ ] Photo uploads for conditions
- [ ] Comments/ratings system

## ✨ Launch Readiness Sign-Off

- [ ] All checklist items complete
- [ ] All tests passing
- [ ] All documentation reviewed
- [ ] Team trained on new features
- [ ] Monitoring set up
- [ ] Backup plan documented
- [ ] Ready for production

**Date Deployed**: ___________
**Deployed By**: ___________
**Notes**: _________________________________________________

---

## 🚀 You're Ready to Launch!

Everything is in place. Follow this checklist, test thoroughly, and your user profile system will be a huge hit with your users.

Good luck! 🎉
