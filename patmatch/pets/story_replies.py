"""Story reply consent flow. Firestore writes are performed by the retryable outbox."""
from datetime import timedelta
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from accounts.firebase_service import firebase_service
from .models import ChatRoom, NotificationOutbox, Story, StoryReplyRequest, UserBlock
from .notification_events import enqueue_notification_event
from .serializers import StorySerializer


class StoryReplyThrottle(SimpleRateThrottle):
    scope = 'story_reply'
    rate = '20/min'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}


def is_blocked(a_id, b_id):
    return UserBlock.objects.filter(
        Q(blocker_id=a_id, blocked_id=b_id) | Q(blocker_id=b_id, blocked_id=a_id)
    ).exists()


def _eligible_room(sender_id, owner_id, exclude_id=None):
    rooms = ChatRoom.objects.filter(is_active=True).filter(
        Q(breeding_request__requester_id=sender_id, breeding_request__target_pet__owner_id=owner_id) |
        Q(breeding_request__requester_id=owner_id, breeding_request__target_pet__owner_id=sender_id) |
        Q(adoption_request__adopter_id=sender_id, adoption_request__pet__owner_id=owner_id) |
        Q(adoption_request__adopter_id=owner_id, adoption_request__pet__owner_id=sender_id) |
        Q(story_reply_request__sender_id=sender_id, story_reply_request__owner_id=owner_id) |
        Q(story_reply_request__sender_id=owner_id, story_reply_request__owner_id=sender_id)
    ).select_related('breeding_request', 'adoption_request', 'story_reply_request').order_by('id')
    if exclude_id:
        rooms = rooms.exclude(pk=exclude_id)
    for room in rooms:
        if room.breeding_request_id and room.breeding_request.status == 'approved':
            return room
        if room.adoption_request_id and room.adoption_send_eligible():
            return room
        if room.story_reply_request_id and room.story_reply_request.status == 'approved':
            return room
    return None


def _payload(reply, reused=False):
    room = reply.chat_room
    return {
        'id': reply.id, 'status': reply.status, 'story_id': reply.original_story_id,
        'chat_room_id': room.id if room else None,
        'firebase_chat_id': room.firebase_chat_id if room else None,
        'reused_chat': reused,
    }


def _lock_pair(sender_id, owner_id):
    # Ordered user locks serialize all requests and approvals for this pair.
    list(get_user_model().objects.select_for_update().filter(pk__in=[sender_id, owner_id]).order_by('pk').values_list('pk', flat=True))


