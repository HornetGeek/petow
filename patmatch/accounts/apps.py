from django.apps import AppConfig
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        if not (getattr(settings, 'GOOGLE_MAPS_SERVER_API_KEY', '') or '').strip():
            logger.warning(
                "GOOGLE_MAPS_SERVER_API_KEY is not configured. /api/accounts/maps/* endpoints will return 503."
            )
