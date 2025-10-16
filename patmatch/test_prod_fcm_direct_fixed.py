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

def test_production_fcm_token():
    """Test push notification with the FCM token from production"""
    
    # FCM token retrieved from production API
    fcm_token = 'cONGkdLhQYmYwJtPgG-kkb:APA91bF8bRxD4HgKxJ1mV5cTrQp3UjF2wGd8vLiOqNsX7yZ9kLmN2pQrS5tUvWxY3zA4bC6dE8fG9hI1jK2lM3nO5pQ7rS8tU9vW1xY2zA3bC4dE5fG6hI7jK8lM9nO0pQ'
    
    print('=== Testing Push Notification with Production FCM Token ===')
    print(f'User: mmoataz03@gmail.com')
    print(f'FCM Token: {fcm_token[:50]}...')
    print(f'Token Length: {len(fcm_token)} characters')
    print()
    
    # Check Firebase service
    if not firebase_service.is_initialized:
        print('❌ Firebase service not initialized')
        return False
    
    print('✅ Firebase service is ready')
    print()
    
    # Send test notification with all string values
    print('=== Sending Push Notification ===')
    success = firebase_service.send_notification(
        fcm_token=fcm_token,
        title='🐾 PetMatch Production Test',
        body='Hello Moataz! This is a test push notification sent from PetMatch production backend. If you see this, push notifications are working perfectly! 🎉',
        data={
            'type': 'production_test',
            'source': 'backend_direct',
            'timestamp': str(int(__import__('time').time())),
            'user': 'mmoataz03@gmail.com',
            'action': 'open_app'
        }
    )
    
    print()
    if success:
        print('🎉 Push notification sent successfully!')
        print('Check your device for the notification.')
        print()
        print('Notification details:')
        print('  📱 Title: 🐾 PetMatch Production Test')
        print('  💬 Body: Hello Moataz! This is a test push notification...')
        print('  👤 User: mmoataz03@gmail.com')
        print('  🔗 Source: backend_direct')
        print('  ⏰ Timestamp:', __import__('time').strftime('%Y-%m-%d %H:%M:%S'))
    else:
        print('❌ Failed to send push notification')
        print()
        print('This could mean:')
        print('  🔄 The FCM token is invalid or expired')
        print('  📱 The device is not registered for notifications')
        print('  🚫 The app is not installed on the device')
        print('  ⚙️  Firebase project configuration issue')
        print('  🔧 Network connectivity issue')
    
    return success

if __name__ == "__main__":
    result = test_production_fcm_token()
    
    print()
    print('=== Final Result ===')
    if result:
        print('✅ SUCCESS: Push notification sent to production FCM token!')
    else:
        print('❌ FAILED: Could not send push notification')
