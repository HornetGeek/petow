#!/usr/bin/env python3
"""
Send a test push notification with Notifee action buttons to a specific FCM token.

Usage:
    python patmatch/test_fcm_action_buttons.py --token <FCM_TOKEN>
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import django

# Ensure Django can find the project
project_root = Path(__file__).resolve().parent
sys.path.append(str(project_root))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
django.setup()

from accounts.firebase_service import firebase_service  # noqa: E402
from firebase_admin import messaging  # noqa: E402


def build_notifee_payload(title: str, body: str):
    """Construct the Notifee payload with action buttons."""
    return {
        "title": title,
        "body": body,
        "android": {
            # Must match an existing channel on the device; default is fine for tests
            "channelId": "default",
            "smallIcon": "ic_launcher",  # Use app icon
            "pressAction": {"id": "default"},
            "actions": [
                {
                    "title": "View Pet",
                    "pressAction": {"id": "view_pet", "launchActivity": "default"},
                    "input": None,
                },
                {
                    "title": "Snooze",
                    "pressAction": {"id": "snooze_notification"},
                },
            ],
        },
        "ios": {
            "categoryId": "petmatch_actions",  # Requires matching category on iOS
        },
    }


def send_action_notification(
    fcm_token: str,
    title: str,
    body: str,
    notification_type: str,
    breeding_request_id: Optional[str] = None,
    adoption_request_id: Optional[str] = None,
    firebase_chat_id: Optional[str] = None,
) -> bool:
    """Send the push notification using Firebase Admin SDK."""
    if not firebase_service.is_initialized:
        print("❌ Firebase service is not initialized. Check credentials in settings.")
        return False

    notifee_payload = build_notifee_payload(title, body)
    data_payload = {
        "type": notification_type,
        "source": "backend_action_button_test",
        "timestamp": str(int(time.time())),
        # Notifee expects the payload to be JSON encoded string under the `notifee` key.
        "notifee": json.dumps(notifee_payload),
    }
    data_payload["title"] = title
    data_payload["body"] = body
    data_payload["message"] = body

    if notification_type == "breeding_request_received":
        data_payload["breeding_request_id"] = breeding_request_id or "1234"
    elif notification_type == "adoption_request_received":
        data_payload["adoption_request_id"] = adoption_request_id or "5678"
    elif notification_type == "clinic_chat_message":
        data_payload["firebase_chat_id"] = firebase_chat_id or "demo-chat"

    message = messaging.Message(
        data=data_payload,
        token=fcm_token,
    )

    try:
        response = messaging.send(message)
        print(f"✅ Notification sent successfully: {response}")
        return True
    except Exception as exc:
        print(f"❌ Failed to send notification: {exc}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Send Notifee action button test notification.")
    parser.add_argument(
        "--token",
        required=True,
        help="Target device FCM token.",
    )
    parser.add_argument(
        "--title",
        default="🐾 PetMatch Action Test",
        help="Notification title.",
    )
    parser.add_argument(
        "--body",
        default="Try the action buttons below to interact with this notification.",
        help="Notification body.",
    )
    parser.add_argument(
        "--notification-type",
        choices=["breeding_request_received", "adoption_request_received", "clinic_chat_message", "action_test"],
        default="breeding_request_received",
        help="Value placed in data['type']; drives which actions appear in the app.",
    )
    parser.add_argument(
        "--breeding-request-id",
        help="Breeding request id used when type=breeding_request_received.",
    )
    parser.add_argument(
        "--adoption-request-id",
        help="Adoption request id used when type=adoption_request_received.",
    )
    parser.add_argument(
        "--firebase-chat-id",
        help="Firebase chat id used when type=clinic_chat_message.",
    )

    args = parser.parse_args()

    masked = f"{args.token[:24]}…{args.token[-8:]}"
    print("=== PetMatch Action Button Notification Test ===")
    print(f"Target FCM token: {masked}")
    print(f"Title: {args.title}")
    print(f"Body: {args.body}")
    print()

    success = send_action_notification(
        fcm_token=args.token,
        title=args.title,
        body=args.body,
        notification_type=args.notification_type,
        breeding_request_id=args.breeding_request_id,
        adoption_request_id=args.adoption_request_id,
        firebase_chat_id=args.firebase_chat_id,
    )

    print("\n" + "=" * 60)
    if success:
        print("🎉 Action button test notification sent.")
        print("📱 Check the device, interact with the buttons, and verify app handlers.")
    else:
        print("❌ Failed to send action button test notification.")
        print("🔧 Verify Firebase credentials and the FCM token, then try again.")
    print("=" * 60)


if __name__ == "__main__":
    main()
