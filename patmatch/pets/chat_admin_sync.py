"""Service-only endpoint for Firestore message summaries."""
import hashlib
import hmac
import json
import os
import time
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .models import ChatRoom


@csrf_exempt
@require_POST
def sync_summary(request):
    secret = os.environ.get('CHAT_ADMIN_SYNC_SECRET', '')
    stamp = request.headers.get('X-Chat-Timestamp', '')
    signature = request.headers.get('X-Chat-Signature', '')
    try:
        if not secret or abs(time.time() - int(stamp)) > 300:
            raise ValueError
    except ValueError:
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    expected = hmac.new(secret.encode(), stamp.encode() + b'.' + request.body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    try:
        payload = json.loads(request.body)
        chat_id = str(payload['chat_id'])
        version = int(payload['version'])
        count = int(payload['count'])
        latest = datetime.fromisoformat(payload['last_message_at'].replace('Z', '+00:00')) if payload.get('last_message_at') else None
        if version < 1 or count < 0 or (latest and latest.tzinfo is None):
            raise ValueError
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return JsonResponse({'error': 'Invalid payload'}, status=400)
    updated = ChatRoom.objects.filter(firebase_chat_id=chat_id, admin_summary_version__lt=version).update(
        admin_summary_version=version, admin_message_count=count,
        admin_last_message_at=latest,
        admin_last_message_preview=str(payload.get('last_message_preview') or '')[:120],
    )
    return JsonResponse({'updated': bool(updated)})
