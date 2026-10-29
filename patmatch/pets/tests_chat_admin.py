from django.test import SimpleTestCase
from django.test import RequestFactory
from django.contrib import admin
from unittest.mock import patch, Mock
from types import SimpleNamespace
from datetime import datetime, timezone
import hashlib
import hmac
import json
from django.test import override_settings
from .chat_admin_sync import sync_summary
from .chat_admin_service import pair_query, safe_image_url, message_page, room_is_exact_pair
from .admin import ChatRoomAdmin
from .models import ChatRoom


class ChatAdminHelpersTests(SimpleTestCase):
    def test_pair_query_is_order_independent(self):
        self.assertEqual(len(pair_query(1, 2).children), len(pair_query(2, 1).children))

    def test_rejects_foreign_and_script_image_urls(self):
        self.assertIsNone(safe_image_url('javascript:alert(1)'))
        self.assertIsNone(safe_image_url('https://evil.example/chat_images/x.png'))
        self.assertIsNone(safe_image_url('/media/chat_images/%2e%2e/private.png'))

    def test_text_search_does_not_apply_numeric_id_lookups(self):
        admin_view = ChatRoomAdmin(ChatRoom, admin.site)
        fields = admin_view.get_search_fields(None)
        self.assertNotIn('=id', fields)
        self.assertNotIn('=adoption_request__adopter__id', fields)
        self.assertIn('adoption_request__adopter__email', fields)

    @patch('pets.chat_admin_service.firestore_db')
    def test_group_firestore_room_is_excluded(self, db):
        db.return_value.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'participants': [1, 2, 3]}
        self.assertFalse(room_is_exact_pair(SimpleNamespace(firebase_chat_id='chat-1'), {1, 2}))

    def test_private_views_reject_staff_without_chat_permission(self):
        request = RequestFactory().get('/admin/pets/chatroom/1/viewer/')
        request.user = SimpleNamespace(is_active=True, is_staff=True, is_superuser=False, has_perm=lambda _: False)
        admin_view = ChatRoomAdmin(ChatRoom, admin.site)
        self.assertEqual(admin_view.viewer(request, 1).status_code, 403)
        self.assertEqual(admin_view.find_pair(request).status_code, 403)
        self.assertEqual(admin_view.user_search(request).status_code, 403)

    @patch('pets.chat_admin_service.context', return_value=('Adoption', 'approved', None))
    @patch('pets.chat_admin_service.participants')
    @patch('pets.chat_admin_service.firestore_db')
    def test_message_cursor_uses_timestamp_and_document_reference(self, db, participants, _context):
        participants.return_value = [SimpleNamespace(pk=1), SimpleNamespace(pk=2)]
        timestamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
        docs = [SimpleNamespace(id=f'm{i}', to_dict=lambda i=i: {'timestamp': timestamp, 'senderId': 1, 'text': str(i)}) for i in (3, 2, 1)]
        query = Mock()
        query.order_by.return_value = query
        query.start_after.return_value = query
        query.limit.return_value = query
        query.stream.return_value = docs
        collection = Mock()
        collection.order_by.return_value = query
        collection.document.return_value = 'document-ref'
        db.return_value.collection.return_value.document.return_value.collection.return_value = collection
        room = SimpleNamespace(firebase_chat_id='chat-1')
        page, cursor = message_page(room, size=2)
        self.assertEqual([m['id'] for m in page], ['m2', 'm3'])
        self.assertEqual(cursor, (timestamp, 'm2'))
        message_page(room, before=cursor, size=2)
        query.start_after.assert_called_with({'timestamp': timestamp, '__name__': 'document-ref'})

    @patch.dict('os.environ', {'CHAT_ADMIN_SYNC_SECRET': 'test-secret'})
    @patch('pets.chat_admin_sync.ChatRoom.objects')
    @patch('pets.chat_admin_sync.time.time', return_value=1000)
    def test_summary_sync_requires_valid_signature_and_monotonic_version(self, _clock, objects):
        body = json.dumps({'chat_id': 'room-1', 'version': 2, 'count': 14,
                           'last_message_at': '2026-01-01T00:00:00Z', 'last_message_preview': 'hello'}).encode()
        factory = RequestFactory()
        unsigned = factory.post('/internal/chat-admin-summary/', data=body, content_type='application/json', HTTP_X_CHAT_TIMESTAMP='1000')
        self.assertEqual(sync_summary(unsigned).status_code, 403)
        signature = hmac.new(b'test-secret', b'1000.' + body, hashlib.sha256).hexdigest()
        signed = factory.post('/internal/chat-admin-summary/', data=body, content_type='application/json', HTTP_X_CHAT_TIMESTAMP='1000', HTTP_X_CHAT_SIGNATURE=signature)
        self.assertEqual(sync_summary(signed).status_code, 200)
        objects.filter.assert_called_with(firebase_chat_id='room-1', admin_summary_version__lt=2)
        self.assertEqual(objects.filter.return_value.update.call_args.kwargs['admin_message_count'], 14)
