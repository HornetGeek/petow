"""Retryable Firestore delivery and privacy-safe story reply notifications."""
from firebase_admin import firestore
from google.cloud.firestore import SERVER_TIMESTAMP
from google.api_core.exceptions import AlreadyExists

from accounts.firebase_service import firebase_service
from .models import ChatRoom, StoryReplyRequest
from .notifications import create_notification_once, deliver_outbox_notification_push


def sync_room_permissions(room):
    if not firebase_service.is_initialized:
        raise RuntimeError('Firebase Admin is unavailable')
    from .story_replies import is_blocked
    participants = room.get_participants()
    participant_ids = [person.pk for person in participants]
    blocked = len(participant_ids) == 2 and is_blocked(*participant_ids)
    eligible = room.is_active and not blocked
    if room.story_reply_request_id:
        eligible = eligible and room.story_reply_request.status == 'approved'
    elif room.adoption_request_id:
        eligible = eligible and room.adoption_send_eligible()
    elif room.breeding_request_id:
        eligible = eligible and room.breeding_request.status == 'approved'
    db = firestore.client(app=firebase_service.app)
    db.collection('chats').document(room.firebase_chat_id).set({
        'participants': participant_ids,
        'participantUids': [str(pk) for pk in participant_ids],
        'permissionStatus': 'approved' if eligible else 'disabled',
        'isActive': bool(eligible),
        'updatedAt': SERVER_TIMESTAMP,
    }, merge=True)


def process_story_reply_received(reply_id, payload):
    reply = StoryReplyRequest.objects.select_related('owner', 'sender', 'chat_room').get(pk=reply_id)
    if reply.status != 'pending':
        return
    notification, created = create_notification_once(
        user=reply.owner, notification_type='story_reply_received',
        title='New story reply request', message='Someone replied to your story',
        related_chat_room=reply.chat_room,
        extra_data={'request_id': reply.pk, 'story_id': reply.original_story_id,
                    'deep_link': f'petow://clinic-chat?firebase_chat_id={reply.chat_room.firebase_chat_id}'},
        event_key=f'story_reply_received:{reply.pk}',
    )
    if created:
        deliver_outbox_notification_push(notification, push_payload={
            'type': 'story_reply_received', 'request_id': str(reply.pk),
            'story_id': str(reply.original_story_id),
            'deep_link': f'petow://clinic-chat?firebase_chat_id={reply.chat_room.firebase_chat_id}',
        })


def process_story_reply_approved(reply_id, payload):
    reply = StoryReplyRequest.objects.select_related('owner', 'sender', 'chat_room').get(pk=reply_id)
    if reply.status != 'approved' or not reply.chat_room:
        return
    room = reply.chat_room
    sync_room_permissions(room)
    db = firestore.client(app=firebase_service.app)
    chat_ref = db.collection('chats').document(room.firebase_chat_id)
    message_id = f'story_reply_{reply.pk}'
    # A deterministic ID and set() make retries safe if the push fails later.
    try:
        chat_ref.collection('messages').document(message_id).create({
        'text': reply.initial_text, 'senderId': reply.sender_id,
        'senderUid': str(reply.sender_id),
        'senderName': reply.sender.get_full_name() or '',
        'type': 'text', 'storyId': reply.original_story_id,
        'storyReplyRequestId': reply.pk,
        'timestamp': SERVER_TIMESTAMP,
        'readBy': [reply.sender_id],
        })
    except AlreadyExists:
        pass
    if not ChatRoom.objects.filter(story_reply_request=reply).exists():
        owner_notification, owner_created = create_notification_once(
            user=reply.owner, notification_type='story_reply_received',
            title='New story reply', message='Someone replied to your story',
            related_chat_room=room,
            extra_data={'request_id': reply.pk, 'chat_id': room.firebase_chat_id,
                        'deep_link': f'petow://clinic-chat?firebase_chat_id={room.firebase_chat_id}'},
            event_key=f'story_reply_delivered:{reply.pk}',
        )
        if owner_created:
            deliver_outbox_notification_push(owner_notification, push_payload={
                'type': 'story_reply_received', 'request_id': str(reply.pk),
                'chat_id': room.firebase_chat_id,
                'deep_link': f'petow://clinic-chat?firebase_chat_id={room.firebase_chat_id}',
            })
    notification, created = create_notification_once(
        user=reply.sender, notification_type='story_reply_approved',
        title='Story reply approved', message='You can now chat',
        related_chat_room=room,
        extra_data={'request_id': reply.pk, 'chat_id': room.firebase_chat_id,
                    'deep_link': f'petow://clinic-chat?firebase_chat_id={room.firebase_chat_id}'},
        event_key=f'story_reply_approved:{reply.pk}',
    )
    if created:
        deliver_outbox_notification_push(notification, push_payload={
            'type': 'story_reply_approved', 'request_id': str(reply.pk),
            'chat_id': room.firebase_chat_id,
            'deep_link': f'petow://clinic-chat?firebase_chat_id={room.firebase_chat_id}',
        })


def process_chat_permission_sync(room_id, payload):
    room = ChatRoom.objects.select_related(
        'story_reply_request', 'adoption_request', 'breeding_request',
    ).get(pk=room_id)
    sync_room_permissions(room)
