from django.utils.translation import gettext as _
from rest_framework.exceptions import ErrorDetail
from rest_framework.views import exception_handler


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