def _visible_story(story_id, viewer):
    story = Story.objects.select_related('author', 'pet', 'pet__breed').filter(
        pk=story_id, is_hidden=False, deleted_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).first()
    if not story or is_blocked(viewer.pk, story.author_id):
        return None
    return story


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([StoryReplyThrottle])
def reply_to_story(request, story_id):
    text = request.data.get('text')
    key = request.data.get('idempotency_key')
    if not isinstance(text, str) or not text.strip() or len(text.strip()) > 1000:
        return Response({'error': 'Reply text must be 1–1000 characters'}, status=400)
    if not isinstance(key, str) or not 8 <= len(key) <= 100:
        return Response({'error': 'Invalid idempotency key'}, status=400)
    previous = StoryReplyRequest.objects.select_related('chat_room').filter(
        sender=request.user, idempotency_key=key, original_story_id=story_id, initial_text=text.strip()
    ).first()
    if previous:
        if is_blocked(previous.sender_id, previous.owner_id):
            return Response({'error': 'Blocked user'}, status=403)
        return Response(_payload(previous))
    with transaction.atomic():
        story = _visible_story(story_id, request.user)
        if not story:
            return Response({'error': 'Story unavailable'}, status=404)
        if story.author_id == request.user.pk:
            return Response({'error': 'Cannot reply to your own story'}, status=400)
        if not story.allow_replies:
            return Response({'error': 'Replies are disabled'}, status=403)
        _lock_pair(request.user.pk, story.author_id)
        existing = StoryReplyRequest.objects.select_for_update(of=('self',)).select_related('chat_room').filter(
            Q(sender=request.user, owner_id=story.author_id) |
            Q(sender_id=story.author_id, owner=request.user)
        ).first()
        if existing:
            if existing.sender_id == request.user.pk and existing.idempotency_key == key and existing.original_story_id == story.pk and existing.initial_text == text.strip():
                return Response(_payload(existing))
            return Response({'error': 'A story reply request already exists for this person'}, status=409)
        if StoryReplyRequest.objects.filter(sender=request.user, created_at__gte=timezone.now()-timedelta(hours=24)).count() >= 5:
            return Response({'error': 'Daily story reply request limit reached'}, status=429)
        room = _eligible_room(request.user.pk, story.author_id)
        reply = StoryReplyRequest.objects.create(
            sender=request.user, owner=story.author, story=story,
            original_story_id=story.pk, initial_text=text.strip(),
            idempotency_key=key,
            status='approved' if room else 'pending',
        )
        if room:
            reply.chat_room = room
            reply.save(update_fields=['chat_room', 'updated_at'])
            enqueue_notification_event(NotificationOutbox.EVENT_STORY_REPLY_APPROVED, reply.pk, f'story_reply_approved:{reply.pk}')
        else:
            room = ChatRoom.objects.create(story_reply_request=reply, is_active=False)
            reply.chat_room = room
            reply.save(update_fields=['chat_room', 'updated_at'])
            enqueue_notification_event(NotificationOutbox.EVENT_STORY_REPLY_RECEIVED, reply.pk, f'story_reply_received:{reply.pk}')
    return Response(_payload(reply, reused=reply.status == 'approved'), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_to_story_reply(request, reply_id, action):
    if action not in {'accept', 'reject'}:
        return Response({'error': 'Invalid action'}, status=400)
    with transaction.atomic():
        reply = StoryReplyRequest.objects.select_related('chat_room').filter(pk=reply_id, owner=request.user).first()
        if not reply:
            return Response({'error': 'Request not found'}, status=404)
        _lock_pair(reply.sender_id, reply.owner_id)
        reply = StoryReplyRequest.objects.select_for_update(of=('self',)).select_related('chat_room').get(pk=reply_id)
        target = 'approved' if action == 'accept' else 'rejected'
        if reply.status != 'pending':
            if reply.status == target:
                return Response(_payload(reply))
            return Response({'error': 'Request already resolved'}, status=409)
        if is_blocked(reply.sender_id, reply.owner_id):
            return Response({'error': 'Blocked user'}, status=403)
        if action == 'accept':
            room = _eligible_room(reply.sender_id, reply.owner_id, exclude_id=reply.chat_room_id)
            if room:
                reply.chat_room = room
            else:
                room = reply.chat_room
                room.is_active = True
                room.save(update_fields=['is_active', 'updated_at'])
            reply.status = 'approved'
            reply.save(update_fields=['status', 'chat_room', 'updated_at'])
            enqueue_notification_event(NotificationOutbox.EVENT_STORY_REPLY_APPROVED, reply.pk, f'story_reply_approved:{reply.pk}')
        else:
            reply.status = 'rejected'
            reply.save(update_fields=['status', 'updated_at'])
    return Response(_payload(reply))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def story_preview(request, story_id):
    story = _visible_story(story_id, request.user)
    if not story:
        return Response({'error': 'Story unavailable', 'unavailable': True}, status=404)
    return Response(StorySerializer(story, context={'request': request}).data)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def block_user(request, user_id):
    if user_id == request.user.pk:
        return Response({'error': 'Cannot block yourself'}, status=400)
    if not get_user_model().objects.filter(pk=user_id).exists():
        return Response({'error': 'User not found'}, status=404)
    if request.method == 'POST':
        UserBlock.objects.get_or_create(blocker=request.user, blocked_id=user_id)
    else:
        UserBlock.objects.filter(blocker=request.user, blocked_id=user_id).delete()
    rooms = ChatRoom.objects.filter(
        Q(breeding_request__requester_id=request.user.pk, breeding_request__target_pet__owner_id=user_id) |
        Q(breeding_request__requester_id=user_id, breeding_request__target_pet__owner_id=request.user.pk) |
        Q(adoption_request__adopter_id=request.user.pk, adoption_request__pet__owner_id=user_id) |
        Q(adoption_request__adopter_id=user_id, adoption_request__pet__owner_id=request.user.pk) |
        Q(story_reply_request__sender_id=request.user.pk, story_reply_request__owner_id=user_id) |
        Q(story_reply_request__sender_id=user_id, story_reply_request__owner_id=request.user.pk)
    ).distinct()
    for room_id in rooms.values_list('pk', flat=True):
        enqueue_notification_event(
            NotificationOutbox.EVENT_CHAT_PERMISSION_SYNC, room_id,
            f'chat_permission_sync:{room_id}:{uuid4().hex}',
        )
    return Response({'blocked': request.method == 'POST'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def firebase_token(request):
    if not firebase_service.is_initialized:
        return Response({'error': 'Firebase unavailable'}, status=503)
    from firebase_admin import auth
    token = auth.create_custom_token(str(request.user.pk), app=firebase_service.app)
    return Response({'token': token.decode('utf-8') if isinstance(token, bytes) else token})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def blocked_users(request):
    rows = UserBlock.objects.filter(blocker=request.user).select_related('blocked').order_by('-created_at')
    return Response({'results': [
        {'id': row.blocked_id, 'name': row.blocked.get_full_name() or row.blocked.email}
        for row in rows
    ]})
