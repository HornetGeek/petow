# Installation Guide - Adoption & Verification Features 🚀

## Quick Start

### 1. Install Dependencies
```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite/PetMatchMobile

# Install react-native-video
npm install react-native-video@^6.0.0

# or with yarn
yarn add react-native-video@^6.0.0
```

### 2. iOS Setup (if applicable)
```bash
cd ios
pod install
cd ..
```

### 3. Rebuild the App
```bash
# Android
npm run android

# iOS
npm run ios
```

## Features Included ✅

### 1. Account Verification with Video
- Upload ID photo
- Record selfie video (10-15 seconds)
- Admin review in Django admin
- Required for adoption requests

### 2. Adoption Requests System
- Submit adoption requests (verified users only)
- View sent requests
- View received requests
- Approve/reject requests
- Full form with validation

### 3. Integration Points
- Profile screen quick actions
- Pet details screen adoption button
- Automatic verification check

## New Screens

### VerificationScreen
- Path: Profile → التحقق من الحساب
- Purpose: Submit ID verification

### AdoptionRequestScreen
- Path: Pet Details → طلب تبني
- Purpose: Submit adoption request form

### AdoptionRequestsScreen
- Path: Profile → طلبات التبني
- Purpose: Manage sent/received adoption requests

## Backend Status

✅ All backend changes applied:
- AccountVerification model created
- Migrations applied
- API endpoints active
- Django admin configured

## Troubleshooting

### Issue: "react-native-video not found"
```bash
npm install react-native-video@^6.0.0
cd ios && pod install && cd ..
```

### Issue: "Cannot read property 'is_verified'"
- Ensure user is logged in
- Check AuthContext is providing user data

### Issue: Video upload fails
- Check file size < 20MB
- Check duration < 15 seconds  
- Check internet connection

### Issue: Adoption button not showing
- Verify pet status is 'available_for_adoption'
- Check pet data loaded correctly

## Testing Checklist

- [ ] App builds successfully
- [ ] No TypeScript errors
- [ ] VideoPicker shows camera options
- [ ] Can record/select video
- [ ] Video preview shows correctly
- [ ] Verification submission works
- [ ] Adoption form validation works
- [ ] Adoption request submission works
- [ ] Requests list loads correctly
- [ ] Approve/reject actions work
- [ ] All Arabic text displays properly

## Support

If you encounter issues:
1. Check console logs for errors
2. Verify backend is running
3. Check network connectivity
4. Review error messages in Arabic
5. Contact support via WhatsApp in app

## Next Steps

After installation:
1. Test account verification flow
2. Test adoption request submission
3. Test request management
4. Review admin panel functionality
5. Deploy to production when ready

Happy coding! 🎉


