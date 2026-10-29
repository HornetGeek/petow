"""Small, privacy-conscious Sentry and request correlation integration."""

import contextvars
import logging
import os
import re
import time
import uuid

from django.urls import Resolver404, resolve

_request_id = contextvars.ContextVar('petow_request_id', default=None)
_SAFE_ID = re.compile(r'^[A-Za-z0-9._-]{1,64}$')
_IDENTIFIERS = {'pet_id', 'clinic_id', 'appointment_id', 'chat_id',
                'adoption_request_id', 'breeding_request_id', 'story_id'}
_enabled = False


def request_id():
    return _request_id.get()


class RequestIdLogFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id() or '-'
        return True


def _before_send(event, hint):
    # Explicit allowlist: SDK integrations and third-party breadcrumbs may contain PII.
    request = event.get('request') or {}
    event['request'] = {key: request[key] for key in ('method',) if key in request}
    event.pop('user', None)
    event.pop('breadcrumbs', None)
    event.pop('extra', None)
    event.pop('message', None)
    event.pop('logentry', None)
    for error in (event.get('exception') or {}).get('values') or []:
        # Third-party exception strings can contain tokens, SQL values or message text.
        error['value'] = '[redacted]'
    contexts = event.get('contexts') or {}
    event['contexts'] = {key: value for key, value in contexts.items()
                         if key in ('trace', 'runtime', 'os', 'petow', 'petow_auth', 'business')}
    allowed_tags = {'module', 'operation', 'exception_type', 'error_code',
                    'http.method', 'route'}
    event['tags'] = {key: value for key, value in (event.get('tags') or {}).items()
                     if key in allowed_tags}
    return event


def _before_send_transaction(event, hint):
    event.pop('breadcrumbs', None)
    event.pop('request', None)
    event.pop('user', None)
    # SQL and outbound URLs can include private values.
    for span in event.get('spans') or []:
        if span.get('op', '').startswith(('db', 'http')):
            span.pop('description', None)
            span.pop('data', None)
    return event


def _traces_sampler(context):
    name = str(context.get('transaction_context', {}).get('name', ''))
    if name.endswith(('/health/', '/health', '/ready/', '/ready')):
        return 0.0
    try:
        return max(0.0, min(1.0, float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.05'))))
    except ValueError:
        return 0.05


def init_sentry():
    """Called once as Django settings load, in web and Celery processes."""
    global _enabled
    enabled = os.getenv('SENTRY_ENABLED', 'false').lower() in ('1', 'true', 'yes')
    dsn = os.getenv('SENTRY_DSN', '').strip()
    if not enabled or not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.django import DjangoIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv('SENTRY_ENVIRONMENT', 'production'),
            release=os.getenv('SENTRY_RELEASE') or None,
            integrations=[DjangoIntegration(), CeleryIntegration(),
                          LoggingIntegration(level=None, event_level=None)],
            send_default_pii=False,
            max_request_body_size='never',
            include_local_variables=False,
            traces_sampler=_traces_sampler,
            sample_rate=1.0,
            before_send=_before_send,
            before_send_transaction=_before_send_transaction,
        )
        _enabled = True
    except Exception:
        logging.getLogger(__name__).warning('Sentry initialization failed', exc_info=True)


def capture_handled(exc, *, module, operation, identifiers=None, error_code=None):
    """Report a swallowed unexpected exception once, without affecting the caller."""
    if not _enabled:
        return
    try:
        import sentry_sdk
        if getattr(exc, '_petow_sentry_captured', False):
            return
        with sentry_sdk.new_scope() as scope:
            scope.set_tag('module', module)
            scope.set_tag('operation', operation)
            scope.set_tag('exception_type', type(exc).__name__)
            if error_code:
                scope.set_tag('error_code', error_code)
            safe = {key: str(value) for key, value in (identifiers or {}).items()
                    if key in _IDENTIFIERS and value is not None and _SAFE_ID.fullmatch(str(value))}
            scope.set_context('business', {'module': module, 'operation': operation,
                                           'status_code': 500, **safe})
            sentry_sdk.capture_exception(exc)
        exc._petow_sentry_captured = True
    except Exception:
        logging.getLogger(__name__).warning('Sentry capture failed', exc_info=True)


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get('X-Request-ID', '')
        rid = supplied if _SAFE_ID.fullmatch(supplied) else str(uuid.uuid4())
        request.request_id = rid
        token = _request_id.set(rid)
        started = time.monotonic()
        try:
            try:
                match = resolve(request.path_info)
                route = '/' + (match.route or '').lstrip('/')
                identifiers = {key: str(value) for key, value in match.kwargs.items()
                               if key in _IDENTIFIERS and _SAFE_ID.fullmatch(str(value))}
            except Resolver404:
                route, identifiers = '<unmatched>', {}
            if _enabled:
                try:
                    import sentry_sdk
                    scope = sentry_sdk.get_current_scope()
                    scope.set_tag('http.method', request.method)
                    scope.set_tag('route', route)
                    scope.set_context('petow', {'request_id': rid, 'route': route,
                                                 'method': request.method, **identifiers})
                except Exception:
                    logging.getLogger(__name__).warning('Sentry request context failed', exc_info=True)
            response = self.get_response(request)
            response['X-Request-ID'] = rid
            return response
        finally:
            _request_id.reset(token)
