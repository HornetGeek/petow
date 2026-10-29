from django.utils import translation


class UserPreferredLocaleMiddleware:
    """Apply the saved locale for session-authenticated clients without a header."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if (
            user
            and user.is_authenticated
            and not request.META.get("HTTP_ACCEPT_LANGUAGE")
            and getattr(user, "preferred_language", None) in {"ar", "en"}
        ):
            translation.activate(user.preferred_language)
        return self.get_response(request)
