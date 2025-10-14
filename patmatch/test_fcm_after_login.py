#!/usr/bin/env python3
import requests
import json
import time

def test_fcm_registration_after_login():
    """Test if FCM token gets registered after mobile app login"""
    
    BASE_URL = "https://api.petow.app"
    LOGIN_PATH = "/api/accounts/login/"
    PROFILE_PATH = "/api/accounts/profile/"
    
    email = "mmoataz03@gmail.com"
    password = "1579534886240"
    
    print("=== Testing FCM Token Registration After Login ===")
    print(f"API: {BASE_URL}")
    print(f"User: {email}")
    print()
    
    session = requests.Session()
    
    # Step 1: Get initial FCM token (before login simulation)
    print("=== Step 1: Check Initial FCM Token ===")
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
            print(f"❌ Login failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    # Get current profile
    try:
        response = session.get(f"{BASE_URL}{PROFILE_PATH}", timeout=15)
        if response.status_code == 200:
            profile = response.json()
            initial_fcm = profile.get("fcm_token", "")
            print(f"Current FCM token: {initial_fcm[:50] if initial_fcm else 'None'}...")
            print(f"Token length: {len(initial_fcm) if initial_fcm else 0} characters")
        else:
            print("❌ Failed to get profile")
            return False
    except Exception as e:
        print(f"❌ Profile error: {e}")
        return False
    
    print("\n" + "="*60)
    print("📱 INSTRUCTIONS FOR MOBILE APP TESTING:")
    print("="*60)
    print("1. Open PetMatch mobile app")
    print("2. If logged in, logout first")
    print("3. Login with:")
    print(f"   Email: {email}")
    print(f"   Password: {password}")
    print("4. Wait for login to complete")
    print("5. Press ENTER here to check if FCM token was registered...")
    print("="*60)
    
    input("Press ENTER after you've logged in on mobile app...")
    
    # Step 2: Check FCM token after mobile login
    print("\n=== Step 2: Check FCM Token After Mobile Login ===")
    try:
        response = session.get(f"{BASE_URL}{PROFILE_PATH}", timeout=15)
        if response.status_code == 200:
            profile = response.json()
            new_fcm = profile.get("fcm_token", "")
            
            print(f"New FCM token: {new_fcm[:50] if new_fcm else 'None'}...")
            print(f"Token length: {len(new_fcm) if new_fcm else 0} characters")
            
            if new_fcm and new_fcm != initial_fcm:
                print("🎉 SUCCESS: FCM token was updated after mobile login!")
                print("The mobile app is now properly registering FCM tokens")
                return True
            elif new_fcm and new_fcm == initial_fcm:
                print("⚠️  FCM token exists but didn't change")
                print("This might be OK if the token was already current")
                return True
            else:
                print("❌ FAILED: No FCM token found after mobile login")
                print("The mobile app is not registering FCM tokens properly")
                return False
        else:
            print("❌ Failed to get updated profile")
            return False
    except Exception as e:
        print(f"❌ Profile check error: {e}")
        return False

if __name__ == "__main__":
    success = test_fcm_registration_after_login()
    print("\n" + "="*50)
    if success:
        print("✅ FCM Token Registration Test: PASSED")
        print("📱 Mobile app is properly registering FCM tokens")
    else:
        print("❌ FCM Token Registration Test: FAILED")
        print("🔧 Check mobile app AuthContext implementation") 