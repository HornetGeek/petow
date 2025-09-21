#!/usr/bin/env python3
import requests
import json
import time

def test_production_push_notification():
    """Test sending push notification via production backend API"""
    
    BASE_URL = "https://api.petow.app"
    LOGIN_PATH = "/api/accounts/login/"
    PROFILE_PATH = "/api/accounts/profile/"
    PUSH_NOTIFICATION_PATH = "/api/accounts/send-push-notification/"
    
    email = "mmoataz03@gmail.com"
    password = "1579534886240"
    
    print("=== PetMatch Production Push Notification Test ===")
    print(f"Testing with production API: {BASE_URL}")
    print(f"User: {email}")
    print()
    
    session = requests.Session()
    
    # Step 1: Login
    print("=== Step 1: Login to Production API ===")
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
    
    # Step 2: Get user profile and FCM token
    print("\n=== Step 2: Get User Profile ===")
    try:
        response = session.get(f"{BASE_URL}{PROFILE_PATH}", timeout=15)
        
        if response.status_code == 200:
            profile_data = response.json()
            fcm_token = profile_data.get("fcm_token")
            
            if fcm_token:
                print(f"✅ FCM token found: {fcm_token[:50]}...")
            else:
                print("❌ No FCM token found in profile")
                print("The user needs to register their device first")
                return False
        else:
            print(f"❌ Profile fetch failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Profile fetch error: {e}")
        return False
    
    # Step 3: Send push notification via production API
    print("\n=== Step 3: Send Push Notification via Production API ===")
    
    # Test notification data
    notification_data = {
        "title": "🐾 PetMatch Production Test",
        "body": f"Hello! This is a test push notification sent from the production backend at {time.strftime('%Y-%m-%d %H:%M:%S')}. If you see this, everything is working perfectly! 🎉",
        "data": {
            "type": "test",
            "source": "production_backend",
            "timestamp": str(int(time.time())),
            "action": "open_app"
        }
    }
    
    print(f"Notification details:")
    print(f"  Title: {notification_data['title']}")
    print(f"  Body: {notification_data['body']}")
    print(f"  Data: {notification_data['data']}")
    print()
    
    try:
        response = session.post(
            f"{BASE_URL}{PUSH_NOTIFICATION_PATH}",
            json=notification_data,
            timeout=30,
        )
        
        print(f"Push notification response status: {response.status_code}")
        print(f"Push notification response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("✅ Push notification sent successfully!")
                print("Check your device for the notification.")
            else:
                print("❌ Push notification failed")
                print(f"Error: {result.get('error', 'Unknown error')}")
        else:
            print("❌ Push notification request failed")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Push notification error: {e}")
        return False
    
    print("\n=== Test Complete ===")
    return True

if __name__ == "__main__":
    test_production_push_notification()
