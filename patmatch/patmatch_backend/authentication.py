from django.utils import translation
from rest_framework.authentication import TokenAuthentication


class PreferredLanguageTokenAuthentication(TokenAuthentication):
    """Use the saved account locale when a token client sends no locale header."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result and not request.META.get("HTTP_ACCEPT_LANGUAGE"):
            user, _ = result
            language = getattr(user, "preferred_language", "ar")
            if language in {"ar", "en"}:
                translation.activate(language)
        return result
