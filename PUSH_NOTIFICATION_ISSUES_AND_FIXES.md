# Push Notification Issues and Fixes

## Issues Identified

### 1. **CRITICAL: Production API Missing Push Notification Endpoint**
- **Issue**: The production API at `https://api.petow.app` doesn't have the `/api/accounts/send-push-notification/` endpoint
- **Cause**: URLs.py file had a syntax error and the endpoint was not properly deployed to production
- **Status**: ✅ **FIXED** - Fixed syntax error in `patmatch/accounts/urls.py`
- **Action Required**: Deploy updated backend to production

### 2. **CRITICAL: FCM Token Not Registered After Mobile Login**
- **Issue**: When users log in via mobile app, their FCM token is not registered with the backend
- **Cause**: 
  - `initNotifications()` called before user authentication
  - FCM token registration fails because user is not logged in yet
  - No re-registration after successful login
- **Status**: ✅ **FIXED** - Updated `PetMatchMobile/src/contexts/AuthContext.tsx`
- **Action Required**: Deploy mobile app update

### 3. **Firebase Auth Error from APNS/Web Push Service**
- **Issue**: Getting "Auth error from APNS or Web Push Service" when sending notifications
- **Possible Causes**:
  - FCM token is expired/invalid
  - Firebase project configuration mismatch
  - Mobile app Firebase configuration issue
- **Status**: ⚠️ **NEEDS INVESTIGATION** - May resolve after fixing token registration

## Fixes Applied

### Backend Fixes

#### 1. Fixed URLs.py Syntax Error
**File**: `patmatch/accounts/urls.py`
```python
# BEFORE (broken)
path('reset-password-confirm/', views.reset_password_confirm, name='reset_password_confirm'),
]     path('send-push-notification/', views.send_push_notification, name='send_push_notification'),

# AFTER (fixed)
path('reset-password-confirm/', views.reset_password_confirm, name='reset_password_confirm'),
path('send-push-notification/', views.send_push_notification, name='send_push_notification'),
]
```

### Mobile App Fixes

#### 1. Added FCM Token Registration After Login
**File**: `PetMatchMobile/src/contexts/AuthContext.tsx`

**Changes Made**:
1. Import FCM token registration function
2. Register FCM token after successful login
3. Register FCM token after successful registration  
4. Register FCM token for existing authenticated users on app startup

```typescript
import { getAndRegisterFcmToken } from '../services/notifications';

// In login method
if (userData && userData.email) {
  setUser(userData);
  
  // Register FCM token after successful login
  try {
    console.log('📱 Registering FCM token after login...');
    await getAndRegisterFcmToken();
    console.log('✅ FCM token registered successfully');
  } catch (error) {
    console.log('⚠️ FCM token registration failed (non-fatal):', error);
  }
  
  return true;
}
```

## Current System Architecture

### FCM Token Flow (After Fixes)
1. **App Startup**: Request notification permissions and get FCM token
2. **User Login/Register**: Re-register FCM token with backend (authenticated)
3. **Token Refresh**: Automatically update backend when token changes
4. **Push Notification**: Backend can send notifications using current token

### API Endpoints
- **Register FCM Token**: `POST /api/accounts/update-notification-token/`
- **Send Push Notification**: `POST /api/accounts/send-push-notification/`

## Testing

### Test Scripts Created
1. **`test_actual_push_notification.py`** - Tests sending push notifications via production API
2. **`test_fcm_after_login.py`** - Tests FCM token registration after mobile login

### Manual Testing Steps
1. Deploy backend changes to production
2. Deploy mobile app with updated AuthContext
3. Test login flow and verify FCM token registration
4. Test push notification sending

## Next Steps

### 1. Deploy Backend (URGENT)
```bash
# Run the restart script to deploy URL fixes
./scripts/restart-backend.sh
```

### 2. Deploy Mobile App
- Build and deploy mobile app with FCM token registration fixes
- Test on both Android and iOS

### 3. Test End-to-End
- Use test scripts to verify functionality
- Test with real mobile devices

### 4. Monitor and Debug
- Check Firebase console for delivery statistics
- Monitor backend logs for FCM errors
- Verify token validity and project configuration

## Firebase Configuration Verification

### Backend Firebase Settings
- ✅ Firebase service initialized correctly
- ✅ Firebase credentials configured
- ❌ **NEEDS CHECK**: Verify FCM tokens are for correct Firebase project

### Mobile App Firebase Settings
- ✅ Firebase messaging implemented
- ✅ Token registration logic exists
- ❌ **NEEDS CHECK**: Verify Firebase project ID matches backend

## Expected Results After Fixes

1. **FCM Token Registration**: ✅ Tokens properly registered after login
2. **Push Notifications**: ✅ Notifications successfully sent to mobile devices
3. **Token Refresh**: ✅ Tokens automatically updated when they change
4. **Error Handling**: ✅ Graceful handling of registration failures

## Monitoring and Maintenance

### Key Metrics to Monitor
- FCM token registration success rate
- Push notification delivery rate
- Token refresh frequency
- Authentication errors

### Log Messages to Watch For
- `📱 Registering FCM token after login...`
- `✅ FCM token registered successfully`
- `❌ Failed to send notification: Auth error from APNS or Web Push Service`
- `⚠️ FCM token registration failed (non-fatal)` 
### New Admin Endpoint
- Added `/api/accounts/admin/send-push-to-token/` for sending a push directly to a raw FCM token using the admin API key.
