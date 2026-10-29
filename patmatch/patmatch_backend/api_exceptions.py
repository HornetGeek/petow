from django.utils.translation import gettext as _
from rest_framework.exceptions import ErrorDetail
from rest_framework.views import exception_handler
from django.http import JsonResponse
from django.views.defaults import server_error as default_server_error


def server_error(request):
    if not request.path.startswith('/api/'):
        return default_server_error(request)
    return JsonResponse({'error': {'code': 'INTERNAL_SERVER_ERROR',
                                   'message': 'An unexpected error occurred.',
                                   'request_id': getattr(request, 'request_id', None)}}, status=500)


def _codes(value):
    if isinstance(value, ErrorDetail):
        return value.code
    if isinstance(value, list):
        return [_codes(item) for item in value]
    if isinstance(value, dict):
        return {key: _codes(item) for key, item in value.items()}
    return 'invalid'


def localized_exception_handler(exc, context):
    """Keep DRF's response shape while adding stable machine-readable codes."""
    response = exception_handler(exc, context)
    if response is None or not isinstance(response.data, dict):
        return response

    original = dict(response.data)
    response.data.setdefault('code', getattr(exc, 'default_code', 'api_error'))
    if 'detail' in original:
        response.data.setdefault('message', str(original['detail']))
    else:
        response.data.setdefault('message', _('Please correct the highlighted fields.'))
        response.data.setdefault('error_codes', _codes(original))
    return response
