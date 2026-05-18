import json
import logging
import re
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

BRAND_NAME = "Petow"
EMAIL_CATEGORY_TRANSACTIONAL = "transactional"
EMAIL_CATEGORY_REMINDER = "reminder"
EMAIL_CATEGORY_ENGAGEMENT = "engagement"
NON_TRANSACTIONAL_EMAIL_CATEGORIES = {
    EMAIL_CATEGORY_REMINDER,
    EMAIL_CATEGORY_ENGAGEMENT,
}

SENSITIVE_METADATA_PATTERN = re.compile(
    r"(otp|password|secret|token|code|key|authorization)",
    re.IGNORECASE,
)


def build_rtl_email_html(
    *,
    title: str,
    body_html: str,
    primary_label: Optional[str] = None,
    primary_url: Optional[str] = None,
    secondary_label: Optional[str] = None,
    secondary_url: Optional[str] = None,
    why_you_received: str = "",
    support_whatsapp: str = "201272011482",
) -> str:
    primary_cta_html = ""
    if primary_label and primary_url:
        primary_cta_html = (
            "<p style=\"margin:0 0 14px;\">"
            f"<a href=\"{primary_url}\" "
            "style=\"display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;"
            "padding:12px 24px;border-radius:999px;font-weight:700;\">"
            f"{primary_label}</a></p>"
        )

    secondary_cta_html = ""
    if secondary_label and secondary_url:
        secondary_cta_html = (
            "<p style=\"margin:0 0 22px;\">"
            f"<a href=\"{secondary_url}\" style=\"color:#0ea5e9;text-decoration:none;font-weight:700;\">"
            f"{secondary_label}</a></p>"
        )

    why_you_received_html = ""
    if why_you_received:
        why_you_received_html = (
            "<p style=\"margin:0 0 10px;color:#334155;font-size:13px;line-height:1.8;\">"
            f"{why_you_received}</p>"
        )

    whatsapp_link = f"https://wa.me/{support_whatsapp}"
    return f"""
    <html lang="ar" dir="rtl">
      <body style="margin:0;padding:0;background:#f8fafc;font-family:'Tajawal',Arial,sans-serif;color:#0f172a;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.08);">
                <tr>
                  <td style="padding:26px 24px;background:#0f172a;color:#ffffff;">
                    <h1 style="margin:0;font-size:24px;line-height:1.5;">{title}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 24px 24px;font-size:15px;line-height:1.9;">
                    {body_html}
                    {primary_cta_html}
                    {secondary_cta_html}
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
                    {why_you_received_html}
                    <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.8;">
                      للدعم: <a href="{whatsapp_link}" style="color:#0ea5e9;text-decoration:none;">+{support_whatsapp}</a>
                    </p>
                    <p style="margin:0;color:#334155;font-size:13px;line-height:1.8;">
                      فريق <strong>{BRAND_NAME}</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def send_email_payload(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    category: str = EMAIL_CATEGORY_TRANSACTIONAL,
    metadata: Optional[Dict[str, Any]] = None,
    reply_to: Optional[List[str]] = None,
) -> bool:
    if not to_email:
        logger.warning("email_send_skipped reason=missing_recipient category=%s", category)
        return False

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(settings, "SERVER_EMAIL", None)
    if not from_email:
        logger.warning(
            "email_send_skipped reason=missing_from_email category=%s recipient=%s",
            category,
            to_email,
        )
        return False

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=from_email,
        to=[to_email],
        reply_to=reply_to or None,
    )
    if html_body:
        email.attach_alternative(html_body, "text/html")

    headers = {"X-Petow-Email-Category": category}
    if category in NON_TRANSACTIONAL_EMAIL_CATEGORIES:
        support_email = getattr(settings, "BREVO_FROM_EMAIL", "") or from_email
        unsubscribe_url = getattr(
            settings,
            "EMAIL_REMINDER_UNSUBSCRIBE_URL",
            "https://petow.app/profile/notifications",
        )
        headers["List-Unsubscribe"] = f"<mailto:{support_email}?subject=unsubscribe>, <{unsubscribe_url}>"
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    email.extra_headers = headers

    safe_metadata = _sanitize_metadata(metadata)
    try:
        email.send(fail_silently=False)
        provider_message_id = getattr(email, "brevo_message_id", "")
        logger.info(
            "email_send_success category=%s recipient=%s provider_message_id=%s metadata=%s",
            category,
            to_email,
            provider_message_id or "n/a",
            json.dumps(safe_metadata, ensure_ascii=False),
        )
        return True
    except Exception as exc:
        error_class = getattr(exc, "classification", exc.__class__.__name__)
        logger.error(
            "email_send_failed category=%s recipient=%s error_class=%s metadata=%s",
            category,
            to_email,
            error_class,
            json.dumps(safe_metadata, ensure_ascii=False),
        )
        raise


def _sanitize_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}

    sanitized: Dict[str, Any] = {}
    for key, value in metadata.items():
        key_text = str(key)
        if SENSITIVE_METADATA_PATTERN.search(key_text):
            sanitized[key_text] = "<redacted>"
            continue

        if isinstance(value, (int, float, bool)) or value is None:
            sanitized[key_text] = value
            continue

        text_value = str(value)
        if len(text_value) > 120:
            text_value = f"{text_value[:117]}..."
        sanitized[key_text] = text_value

    return sanitized
