#!/usr/bin/env python3
import os
import sys
import django

# Add the patmatch directory to Python path
sys.path.append('/media/hornet/84ACF2FAACF2E5981/petWebsite/patmatch')

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from accounts.firebase_service import firebase_service
import time

def test_direct_fcm_token():
    """Test sending push notification directly to specific FCM token"""
    
    # The FCM token provided by the user
    fcm_token = "cEjc2J0VTwigw4S9ETUXmb:APA91bGmvSxnBmbD2J19QfhSf_qTaaPDVSm1EVummVfH2GSmQpy_vcWDYocexrqxUaI3KNtKKvPw_9CtXOAzgIGgWcBa24WvkMrnYIYSnIKScVWHnioG5O0"
    
    print("=== Direct FCM Token Push Notification Test ===")
    print(f"Target FCM Token: {fcm_token[:50]}...")
    print(f"Token Length: {len(fcm_token)} characters")
    print()
    
    # Step 1: Check Firebase service
    print("=== Step 1: Check Firebase Service ===")
    if firebase_service.is_initialized:
        print("✅ Firebase service is initialized and ready")
    else:
        print("❌ Firebase service is not initialized")
        print("Check Firebase credentials in settings")
        return False
    
    # Step 2: Send push notification
    print("\n=== Step 2: Send Push Notification ===")
    
    notification_data = {
        "title": "🐾 PetMatch Direct Test",
        "body": "Hello! This is a direct push notification test sent to your specific FCM token. If you see this, the notification system is working perfectly! 🎉✨",
        "data": {
            "type": "direct_test",
            "source": "backend_direct_fcm_test",
            "timestamp": str(int(time.time())),
            "test_id": "direct_fcm_001",
            "message": "Direct FCM token test successful"
        }
    }
    
    print(f"Sending notification:")
    print(f"  Title: {notification_data['title']}")
    print(f"  Body: {notification_data['body'][:100]}...")
    print(f"  FCM Token: {fcm_token[:50]}...")
    print(f"  Data: {notification_data['data']}")
    print()
    
    try:
        success = firebase_service.send_notification(
            fcm_token=fcm_token,
            title=notification_data['title'],
            body=notification_data['body'],
            data=notification_data['data']
        )
        
        if success:
            print("🎉 SUCCESS: Push notification sent successfully!")
            print("📱 Check your mobile device for the notification")
            print("🔔 The notification should appear within a few seconds")
            return True
        else:
            print("❌ Firebase service returned False - notification failed")
            print("Possible reasons:")
            print("  - FCM token is invalid or expired")
            print("  - App is not installed or token is from different Firebase project")
            print("  - Network connectivity issues")
            return False
            
    except Exception as e:
        print(f"❌ Push notification error: {str(e)}")
        print("Error details:")
        if "Auth error" in str(e):
            print("  - Authentication error with Firebase")
            print("  - FCM token might be from different Firebase project")
            print("  - Token might be expired or invalid")
        elif "not found" in str(e).lower():
            print("  - FCM token not found or app uninstalled")
        else:
            print(f"  - {str(e)}")
        return False

if __name__ == "__main__":
    success = test_direct_fcm_token()
    print("\n" + "="*60)
    if success:
        print("✅ Direct FCM Token Test: PASSED")
        print("📱 Push notification sent successfully to the device")
        print("🔔 Check your mobile device for the notification")
    else:
        print("❌ Direct FCM Token Test: FAILED")
        print("🔧 Check Firebase configuration and token validity")
        print("📋 Possible solutions:")
        print("   1. Verify the FCM token is current and valid")
        print("   2. Check Firebase project configuration matches")
        print("   3. Ensure mobile app is installed and configured")
    print("="*60) 