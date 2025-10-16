#!/usr/bin/env python3
import requests
import json

def get_fcm_token_from_api(email, password):
    """
    Get FCM token by logging into the Django admin API
    """
    base_url = "https://api.petow.app"
    
    # First, get the CSRF token
    session = requests.Session()
    
    try:
        # Get the admin login page to extract CSRF token
        login_page = session.get(f"{base_url}/admin/")
        print(f"Login page status: {login_page.status_code}")
        
        # Try to login to admin
        login_data = {
            'username': email,
            'password': password,
            'next': '/admin/'
        }
        
        login_response = session.post(f"{base_url}/admin/login/", data=login_data)
        print(f"Login response status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            print("Successfully logged in to admin panel")
            
            # Now try to access the user list
            users_response = session.get(f"{base_url}/admin/accounts/user/")
            print(f"Users page status: {users_response.status_code}")
            
            if users_response.status_code == 200:
                print("Successfully accessed users page")
                print("You can now manually check the user details in the admin panel")
                return True
            else:
                print("Failed to access users page")
                return False
        else:
            print("Failed to login to admin panel")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return False

def get_user_fcm_token_via_api(email):
    """
    Alternative: Try to get user data via API endpoints
    """
    base_url = "https://api.petow.app"
    
    try:
        # Try to get user profile (this might require authentication)
        response = requests.get(f"{base_url}/api/accounts/profile/")
        print(f"Profile API status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Profile data: {data}")
            return data.get('fcm_token')
        else:
            print(f"API response: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"API request error: {e}")
        return None

if __name__ == "__main__":
    email = "mmoataz03@gmail.com"
    password = "1579534886240"
    
    print("=== Method 1: Admin Panel Login ===")
    success = get_fcm_token_from_api(email, password)
    
    print("\n=== Method 2: API Endpoint ===")
    fcm_token = get_user_fcm_token_via_api(email)
    
    if fcm_token:
        print(f"FCM Token found: {fcm_token}")
    else:
        print("FCM Token not found via API")