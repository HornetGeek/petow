#!/usr/bin/env python3
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

def send_test_notification():
    """Send a test push notification to the specified FCM token"""
    
    # The FCM token you provided
    fcm_token = "cONGkdLhQYmYwJtPgG-kkb:APA91bF8bRxD4HgKxJ1mV5cTrQp3UjF2wGd8vLiOqNsX7yZ9kLmN2pQrS5tUvWxY3zA4bC6dE8fG9hI1jK2lM3nO5pQ7rS8tU9vW1xY2zA3bC4dE5fG6hI7jK8lM9nO0pQ"
    
    print("=== PetMatch Push Notification Test ===")
    print(f"Target FCM Token: {fcm_token[:50]}...")
    print()
    
    # Check Firebase service status
    print("=== Checking Firebase Service ===")
    if firebase_service.is_initialized:
        print("✅ Firebase service is initialized and ready")
    else:
        print("❌ Firebase service is not initialized")
        print("Check Firebase credentials in settings")
        return False
    
    print()
    
    # Send test notification
    print("=== Sending Test Notification ===")
    
    # Test data for the notification
    data = {
        'type': 'test',
        'timestamp': str(int(__import__('time').time())),
        'source': 'manual_test',
        'action': 'open_app'
    }
    
    success = firebase_service.send_notification(
        fcm_token=fcm_token,
        title="🐾 PetMatch Test Notification",
        body="Hello! This is a test push notification from PetMatch. If you see this, push notifications are working perfectly! 🎉",
        data=data
    )
    
    print()
    if success:
        print("🎉 Test notification sent successfully!")
        print("Check your device for the notification.")
        print()
        print("Notification details:")
        print(f"  Title: 🐾 PetMatch Test Notification")
        print(f"  Body: Hello! This is a test push notification from PetMatch...")
        print(f"  Data: {data}")
    else:
        print("❌ Failed to send test notification")
        print("This could mean:")
        print("  - The FCM token is invalid or expired")
        print("  - The device is not registered for notifications")
        print("  - Firebase credentials are incorrect")
        print("  - The app is not installed on the device")
    
    return success

if __name__ == "__main__":
    try:
        send_test_notification()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
