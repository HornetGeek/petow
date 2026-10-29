from django.utils import translation
from rest_framework.authentication import TokenAuthentication
from .monitoring import request_id


class PreferredLanguageTokenAuthentication(TokenAuthentication):
    """Use the saved account locale when a token client sends no locale header."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result and not request.META.get("HTTP_ACCEPT_LANGUAGE"):
            user, _ = result
            language = getattr(user, "preferred_language", "ar")
            if language in {"ar", "en"}:
                translation.activate(language)
        if result:
            try:
                import sentry_sdk
                sentry_sdk.get_current_scope().set_context(
                    'petow_auth', {'user_id': str(result[0].pk), 'request_id': request_id()})
            except Exception:
                pass
        return result
