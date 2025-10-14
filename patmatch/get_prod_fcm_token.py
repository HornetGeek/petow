#!/usr/bin/env python3
import requests
import json

def get_fcm_token_from_prod():
    """Get FCM token from production API for mmoataz03@gmail.com"""
    
    BASE_URL = "https://api.petow.app"
    LOGIN_PATH = "/api/accounts/login/"
    PROFILE_PATH = "/api/accounts/profile/"
    
    email = "mmoataz03@gmail.com"
    password = "1579534886240"
    
    print("=== Getting FCM Token from Production API ===")
    print(f"API: {BASE_URL}")
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
        
        print(f"Login status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("key")
            session.headers.update({"Authorization": f"Token {token}"})
            print("✅ Login successful")
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"Response: {response.text[:200]}...")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None
    
    print()
    
    # Step 2: Get user profile with FCM token
    print("=== Step 2: Get User Profile and FCM Token ===")
    try:
        response = session.get(f"{BASE_URL}{PROFILE_PATH}", timeout=15)
        
        print(f"Profile status: {response.status_code}")
        
        if response.status_code == 200:
            profile_data = response.json()
            
            print("✅ Profile fetched successfully")
            print()
            print("=== Profile Data ===")
            for key, value in profile_data.items():
                if key == 'fcm_token':
                    if value:
                        print(f"  {key}: {value[:50]}... (truncated)")
                    else:
                        print(f"  {key}: {value}")
                else:
                    print(f"  {key}: {value}")
            
            fcm_token = profile_data.get("fcm_token")
            
            print()
            if fcm_token:
                print("=== FCM Token Found ===")
                print(f"✅ FCM Token: {fcm_token}")
                print(f"✅ Token Length: {len(fcm_token)} characters")
                print(f"✅ Token Preview: {fcm_token[:50]}...")
                return fcm_token
            else:
                print("❌ No FCM token found in profile")
                print("The user needs to register their device for push notifications")
                print()
                print("To register FCM token:")
                print("1. Install the PetMatch mobile app")
                print("2. Login with mmoataz03@gmail.com")
                print("3. Allow push notifications when prompted")
                print("4. The app will automatically register the FCM token")
                return None
        else:
            print(f"❌ Profile fetch failed: {response.status_code}")
            print(f"Response: {response.text[:200]}...")
            return None
    except Exception as e:
        print(f"❌ Profile fetch error: {e}")
        return None

if __name__ == "__main__":
    fcm_token = get_fcm_token_from_prod()
    
    print()
    print("=== Summary ===")
    if fcm_token:
        print(f"✅ FCM Token successfully retrieved from production")
        print(f"✅ Token: {fcm_token}")
    else:
        print("❌ Failed to retrieve FCM token from production")
