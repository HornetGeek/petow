#!/usr/bin/env python3
import requests
import json

BASE_URL = "https://api.petow.app"
LOGIN_PATH = "/api/accounts/login/"
FCM_REGISTER_PATH = "/api/accounts/update-notification-token/"
PROFILE_PATH = "/api/accounts/profile/"

def test_fcm_registration():
    """Test FCM token registration flow"""
    email = "mmoataz03@gmail.com"
    password = "1579534886240"
    
    # Simulate a real FCM token (this is a dummy token for testing)
    test_fcm_token = "cONGkdLhQYmYwJtPgG-kkb:APA91bF8bRxD4HgKxJ1mV5cTrQp3UjF2wGd8vLiOqNsX7yZ9kLmN2pQrS5tUvWxY3zA4bC6dE8fG9hI1jK2lM3nO5pQ7rS8tU9vW1xY2zA3bC4dE5fG6hI7jK8lM9nO0pQ"
    
    session = requests.Session()
    
    print("=== Testing FCM Token Registration Flow ===")
    print(f"Email: {email}")
    print(f"Test FCM Token: {test_fcm_token[:50]}...")
    print()
    
    # Step 1: Login
    print("=== Step 1: Login ===")
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
            return
    except Exception as e:
        print(f"❌ Login error: {e}")
        return
    
    # Step 2: Register FCM Token
    print("\n=== Step 2: Register FCM Token ===")
    try:
        fcm_response = session.post(
            f"{BASE_URL}{FCM_REGISTER_PATH}",
            json={"fcm_token": test_fcm_token, "platform": "android"},
            timeout=15,
        )
        
        print(f"FCM Registration Status: {fcm_response.status_code}")
        print(f"FCM Registration Response: {fcm_response.text}")
        
        if fcm_response.status_code == 200:
            print("✅ FCM token registered successfully")
        else:
            print("❌ FCM token registration failed")
    except Exception as e:
        print(f"❌ FCM registration error: {e}")
        return
    
    # Step 3: Verify token was saved
    print("\n=== Step 3: Verify FCM Token Saved ===")
    try:
        profile_response = session.get(f"{BASE_URL}{PROFILE_PATH}", timeout=15)
        
        if profile_response.status_code == 200:
            profile_data = profile_response.json()
            saved_token = profile_data.get("fcm_token")
            
            if saved_token:
                print(f"✅ FCM token found in profile: {saved_token[:50]}...")
                if saved_token == test_fcm_token:
                    print("✅ FCM token matches what we sent")
                else:
                    print("⚠️ FCM token doesn't match what we sent")
            else:
                print("❌ No FCM token found in profile")
        else:
            print(f"❌ Profile fetch failed: {profile_response.status_code}")
    except Exception as e:
        print(f"❌ Profile fetch error: {e}")
    
    print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_fcm_registration()
