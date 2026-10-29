"""Populate admin summaries for rooms created before the message trigger."""
from django.core.management.base import BaseCommand
from pets.chat_admin_service import firestore_db
from pets.models import ChatRoom


class Command(BaseCommand):
    help = 'Backfill existing Firestore chat summaries in bounded room batches'

    def handle(self, *args, **options):
        db = firestore_db()
        for room in ChatRoom.objects.filter(admin_message_count__isnull=True).iterator(chunk_size=100):
            messages = db.collection('chats').document(room.firebase_chat_id).collection('messages')
            count = messages.count().get()[0][0].value
            latest = list(messages.order_by('timestamp', direction='DESCENDING').limit(1).stream())
            data = latest[0].to_dict() if latest else {}
            preview = '📷' if data.get('type') == 'image' else str(data.get('text') or '')[:120]
            ChatRoom.objects.filter(pk=room.pk, admin_message_count__isnull=True).update(
                admin_message_count=count, admin_last_message_at=data.get('timestamp'),
                admin_last_message_preview=preview,
            )
            self.stdout.write(f'Backfilled room {room.pk}')
