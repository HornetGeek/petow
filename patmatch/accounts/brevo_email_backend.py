"""
Custom Django email backend using Brevo API via HTTP requests
"""
import requests
import json
from django.core.mail.backends.base import BaseEmailBackend
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

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
        
        if not self.api_key:
            logger.warning("Brevo API key not configured")
    
    def send_messages(self, email_messages):
        """
        Send one or more EmailMessage objects using Brevo API
        """
        if not self.api_key:
            if not self.fail_silently:
                raise Exception("Brevo API key not configured")
            return 0
        
        sent_count = 0
        
        for message in email_messages:
            try:
                # Prepare email data for Brevo API
                email_data = {
                    "sender": {
                        "name": self.from_name,
                        "email": self.from_email
                    },
                    "to": [{"email": recipient} for recipient in message.to],
                    "subject": message.subject,
                    "htmlContent": message.body if message.content_subtype == 'html' else f"<p>{message.body}</p>",
                    "textContent": message.body if message.content_subtype == 'plain' else None
                }
                
                # Add reply-to if specified
                if message.reply_to:
                    email_data["replyTo"] = {"email": message.reply_to[0]}
                
                # Send the email via Brevo API
                headers = {
                    'accept': 'application/json',
                    'api-key': self.api_key,
                    'content-type': 'application/json'
                }
                
                response = requests.post(
                    self.api_url,
                    headers=headers,
                    data=json.dumps(email_data)
                )
                
                if response.status_code == 201:
                    logger.info(f"✅ Email sent successfully via Brevo API: {response.json()}")
                    sent_count += 1
                else:
                    error_msg = f"❌ Failed to send email via Brevo API: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    if not self.fail_silently:
                        raise Exception(error_msg)
                
            except Exception as e:
                error_msg = f"❌ Failed to send email via Brevo API: {str(e)}"
                logger.error(error_msg)
                if not self.fail_silently:
                    raise Exception(error_msg)
        
        return sent_count
