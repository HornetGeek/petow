"""Read-only queries used by the private conversation admin."""
from datetime import datetime
from urllib.parse import urlsplit, unquote
from django.conf import settings
from django.db.models import Q
from firebase_admin import firestore
from accounts.firebase_service import firebase_service
from .models import ChatRoom

ROOM_RELATIONS = (
    'breeding_request__requester', 'breeding_request__target_pet__owner',
    'adoption_request__adopter', 'adoption_request__pet__owner',
    'story_reply_request__sender', 'story_reply_request__owner',
    'clinic_patient__linked_user', 'clinic_staff',
    'breeding_request__target_pet', 'adoption_request__pet',
)


def rooms():
    return ChatRoom.objects.select_related(*ROOM_RELATIONS)


def pair_query(a, b):
    return (
        Q(breeding_request__requester_id=a, breeding_request__target_pet__owner_id=b) |
        Q(breeding_request__requester_id=b, breeding_request__target_pet__owner_id=a) |
        Q(adoption_request__adopter_id=a, adoption_request__pet__owner_id=b) |
        Q(adoption_request__adopter_id=b, adoption_request__pet__owner_id=a) |
        Q(story_reply_request__sender_id=a, story_reply_request__owner_id=b) |
        Q(story_reply_request__sender_id=b, story_reply_request__owner_id=a) |
        Q(clinic_staff_id=a, clinic_patient__linked_user_id=b) |
        Q(clinic_staff_id=b, clinic_patient__linked_user_id=a)
    )


def pair_rooms(a, b):
    if a == b:
        return rooms().none()
    return rooms().filter(pair_query(a, b)).order_by('-admin_last_message_at', '-pk')


def context(room):
    if room.breeding_request_id:
        r = room.breeding_request
        return 'Breeding', r.status, r.target_pet
    if room.adoption_request_id:
        r = room.adoption_request
        return 'Adoption', r.status, r.pet
    if room.story_reply_request_id:
        return 'Story reply', room.story_reply_request.status, None
    if room.clinic_patient_id:
        return 'Clinic', 'Active' if room.is_active else 'Archived', None
    return 'Unknown', 'Active' if room.is_active else 'Archived', None


def participants(room):
    people = room.get_participants()
    return people if len(people) == 2 and people[0].pk != people[1].pk else []


def firestore_db():
    if not firebase_service.is_initialized:
        raise RuntimeError('Firebase Admin is unavailable')
    return firestore.client(app=firebase_service.app)


def room_is_exact_pair(room, user_ids):
    data = (firestore_db().collection('chats').document(room.firebase_chat_id).get().to_dict() or {})
    raw = data.get('participantUids') or data.get('participants') or []
    try:
        return len(raw) == 2 and {int(value) for value in raw} == set(user_ids)
    except (TypeError, ValueError):
        return False


def safe_image_url(value):
    if not isinstance(value, str) or not value:
        return None
    media = urlsplit(settings.MEDIA_URL)
    candidate = urlsplit(value)
    if candidate.scheme not in ('', 'https') or value.startswith('//'):
        return None
    if candidate.netloc and candidate.netloc != media.netloc:
        return None
    base_path = media.path.rstrip('/') + '/chat_images/'
    decoded_path = unquote(candidate.path)
    if '..' in decoded_path.split('/') or '\\' in decoded_path:
        return None
    return value if decoded_path.startswith(base_path) else None


def message_page(room, before=None, size=50):
    """Fetch a bounded descending page, then return it in display order."""
    messages = firestore_db().collection('chats').document(room.firebase_chat_id).collection('messages')
    q = (messages.order_by('timestamp', direction=firestore.Query.DESCENDING)
         .order_by('__name__', direction=firestore.Query.DESCENDING))
    if before:
        stamp, doc_id = before
        q = q.start_after({'timestamp': stamp, '__name__': messages.document(doc_id)})
    docs = list(q.limit(size + 1).stream())
    more = len(docs) > size
    docs = docs[:size]
    result = []
    allowed = {p.pk for p in participants(room)}
    for doc in reversed(docs):
        data = doc.to_dict() or {}
        sender = data.get('senderId')
        if sender not in allowed:
            continue
        timestamp = data.get('timestamp')
        if not isinstance(timestamp, datetime):
            continue
        result.append({'id': doc.id, 'sender_id': sender, 'timestamp': timestamp,
                       'text': str(data.get('text') or ''), 'type': data.get('type') or 'text',
                       'image_url': safe_image_url(data.get('imageUrl')) if data.get('type') == 'image' else None,
                       'room': room, 'room_context': context(room)})
    cursor = None
    if more and docs:
        oldest = docs[-1]
        cursor = oldest.to_dict().get('timestamp'), oldest.id
    return result, cursor
