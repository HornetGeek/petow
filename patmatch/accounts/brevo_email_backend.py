"""
Custom Django email backend using Brevo API via HTTP requests
"""
import json
import logging
import time

import requests
from django.core.mail.backends.base import BaseEmailBackend
from django.conf import settings

logger = logging.getLogger(__name__)


class BrevoSendError(Exception):
    def __init__(
        self,
        message,
        *,
        classification='unknown',
        status_code=None,
        retryable=False,
        provider_code='',
    ):
        super().__init__(message)
        self.classification = classification
        self.status_code = status_code
        self.retryable = retryable
        self.provider_code = provider_code


class BrevoEmailBackend(BaseEmailBackend):
    """
    Custom email backend that uses Brevo API to send emails via HTTP requests
    """
    
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.api_key = getattr(settings, 'BREVO_API_KEY', '')
        self.from_email = getattr(settings, 'BREVO_FROM_EMAIL', '')
        self.from_name = getattr(settings, 'BREVO_FROM_NAME', 'Petow')
        self.api_url = 'https://api.brevo.com/v3/smtp/email'
        self.timeout_seconds = max(
            1.0,
            float(getattr(settings, 'BREVO_REQUEST_TIMEOUT_SECONDS', 10.0)),
        )
        configured_retries = int(getattr(settings, 'BREVO_MAX_RETRIES', 2))
        self.max_retries = min(max(configured_retries, 0), 5)
        self.base_backoff_seconds = max(
            0.1,
            float(getattr(settings, 'BREVO_RETRY_BACKOFF_SECONDS', 0.75)),
        )
        self._session = requests.Session()
        
        if not self.api_key:
            logger.warning("Brevo API key not configured")
    
    def send_messages(self, email_messages):
        """
        Send one or more EmailMessage objects using Brevo API
        """
        if not email_messages:
            return 0

        if not self.api_key:
            if not self.fail_silently:
                raise Exception("Brevo API key not configured")
            return 0
        
        sent_count = 0
        
        for message in email_messages:
            try:
                email_data, category = self._build_email_payload(message)
                message_id, attempts = self._post_with_retry(email_data, category=category)
                setattr(message, 'brevo_message_id', message_id)
                logger.info(
                    "brevo_send_success category=%s recipients=%s attempts=%s message_id=%s",
                    category,
                    len(message.to),
                    attempts,
                    message_id or 'n/a',
                )
                sent_count += 1
            except BrevoSendError as exc:
                logger.error(
                    "brevo_send_failed category=%s recipients=%s classification=%s status_code=%s provider_code=%s retryable=%s",
                    self._resolve_category(message),
                    len(getattr(message, 'to', []) or []),
                    exc.classification,
                    exc.status_code or 'n/a',
                    exc.provider_code or 'n/a',
                    exc.retryable,
                )
                if not self.fail_silently:
                    raise
            except Exception as exc:
                logger.error(
                    "brevo_send_failed category=%s recipients=%s classification=unexpected_error error=%s",
                    self._resolve_category(message),
                    len(getattr(message, 'to', []) or []),
                    exc.__class__.__name__,
                )
                if not self.fail_silently:
                    raise
        
        return sent_count

    def _build_email_payload(self, message):
        html_content = None
        text_content = None

        if getattr(message, 'alternatives', None):
            for alt_body, alt_mime in message.alternatives:
                if alt_mime == 'text/html':
                    html_content = alt_body
                    break

        if message.body:
            if getattr(message, 'content_subtype', '') == 'html' and not html_content:
                html_content = message.body
            else:
                text_content = message.body

        if html_content is None and text_content:
            html_content = f"<pre>{text_content}</pre>"

        email_data = {
            "sender": {
                "name": self.from_name,
                "email": self.from_email
            },
            "to": [{"email": recipient} for recipient in message.to],
            "subject": message.subject,
            "htmlContent": html_content,
            "textContent": text_content
        }

        if message.reply_to:
            email_data["replyTo"] = {"email": message.reply_to[0]}

        return email_data, self._resolve_category(message)

    def _resolve_category(self, message):
        headers = getattr(message, 'extra_headers', {}) or {}
        return headers.get('X-Petow-Email-Category', 'transactional')

    def _post_with_retry(self, email_data, category='transactional'):
        headers = {
            'accept': 'application/json',
            'api-key': self.api_key,
            'content-type': 'application/json'
        }
        last_error = None
        max_attempts = self.max_retries + 1

        for attempt in range(1, max_attempts + 1):
            try:
                response = self._session.post(
                    self.api_url,
                    headers=headers,
                    data=json.dumps(email_data),
                    timeout=self.timeout_seconds,
                )
                if response.status_code == 201:
                    payload = self._safe_json(response)
                    message_id = payload.get('messageId', '')
                    return message_id, attempt

                provider_payload = self._safe_json(response)
                provider_code = str(provider_payload.get('code') or provider_payload.get('errorCode') or '')
                provider_message = str(
                    provider_payload.get('message')
                    or provider_payload.get('error')
                    or ''
                )
                classification, retryable = self._classify_http_failure(response.status_code)
                last_error = BrevoSendError(
                    f"Brevo HTTP {response.status_code}: {provider_message or 'request failed'}",
                    classification=classification,
                    status_code=response.status_code,
                    retryable=retryable,
                    provider_code=provider_code,
                )
            except requests.Timeout as exc:
                last_error = BrevoSendError(
                    f"Brevo request timeout: {exc}",
                    classification='timeout',
                    retryable=True,
                )
            except requests.RequestException as exc:
                last_error = BrevoSendError(
                    f"Brevo request error: {exc.__class__.__name__}",
                    classification='network_error',
                    retryable=True,
                )

            if not last_error:
                continue

            if attempt < max_attempts and last_error.retryable:
                wait_seconds = self.base_backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    "brevo_retry_scheduled category=%s attempt=%s max_attempts=%s classification=%s wait_seconds=%.2f",
                    category,
                    attempt,
                    max_attempts,
                    last_error.classification,
                    wait_seconds,
                )
                time.sleep(wait_seconds)
                continue

            raise last_error

        raise BrevoSendError("Brevo send failed without explicit error", classification='unknown')

    def _safe_json(self, response):
        try:
            return response.json()
        except ValueError:
            return {}

    def _classify_http_failure(self, status_code):
        if status_code in (408, 429):
            return 'rate_limited_or_timeout', True
        if 500 <= status_code <= 599:
            return 'provider_server_error', True
        if status_code in (401, 403):
            return 'provider_auth_error', False
        if status_code == 404:
            return 'provider_endpoint_not_found', False
        if status_code == 400:
            return 'invalid_payload', False
        if status_code == 413:
            return 'payload_too_large', False
        if 400 <= status_code <= 499:
            return 'provider_client_error', False
        return 'unknown_http_error', False
