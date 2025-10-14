#!/usr/bin/env python3
import requests
import json

def test_notification_to_production_user():
    """Send test notification via production API to any logged-in user"""
    
    BASE_URL = "https://api.petow.app"
    LOGIN_PATH = "/api/accounts/login/"
    PUSH_NOTIFICATION_PATH = "/api/accounts/send-push-notification/"
    
    # You can change these credentials to any production user
    email = "mmoataz03@gmail.com"  # This user has FCM token in production
    password = "1579534886240"
    
    print("=== Testing Push Notification via Production API ===")
    print(f"API: {BASE_URL}")
    print(f"User: {email}")
    print()
    
    session = requests.Session()
    
    # Step 1: Login
    print("=== Step 1: Login to Production ===")
    try:
        response = session.post(
            f"{BASE_URL}{LOGIN_PATH}",
            json={"email": email, "password": password},
            timeout=15,
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("key")
            session.headers.update({"Authorization": f"Token {token}"})
            print("✅ Login successful")
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    # Step 2: Send push notification via production API
    print("\n=== Step 2: Send Push Notification ===")
    
    notification_data = {
        "title": "🎉 اختبار الإشعارات",
        "body": "مرحباً! هذا اختبار للإشعارات من الخادم. إذا وصلك هذا الإشعار، فهذا يعني أن كل شيء يعمل بشكل مثالي! 🚀",
        "data": {
            "type": "manual_test",
            "source": "production_api_test",
            "timestamp": str(int(__import__('time').time())),
            "test_id": "manual_test_001"
        }
    }
    
    print(f"Sending notification:")
    print(f"  Title: {notification_data['title']}")
    print(f"  Body: {notification_data['body'][:100]}...")
    print()
    
    try:
        response = session.post(
            f"{BASE_URL}{PUSH_NOTIFICATION_PATH}",
            json=notification_data,
            timeout=15,
        )
        
        print(f"API Response:")
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("\n🎉 SUCCESS: Notification sent via production API!")
                print("📱 Check the mobile device for the notification")
                return True
            else:
                print(f"\n❌ API returned success=false: {result}")
                return False
        else:
            print(f"\n❌ API call failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ API error: {e}")
        return False

if __name__ == "__main__":
    print("🔔 This script will send a test notification to a production user")
    print("⚠️  Make sure the user has:")
    print("   1. Logged into the mobile app")
    print("   2. Granted notification permissions (manually in device settings)")
    print("   3. Has an active FCM token registered")
    print()
    
    success = test_notification_to_production_user()
    print("\n" + "="*60)
    if success:
        print("✅ Test notification sent successfully!")
        print("📱 Check the mobile device for the notification")
        print("🔔 If you don't see it, manually enable notifications in device settings")
    else:
        print("❌ Test failed - check error messages above")
    print("="*60) 