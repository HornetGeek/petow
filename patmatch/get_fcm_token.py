#!/usr/bin/env python3
import requests

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


if __name__ == "__main__":
    email = "mmoataz03@gmail.com"
    password = "1579534886240"

    session = requests.Session()

    print("=== Logging in via API ===")
    login_payload = login_and_get_token(session, email, password)

    if not login_payload:
        print("Login failed; cannot continue")
        raise SystemExit(1)

    print("=== Fetching profile ===")
    profile = fetch_user_profile(session)

    if profile:
        print(f"Profile data: {profile}")

    fcm_token = extract_fcm_token(profile)

    if fcm_token:
        print(f"FCM Token: {fcm_token}")
    else:
        print("FCM Token not available in profile data")
