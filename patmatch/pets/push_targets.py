"""Helpers for generating canonical push deep links and web URLs."""
from typing import Any, Dict, Iterable, Optional
from urllib.parse import quote


BREEDING_REQUEST_TYPES = {
    'breeding_request_received',
    'breeding_request_approved',
    'breeding_request_rejected',
    'breeding_request_pending_reminder',
    'breeding_request_completed',
}

ADOPTION_REQUEST_TYPES = {
    'adoption_request_received',
    'adoption_request_pending_reminder',
    'adoption_request_approved',
}

PET_DETAIL_TYPES = {
    'pet_nearby',
    'adoption_pet_nearby',
    'pet_status_changed',
}

CHAT_TYPES = {
    'chat_message_received',
    'clinic_chat_message',
}

SYSTEM_PROFILE_TYPES = {
    'clinic_invite',
    'clinic_broadcast',
    'system_message',
    'app_update',
    'system_issue_apology',
    'recommended_pets',
    'account_verification_approved',
}


def _normalize_type(notification_type: Any) -> str:
    if not notification_type:
        return ''
    return str(notification_type).strip().lower()


def _to_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _pick_value(context: Dict[str, Any], keys: Iterable[str]) -> Optional[str]:
    for key in keys:
        if key not in context:
            continue
        text = _to_text(context.get(key))
        if text:
            return text
    return None


def _with_query(base_url: str, key: str, value: Optional[str]) -> str:
    if not value:
        return base_url
    return f"{base_url}?{key}={quote(value)}"


def build_mobile_deep_link(notification_type: Any, context: Optional[Dict[str, Any]] = None) -> str:
    """Build the mobile deep link for a push notification type."""
    n_type = _normalize_type(notification_type)
    ctx: Dict[str, Any] = context or {}

    if n_type in BREEDING_REQUEST_TYPES:
        request_id = _pick_value(ctx, ('breeding_request_id', 'request_id'))
        return _with_query('petow://breeding-requests', 'breeding_request_id', request_id)

    if n_type in ADOPTION_REQUEST_TYPES:
        request_id = _pick_value(ctx, ('adoption_request_id', 'request_id'))
        return _with_query('petow://adoption-requests', 'adoption_request_id', request_id)

    if n_type in PET_DETAIL_TYPES:
        pet_id = _pick_value(ctx, ('pet_id', 'related_pet', 'target_id'))
        return _with_query('petow://pet-details', 'pet_id', pet_id)

    if n_type in CHAT_TYPES:
        chat_id = _pick_value(ctx, ('firebase_chat_id', 'chat_id', 'chat_room_id'))
        return _with_query('petow://clinic-chat', 'firebase_chat_id', chat_id)

    if n_type in {'clinic_invite', 'clinic_broadcast'}:
        return _with_query('petow://notifications', 'type', n_type)

    # Default fallback route for unknown and legacy push types.
    return 'petow://notifications'


def build_web_url(notification_type: Any, context: Optional[Dict[str, Any]] = None) -> str:
    """Build the target web URL for a push notification type."""
    n_type = _normalize_type(notification_type)
    ctx: Dict[str, Any] = context or {}

    if n_type in BREEDING_REQUEST_TYPES:
        return '/my-breeding-requests'

    if n_type in {'adoption_request_received', 'adoption_request_pending_reminder'}:
        return '/adoption/received'

    if n_type == 'adoption_request_approved':
        return '/adoption/my-requests'

    if n_type in PET_DETAIL_TYPES:
        pet_id = _pick_value(ctx, ('pet_id', 'related_pet', 'target_id'))
        if pet_id:
            return '/pets/{pet_id}'.format(pet_id=quote(pet_id))
        return '/profile'

    if n_type in CHAT_TYPES:
        chat_id = _pick_value(ctx, ('firebase_chat_id', 'chat_id', 'chat_room_id'))
        if chat_id:
            return '/chat/{chat_id}'.format(chat_id=quote(chat_id))
        return '/profile'

    if n_type in SYSTEM_PROFILE_TYPES:
        return '/profile'

    # Default fallback for unknown and legacy push types.
    return '/profile'


def attach_push_targets(
    payload: Optional[Dict[str, Any]],
    notification_type: Any,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return payload enriched with deep_link and url targets when absent."""
    enriched: Dict[str, Any] = dict(payload or {})
    resolved_context = context or enriched

    if not enriched.get('deep_link'):
        enriched['deep_link'] = build_mobile_deep_link(notification_type, resolved_context)

    if not enriched.get('url'):
        enriched['url'] = build_web_url(notification_type, resolved_context)

    return enriched
