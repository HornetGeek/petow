from unittest.mock import patch

from django.http import HttpResponse
from django.test import SimpleTestCase, RequestFactory

from . import monitoring

urlpatterns = []


class MonitoringTests(SimpleTestCase):
    def test_request_id_created_and_returned_without_sentry(self):
        request = RequestFactory().get('/api/missing/', HTTP_X_REQUEST_ID='bad/value')
        response = monitoring.RequestContextMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(response['X-Request-ID'], request.request_id)
        self.assertNotEqual(request.request_id, 'bad/value')
        self.assertIsNone(monitoring.request_id())

    def test_safe_inbound_request_id(self):
        request = RequestFactory().get('/api/missing/', HTTP_X_REQUEST_ID='mobile-123')
        response = monitoring.RequestContextMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(response['X-Request-ID'], 'mobile-123')

    def test_sensitive_event_fields_removed(self):
        event = {'request': {'method': 'POST', 'data': {'password': 'secret'},
                             'headers': {'Authorization': 'Bearer secret'},
                             'url': 'https://example.com/?token=secret'},
                 'user': {'email': 'private@example.com'},
                 'breadcrumbs': [{'message': 'private chat'}],
                 'extra': {'body': 'secret'},
                 'exception': {'values': [{'type': 'RuntimeError', 'value': 'private chat'}]},
                 'contexts': {'petow': {'request_id': 'abc'},
                              'response': {'body': 'private chat'}}}
        cleaned = monitoring._before_send(event, {})
        self.assertEqual(cleaned['request'], {'method': 'POST'})
        self.assertNotIn('user', cleaned)
        self.assertNotIn('breadcrumbs', cleaned)
        self.assertEqual(cleaned['contexts'], {'petow': {'request_id': 'abc'}})
        self.assertEqual(cleaned['exception']['values'][0]['value'], '[redacted]')

    def test_disabled_capture_does_not_raise(self):
        with patch.object(monitoring, '_enabled', False):
            monitoring.capture_handled(RuntimeError('test'), module='test', operation='test')

    def test_handled_exception_emits_once(self):
        import sentry_sdk
        events = []
        sentry_sdk.init(dsn='http://abc@example.com/1', transport=events.append,
                        default_integrations=False, before_send=monitoring._before_send)
        exc = RuntimeError('test failure')
        with patch.object(monitoring, '_enabled', True):
            monitoring.capture_handled(exc, module='chat', operation='create_room',
                                       identifiers={'chat_id': 42, 'email': 'private@example.com'})
            monitoring.capture_handled(exc, module='chat', operation='create_room')
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['tags']['operation'], 'create_room')
        self.assertEqual(events[0]['contexts']['business']['chat_id'], '42')
        self.assertNotIn('email', events[0]['contexts']['business'])
        sentry_sdk.get_client().close()
