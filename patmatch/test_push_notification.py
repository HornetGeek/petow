#!/usr/bin/env python3
import requests
import os
import sys
import django
from pathlib import Path

# Add the project directory to Python path
project_dir = Path(__file__).resolve().parent
sys.path.append(str(project_dir))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from accounts.firebase_service import firebase_service

BASE_URL = "https://api.petow.app"
LOGIN_PATH = "/api/accounts/login/"
PROFILE_PATH = "/api/accounts/profile/"

def login_and_get_token(session, email, password):
    """Authenticate through the public API and attach the auth token to the session."""
    try:
        response = session.post(
            f"{BASE_URL}{LOGIN_PATH}",
            json={"email": email, "password": password},
            timeout=15,
        )
    except requests.RequestException as exc:
        print(f"Login request error: {exc}")
        return None

    print(f"Login status: {response.status_code}")

    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return None

    data = response.json()
    token = data.get("key")

    if not token:
        print("Login succeeded but token missing in response")
        return None

    session.headers.update({"Authorization": f"Token {token}"})
    return data

def fetch_user_profile(session):
    """Fetch the authenticated user's profile information."""
    try:
        response = session.get(f"{BASE_URL}{PROFILE_PATH}", timeout=15)
    except requests.RequestException as exc:
        print(f"Profile request error: {exc}")
        return None

    print(f"Profile status: {response.status_code}")

    if response.status_code != 200:
        print(f"Profile fetch failed: {response.text}")
        return None

    return response.json()

def extract_fcm_token(profile_data):
    """Pull the FCM token from the profile payload if present."""
    if not profile_data:
        return None

    token = profile_data.get("fcm_token")

    if not token:
        print("No FCM token found in profile response")

    return token

def send_test_notification(fcm_token, title="Test Notification", body="This is a test push notification from PetMatch!"):
    """Send a test push notification using Firebase."""
    if not fcm_token:
        print("❌ No FCM token provided - cannot send notification")
        return False
    
    print(f"�� Sending test notification to FCM token: {fcm_token[:20]}...")
    
    # Test data for the notification
    data = {
        'type': 'test',
        'timestamp': str(int(__import__('time').time())),
        'source': 'backend_test'
    }
    
    success = firebase_service.send_notification(
        fcm_token=fcm_token,
        title=title,
        body=body,
        data=data
    )
    
    if success:
        print("✅ Test notification sent successfully!")
        return True
    else:
        print("❌ Failed to send test notification")
        return False

def main():
    email = "mmoataz03@gmail.com"
    password = "1579534886240"

    session = requests.Session()

    print("=== PetMatch Push Notification Test ===")
    print(f"Testing with email: {email}")
    print()

    # Step 1: Login and get profile
    print("=== Step 1: Logging in via API ===")
    login_payload = login_and_get_token(session, email, password)

    if not login_payload:
        print("❌ Login failed; cannot continue")
        return False

    print("✅ Login successful")
    print()

    # Step 2: Fetch user profile
    print("=== Step 2: Fetching user profile ===")
    profile = fetch_user_profile(session)

    if not profile:
        print("❌ Failed to fetch profile")
        return False

    print("✅ Profile fetched successfully")
    print(f"User: {profile.get('full_name', 'Unknown')} ({profile.get('email', 'No email')})")
    print()

    # Step 3: Check for FCM token
    print("=== Step 3: Checking for FCM token ===")
    fcm_token = extract_fcm_token(profile)

    if not fcm_token:
        print("⚠️  No FCM token found in user profile")
        print("This means the user hasn't registered their device for push notifications yet.")
        print()
        print("To test push notifications, you need to:")
        print("1. Install the PetMatch mobile app")
        print("2. Login with the same email")
        print("3. Allow push notifications when prompted")
        print("4. Run this script again")
        print()
        
        # Ask if user wants to test with a dummy token
        test_with_dummy = input("Do you want to test with a dummy FCM token? (y/n): ").lower().strip()
        if test_with_dummy == 'y':
            # Use a dummy token for testing (this will fail but show the process)
            fcm_token = "dummy_fcm_token_for_testing_123456789"
            print(f"Using dummy token: {fcm_token}")
        else:
            print("Exiting without sending notification")
            return False
    else:
        print(f"✅ FCM token found: {fcm_token[:20]}...")

    print()

    # Step 4: Test Firebase service initialization
    print("=== Step 4: Testing Firebase service ===")
    if firebase_service.is_initialized:
        print("✅ Firebase service is initialized")
    else:
        print("❌ Firebase service is not initialized")
        print("Check Firebase credentials in settings")
        return False

    print()

    # Step 5: Send test notification
    print("=== Step 5: Sending test notification ===")
    success = send_test_notification(
        fcm_token=fcm_token,
        title="🐾 PetMatch Test Notification",
        body="Hello! This is a test push notification from PetMatch backend. If you see this, push notifications are working! 🎉"
    )

    print()
    if success:
        print("🎉 Test completed successfully!")
        print("If you have the mobile app installed and logged in, you should receive the notification.")
    else:
        print("❌ Test failed. Check the logs above for details.")

    return success

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
