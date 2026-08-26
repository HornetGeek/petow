from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import translation

from accounts.models import PushDevice, User
from .models import Notification
from .notification_templates import render_notification
from .notifications import _send_push_notification
from .serializers import NotificationSerializer


class NotificationTemplateTests(SimpleTestCase):
    def test_template_renders_both_languages_and_preserves_user_body(self):
        context = {'sender_name': 'Mona'}
        ar_title, ar_body = render_notification(
            'chat_message_received', context, 'ar', 'fallback', 'Hello from Mona'
        )
        en_title, en_body = render_notification(
            'chat_message_received', context, 'en', 'fallback', 'Hello from Mona'
        )
        self.assertEqual(ar_title, 'رسالة جديدة من Mona')
        self.assertEqual(en_title, 'New message from Mona')
        self.assertEqual(ar_body, 'Hello from Mona')
        self.assertEqual(en_body, 'Hello from Mona')

    def test_unknown_template_uses_legacy_text(self):
        self.assertEqual(
            render_notification('legacy', {}, 'en', 'Legacy title', 'Legacy body'),
            ('Legacy title', 'Legacy body'),
        )


class NotificationDeviceDeliveryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='notification-locales',
            email='notification-locales@example.com',
            password='testpass123',
            phone='1000000100',
            fcm_token='legacy-token',
        )
        PushDevice.objects.create(
            user=self.user, device_id='ar-device', token='ar-token', language='ar'
        )
        PushDevice.objects.create(
            user=self.user, device_id='en-device', token='en-token', language='en'
        )
        self.notification = Notification.objects.create(
            user=self.user,
            type='chat_message_received',
            title='رسالة جديدة',
            message='User-authored preview',
            template_key='chat_message_received',
            template_context={'sender_name': 'Mona'},
        )

    @patch('pets.notifications.firebase_service.send_notification', return_value=True)
    @patch('pets.notifications.firebase_service.is_initialized', True)
    def test_each_device_receives_its_own_language(self, send_mock):
        delivered = _send_push_notification(
            self.user,
            self.notification.title,
            self.notification.message,
            {'type': self.notification.type},
            notification=self.notification,
        )
        self.assertTrue(delivered)
        calls = {call.kwargs['fcm_token']: call.kwargs for call in send_mock.call_args_list}
        self.assertEqual(calls['ar-token']['title'], 'رسالة جديدة من Mona')
        self.assertEqual(calls['en-token']['title'], 'New message from Mona')
        self.assertEqual(calls['ar-token']['body'], 'User-authored preview')
        self.assertEqual(calls['en-token']['body'], 'User-authored preview')

    def test_serializer_rerenders_history_for_active_request_language(self):
        with translation.override('en'):
            english = NotificationSerializer(self.notification).data
        with translation.override('ar'):
            arabic = NotificationSerializer(self.notification).data
        self.assertEqual(english['title'], 'New message from Mona')
        self.assertEqual(arabic['title'], 'رسالة جديدة من Mona')
