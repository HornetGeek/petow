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
    """Test push notification with production FCM token"""
    
    # FCM token from production
    fcm_token = 'cONGkdLhQYmYwJtPgG-kkb:APA91bF8bRxD4HgKxJ1mV5cTrQp3UjF2wGd8vLiOqNsX7yZ9kLmN2pQrS5tUvWxY3zA4bC6dE8fG9hI1jK2lM3nO5pQ7rS8tU9vW1xY2zA3bC4dE5fG6hI7jK8lM9nO0pQ'
    
    print('=== Testing Push Notification with Production FCM Token ===')
    print(f'FCM Token: {fcm_token[:50]}...')
    print()
    
    # Check Firebase service
    if not firebase_service.is_initialized:
        print('❌ Firebase service not initialized')
        return False
    
    print('✅ Firebase service is ready')
    print()
    
    # Send test notification
    print('=== Sending Push Notification ===')
    success = firebase_service.send_notification(
        fcm_token=fcm_token,
        title='🐾 PetMatch Production Test',
        body='Hello! This is a test push notification sent from PetMatch backend. If you see this, push notifications are working! 🎉',
        data={
            'type': 'test',
            'source': 'production_test',
            'timestamp': str(int(__import__('time').time()))
        }
    )
    
    print()
    if success:
        print('✅ Push notification sent successfully!')
        print('Check your device for the notification.')
        print()
        print('Notification details:')
        print('  Title: 🐾 PetMatch Production Test')
        print('  Body: Hello! This is a test push notification...')
        print('  Source: production_test')
    else:
        print('❌ Failed to send push notification')
        print('This could mean:')
        print('  - The FCM token is invalid or expired')
        print('  - The device is not registered for notifications')
        print('  - The app is not installed on the device')
        print('  - Firebase credentials are incorrect')
    
    return success

if __name__ == "__main__":
    test_production_fcm_token()
