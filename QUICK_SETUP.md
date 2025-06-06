# Quick Setup: Firebase Google Authentication

## 🚀 Quick Steps to Enable Google Auth

### 1. Firebase Console (Required)
1. Go to https://console.firebase.google.com/
2. Select project: `legacyquestionnaire-minerva`
3. **Authentication** → **Sign-in method**
4. Click **Google** → **Enable**
5. Save changes

### 2. Test the Implementation
- Visit http://localhost:3001
- Click "Continue with Google"
- Try with Minerva email (should work)  
- Try with non-Minerva email (should be rejected)

### 3. Production Deployment
When deploying to production, add your domain to:
- Firebase **Authentication** → **Settings** → **Authorized domains**

## ✅ What's Already Implemented

- ✅ Google Sign-In button with proper styling
- ✅ Domain restriction to @minerva.edu and @uni.minerva.edu  
- ✅ Error handling for unauthorized domains
- ✅ Automatic sign-out for non-Minerva emails
- ✅ Integration with existing Firebase auth system

## 🎨 UI Features Added

- Google Sign-In button with official Google colors and icon
- "or" divider between email/password and Google auth
- Error messages for unauthorized domains
- Responsive design that works on mobile and desktop

## 🔒 Security Features

- **Domain validation**: Only Minerva emails allowed
- **Client-side verification**: Double-checks email domain
- **Automatic sign-out**: Non-Minerva users are immediately signed out
- **Error feedback**: Clear messages for unauthorized access attempts
