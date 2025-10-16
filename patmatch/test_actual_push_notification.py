#!/usr/bin/env python3
import requests
import json

def test_actual_push_notification():
    """Test sending actual push notification via production backend API"""
    
    BASE_URL = "https://api.petow.app"
    LOGIN_PATH = "/api/accounts/login/"
    PUSH_NOTIFICATION_PATH = "/api/accounts/send-push-notification/"
    
    email = "mmoataz03@gmail.com"
    password = "1579534886240"
    
    print("=== PetMatch Actual Push Notification Test ===")
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
            print(f"Token: {token[:20]}...")
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    # Step 2: Send actual push notification
    print("\n=== Step 2: Send Actual Push Notification ===")
    
    # Test notification data
    notification_data = {
        "title": "🐾 PetMatch Live Test",
        "body": "Hello! This is a REAL push notification sent from the production backend. If you see this on your mobile device, everything is working perfectly! 🎉",
        "data": {
            "type": "test",
            "source": "production_backend_live_test",
            "timestamp": str(int(__import__('time').time())),
            "test_id": "live_test_001"
        }
    }
    
    print(f"Sending notification:")
    print(f"  Title: {notification_data['title']}")
    print(f"  Body: {notification_data['body'][:100]}...")
    print(f"  Data: {notification_data['data']}")
    print()
    
    try:
        response = session.post(
            f"{BASE_URL}{PUSH_NOTIFICATION_PATH}",
            json=notification_data,
            timeout=15,
        )
        
        print(f"Push notification API response:")
        print(f"  Status Code: {response.status_code}")
        print(f"  Response: {response.text}")
        print()
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("🎉 SUCCESS: Push notification sent successfully!")
                print("📱 Check your mobile device for the notification")
                return True
            else:
                print(f"❌ Backend returned success=false: {result}")
                return False
        else:
            print(f"❌ Push notification failed: {response.status_code}")
            print(f"Error details: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Push notification error: {e}")
        return False

if __name__ == "__main__":
    success = test_actual_push_notification()
    print("\n" + "="*50)
    if success:
        print("✅ Test completed successfully - notification sent!")
        print("📱 Check your mobile device for the push notification")
    else:
        print("❌ Test failed - notification not sent")
        print("Check the error messages above for details") 