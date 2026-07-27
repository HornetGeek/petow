from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly, AllowAny, IsAdminUser
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError
import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from django.conf import settings
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.db import connection, transaction
from django.db.utils import DatabaseError
from django.utils import timezone
from django.contrib.gis.db import models as gis_models
from django.contrib.gis.db.models.functions import Distance, Transform
from django.contrib.gis.geos import Point, Polygon
from .models import (
    Breed,
    Pet,
    BreedingRequest,
    Favorite,
    PetLike,
    VeterinaryClinic,
    Notification,
    ChatRoom,
    AdoptionRequest,
    NotificationOutbox,
    Story,
    StoryView,
    StoryReport,
    StoryReaction,
    EngagementEvent,
    SavedSearch,
    SavedSearchMatch,
)
from .serializers import (
    BreedSerializer, PetSerializer, PetListSerializer, PetMapPointSerializer,
    BreedingRequestSerializer, FavoriteSerializer, VeterinaryClinicSerializer,
    NotificationSerializer, ChatRoomSerializer, ChatRoomListSerializer,
    NotificationPreferencesSerializer, NotificationInteractionEventCreateSerializer,
    ChatContextSerializer, ChatStatusSerializer, ChatCreationSerializer,
    AdoptionRequestSerializer, AdoptionRequestCreateSerializer, 
    AdoptionRequestListSerializer, AdoptionRequestResponseSerializer,
    StorySerializer, StoryCreateSerializer, StoryReportCreateSerializer,
    StoryReactionCreateSerializer, EngagementEventCreateSerializer,
    SavedSearchSerializer, SavedSearchPreviewSerializer,
)
from .notification_events import enqueue_notification_event
from .saved_searches import (
    get_saved_search_queryset,
    serialize_saved_search_results,
    serialize_service_card,
)
from accounts.models import UserNotificationSettings
from accounts.google_maps_service import GoogleMapsService, GoogleMapsServiceError
from clinics.models import StorefrontBooking, ClinicService
import logging
import time
import hashlib
from django.db import models
from django.db.models import F, Value, FloatField, ExpressionWrapper, Count, Avg, Min, Max, IntegerField, Func
from django.db.models.functions import Coalesce, Cast, Floor
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)


def _pet_likes_table_available():
    cache_key = 'pets:pet_likes_table_available'
    cached = cache.get(cache_key)
    if cached is not None:
        return bool(cached)

    try:
        available = PetLike._meta.db_table in connection.introspection.table_names()
    except DatabaseError:
        logger.warning("Unable to inspect pet likes table availability", exc_info=True)
        available = False

    cache.set(cache_key, available, 60)
    return available


def _with_pet_likes(queryset):
    if not _pet_likes_table_available():
        return queryset
    return queryset.annotate(likes_count=Count('liked_by', distinct=True))


def _liked_pet_ids_for_request(request):
    if not request.user.is_authenticated or not _pet_likes_table_available():
        return set()

    try:
        return set(
            PetLike.objects
            .filter(user=request.user)
            .values_list('pet_id', flat=True)
        )
    except DatabaseError:
        logger.warning(
            "Unable to load liked pet ids for user_id=%s",
            request.user.id,
            exc_info=True,
        )
        return set()

def reverse_geocode_address(lat: float, lng: float) -> str:
    fallback = f"{lat:.4f}, {lng:.4f}"
    try:
        result = GoogleMapsService().reverse_geocode(
            lat=lat,
            lng=lng,
            language="ar",
            source="pets_view",
        )
        full = (result.get("address") or "").strip()
        if full:
            parts = full.split(", ")
            return ", ".join(parts[:3]) if len(parts) > 3 else full
        return fallback
    except GoogleMapsServiceError:
        return fallback
    except Exception:
        return fallback


MAP_DEFAULT_POINT_LIMIT = 300
MAP_MAX_POINT_LIMIT = 1000
MAP_CLUSTER_ZOOM_THRESHOLD = 13
MAP_LOW_ZOOM_POINT_LIMIT = 200

CHAT_ROOM_DEFAULT_LIMIT = 20
CHAT_ROOM_MAX_LIMIT = 100

BREEDING_REQUEST_SELECT_RELATED_FIELDS = (
    'target_pet__breed',
    'target_pet__owner',
    'requester_pet__breed',
    'requester_pet__owner',
    'requester',
    'receiver',
    'veterinary_clinic',
)

ADOPTION_REQUEST_SELECT_RELATED_FIELDS = (
    'adopter',
    'pet__breed',
    'pet__owner',
)

CHAT_ROOM_SELECT_RELATED_FIELDS = (
    'breeding_request__requester',
    'breeding_request__target_pet__owner',
    'breeding_request__target_pet',
    'breeding_request__requester_pet',
    'breeding_request__requester_pet__owner',
    'adoption_request__adopter',
    'adoption_request__pet__owner',
    'adoption_request__pet',
    'clinic_patient__clinic',
    'clinic_patient__owner',
    'clinic_patient__linked_user',
)

REQUEST_STATUS_LABELS = {
    'pending': 'قيد المراجعة',
    'approved': 'تم القبول',
    'accepted': 'تم القبول',
    'rejected': 'تم الرفض',
    'completed': 'مكتمل',
    'cancelled': 'ملغي',
    'new': 'جديد',
    'confirmed': 'مؤكد',
}


def _absolute_url(request, value):
    if not value:
        return None
    try:
        url = value.url if hasattr(value, 'url') else str(value)
    except Exception:
        return None
    if request and url and not url.startswith('http'):
        return request.build_absolute_uri(url)
    return url


def _status_label(status_value):
    return REQUEST_STATUS_LABELS.get(status_value or '', status_value or 'جارٍ المتابعة')


def _request_card_priority(card):
    if card.get('requires_action'):
        return 0
    if card.get('kind') == 'chat_unread':
        return 1
    if card.get('status') == 'pending':
        return 2
    if card.get('kind') in {'provider_inquiry', 'provider_booking'} and card.get('status') in {'new', 'confirmed'}:
        return 3
    return 4


def _pet_image(request, pet):
    return _absolute_url(request, getattr(pet, 'main_image', None)) if pet else None


def _build_adoption_card(adoption_request, request, direction):
    pet = adoption_request.pet
    is_received = direction == 'received'
    status_value = adoption_request.status
    requires_action = is_received and status_value == 'pending'
    title = 'طلب تبني وارد' if is_received else 'طلب تبني مرسل'
    actor_name = (
        adoption_request.adopter.get_full_name()
        if is_received
        else getattr(getattr(pet, 'owner', None), 'get_full_name', lambda: '')()
    ) or adoption_request.adopter_email or 'مستخدم'
    subtitle = f"{pet.name if pet else 'حيوان'} • {actor_name}"
    return {
        'id': f'adoption_{direction}_{adoption_request.id}',
        'object_id': adoption_request.id,
        'kind': f'adoption_{direction}',
        'status': status_value,
        'status_label': _status_label(status_value),
        'title': title,
        'subtitle': subtitle,
        'primary_image': _pet_image(request, pet),
        'created_at': adoption_request.created_at,
        'updated_at': adoption_request.updated_at,
        'requires_action': requires_action,
        'action_label': 'راجع طلب التبني' if requires_action else 'عرض الطلب',
        'deep_link': f'petow://adoption-requests?adoption_request_id={adoption_request.id}',
        'metadata': {
            'adoption_request_id': adoption_request.id,
            'pet_id': pet.id if pet else None,
            'direction': direction,
        },
    }


def _build_breeding_card(breeding_request, request, direction):
    is_received = direction == 'received'
    status_value = breeding_request.status
    partner_pet = breeding_request.requester_pet if is_received else breeding_request.target_pet
    my_pet = breeding_request.target_pet if is_received else breeding_request.requester_pet
    requires_action = is_received and status_value == 'pending'
    title = 'طلب تزاوج وارد' if is_received else 'طلب تزاوج مرسل'
    subtitle = f"{partner_pet.name if partner_pet else 'حيوان'} مع {my_pet.name if my_pet else 'حيوانك'}"
    return {
        'id': f'breeding_{direction}_{breeding_request.id}',
        'object_id': breeding_request.id,
        'kind': f'breeding_{direction}',
        'status': status_value,
        'status_label': _status_label(status_value),
        'title': title,
        'subtitle': subtitle,
        'primary_image': _pet_image(request, partner_pet),
        'created_at': breeding_request.created_at,
        'updated_at': breeding_request.updated_at,
        'requires_action': requires_action,
        'action_label': 'راجع طلب التزاوج' if requires_action else 'عرض الطلب',
        'deep_link': f'petow://breeding-requests?breeding_request_id={breeding_request.id}',
        'metadata': {
            'breeding_request_id': breeding_request.id,
            'pet_id': partner_pet.id if partner_pet else None,
            'direction': direction,
        },
    }


def _build_chat_card(chat_room, unread_count, request):
    pet = None
    try:
        if chat_room.adoption_request:
            pet = chat_room.adoption_request.pet
        elif chat_room.breeding_request:
            if chat_room.breeding_request.requester_id == request.user.id:
                pet = chat_room.breeding_request.target_pet
            else:
                pet = chat_room.breeding_request.requester_pet
    except Exception:
        pet = None

    other = chat_room.get_other_participant(request.user)
    title = 'رسائل جديدة'
    subtitle = other.get_full_name() if other else None
    if not subtitle and getattr(chat_room, 'clinic_patient', None) and chat_room.clinic_patient.clinic:
        subtitle = chat_room.clinic_patient.clinic.name
    if pet:
        subtitle = f"{subtitle or 'محادثة'} • {pet.name}"
    return {
        'id': f'chat_{chat_room.id}',
        'object_id': chat_room.id,
        'kind': 'chat_unread',
        'status': 'unread',
        'status_label': f'{unread_count} غير مقروء',
        'title': title,
        'subtitle': subtitle or 'محادثة نشطة',
        'primary_image': _pet_image(request, pet),
        'created_at': chat_room.created_at,
        'updated_at': chat_room.updated_at,
        'requires_action': unread_count > 0,
        'action_label': 'فتح المحادثة',
        'deep_link': f'petow://clinic-chat?firebase_chat_id={chat_room.firebase_chat_id}',
        'metadata': {
            'chat_room_id': chat_room.id,
            'firebase_chat_id': chat_room.firebase_chat_id,
            'unread_count': unread_count,
        },
    }


def _build_storefront_booking_card(booking, request):
    is_inquiry = booking.request_type == 'inquiry'
    status_value = booking.status
    service_name = booking.service.name if booking.service else 'خدمة'
    clinic_name = booking.clinic.name if booking.clinic else 'عيادة'
    return {
        'id': f'storefront_booking_{booking.id}',
        'object_id': booking.id,
        'kind': 'provider_inquiry' if is_inquiry else 'provider_booking',
        'status': status_value,
        'status_label': _status_label(status_value),
        'title': 'استفسار خدمة' if is_inquiry else 'حجز خدمة',
        'subtitle': f'{service_name} • {clinic_name}',
        'primary_image': _absolute_url(request, getattr(booking.clinic, 'logo', None)),
        'created_at': booking.created_at,
        'updated_at': booking.created_at,
        'requires_action': status_value in {'new', 'confirmed'},
        'action_label': 'متابعة الاستفسار' if is_inquiry else 'متابعة الحجز',
        'deep_link': f'petow://clinic-booking?booking_public_id={booking.public_id}',
        'metadata': {
            'booking_id': booking.id,
            'public_id': str(booking.public_id),
            'clinic_id': booking.clinic_id,
            'service_id': booking.service_id,
            'service_category': booking.service.category if booking.service else None,
            'request_type': booking.request_type,
        },
    }


def _get_user_storefront_bookings(user):
    query = Q(customer_user=user)
    email = (getattr(user, 'email', '') or '').strip()
    phone = (getattr(user, 'phone', '') or '').strip()
    if email:
        query |= Q(customer_email__iexact=email)
    if phone:
        query |= Q(customer_phone__iexact=phone)
    return StorefrontBooking.objects.filter(query).select_related('clinic', 'service').order_by('-created_at')


def build_request_center_cards(request):
    user = request.user
    cards = []
    adoption_sent = AdoptionRequest.objects.filter(adopter=user).select_related(*ADOPTION_REQUEST_SELECT_RELATED_FIELDS)
    adoption_received = AdoptionRequest.objects.filter(pet__owner=user).select_related(*ADOPTION_REQUEST_SELECT_RELATED_FIELDS)
    breeding_sent = BreedingRequest.objects.filter(requester=user).select_related(*BREEDING_REQUEST_SELECT_RELATED_FIELDS)
    breeding_received = BreedingRequest.objects.filter(receiver=user).select_related(*BREEDING_REQUEST_SELECT_RELATED_FIELDS)

    cards.extend(_build_adoption_card(item, request, 'sent') for item in adoption_sent[:50])
    cards.extend(_build_adoption_card(item, request, 'received') for item in adoption_received[:50])
    cards.extend(_build_breeding_card(item, request, 'sent') for item in breeding_sent[:50])
    cards.extend(_build_breeding_card(item, request, 'received') for item in breeding_received[:50])

    unread_rows = (
        Notification.objects
        .filter(user=user, type='chat_message_received', is_read=False, related_chat_room__isnull=False)
        .values('related_chat_room')
        .annotate(total=Count('id'))
    )
    unread_by_room = {row['related_chat_room']: row['total'] for row in unread_rows}
    chat_ids = list(unread_by_room.keys())
    if chat_ids:
        chats = ChatRoom.objects.filter(id__in=chat_ids, is_active=True).select_related(*CHAT_ROOM_SELECT_RELATED_FIELDS)
        cards.extend(_build_chat_card(chat, unread_by_room.get(chat.id, 0), request) for chat in chats)

    cards.extend(_build_storefront_booking_card(item, request) for item in _get_user_storefront_bookings(user)[:30])
    cards.sort(key=lambda card: (_request_card_priority(card), -(card.get('updated_at') or card.get('created_at')).timestamp()))
    return cards


class RequestCenterView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cards = build_request_center_cards(request)
        kind = request.query_params.get('kind')
        if kind:
            cards = [card for card in cards if card.get('kind') == kind]
        requires_action = request.query_params.get('requires_action')
        if requires_action in {'1', 'true', 'yes'}:
            cards = [card for card in cards if card.get('requires_action')]
        return Response({'count': len(cards), 'results': cards})


class SavedSearchListCreateView(generics.ListCreateAPIView):
    serializer_class = SavedSearchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            SavedSearch.objects
            .filter(user=self.request.user)
            .annotate(matches_count=Count('matches'))
            .order_by('-updated_at')
        )


class SavedSearchDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SavedSearchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SavedSearch.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.alerts_enabled = False
        instance.save(update_fields=['is_active', 'alerts_enabled', 'updated_at'])


class SavedSearchPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        saved_search = get_object_or_404(SavedSearch, pk=pk, user=request.user)
        return Response(serialize_saved_search_results(saved_search, request=request, limit=10))


class UnsavedSearchPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SavedSearchPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        saved_search = SavedSearch(
            user=request.user,
            name='preview',
            target_type=payload['target_type'],
            filters=payload.get('filters') or {},
            city=payload.get('city') or '',
            latitude=payload.get('latitude'),
            longitude=payload.get('longitude'),
            radius_km=payload.get('radius_km') or 25,
        )
        return Response(serialize_saved_search_results(saved_search, request=request, limit=10))


def _digest_module(key, title, items, deep_link=None):
    return {
        'key': key,
        'title': title,
        'count': len(items),
        'items': items,
        'deep_link': deep_link,
    }


def _serialize_saved_search_match(match, request):
    search = match.saved_search
    target_type = match.target_type
    item = None
    title = search.name
    subtitle = 'نتيجة جديدة لبحث محفوظ'
    image = None
    deep_link = f'petow://saved-search?saved_search_id={search.id}'

    if target_type in {SavedSearch.TARGET_PET, SavedSearch.TARGET_ADOPTION, SavedSearch.TARGET_BREEDING, 'pet'}:
        pet = Pet.objects.select_related('breed', 'owner').filter(id=match.target_id).first()
        if pet:
            item = PetListSerializer(pet, context={'request': request}).data
            title = pet.name
            subtitle = search.name
            image = item.get('main_image')
            deep_link = f'petow://pet-details?pet_id={pet.id}&saved_search_id={search.id}'
    elif target_type == SavedSearch.TARGET_SERVICE:
        service = ClinicService.objects.select_related('clinic').filter(id=match.target_id).first()
        if service:
            item = serialize_service_card(service, request=request)
            title = service.name
            subtitle = f"{search.name} • {service.clinic.name}"
            image = item.get('service_image') or item.get('clinic', {}).get('logo')

    return {
        'id': match.id,
        'saved_search_id': search.id,
        'target_type': target_type,
        'target_id': match.target_id,
        'title': title,
        'subtitle': subtitle,
        'image': image,
        'matched_at': match.matched_at,
        'deep_link': deep_link,
        'item': item,
    }


class HomeDigestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        request_cards = build_request_center_cards(request)
        action_items = [card for card in request_cards if card.get('requires_action')][:5]
        unread_chat_items = [card for card in request_cards if card.get('kind') == 'chat_unread'][:5]

        saved_matches = (
            SavedSearchMatch.objects
            .filter(saved_search__user=request.user, saved_search__is_active=True)
            .select_related('saved_search')
            .order_by('-matched_at')[:8]
        )
        saved_match_items = [_serialize_saved_search_match(match, request) for match in saved_matches]

        pets_queryset = (
            Pet.objects
            .exclude(owner=request.user)
            .exclude(status__in=['unavailable', 'adopted'])
            .select_related('breed', 'owner')
            .order_by('-created_at')[:6]
        )
        pet_items = PetListSerializer(pets_queryset, many=True, context={'request': request}).data

        services_queryset = (
            ClinicService.objects
            .filter(is_active=True, clinic__is_active=True)
            .select_related('clinic')
            .order_by('-is_featured', 'display_order', 'base_price')[:6]
        )
        service_items = [serialize_service_card(service, request=request) for service in services_queryset]

        active_stories = (
            Story.objects
            .filter(is_hidden=False, deleted_at__isnull=True, expires_at__gt=timezone.now())
            .select_related('author', 'pet', 'pet__breed')
            .order_by('-created_at')[:6]
        )
        story_items = StorySerializer(active_stories, many=True, context={'request': request}).data

        modules = [
            _digest_module('pending_actions', 'يتطلب انتباهك', action_items, 'petow://request-center?filter=requires_action'),
            _digest_module('unread_chats', 'رسائل جديدة', unread_chat_items, 'petow://clinic-chat'),
            _digest_module('saved_search_matches', 'نتائج مناسبة لبحثك', saved_match_items, 'petow://saved-search'),
            _digest_module('recommended_pets', 'حيوانات قد تهمك', list(pet_items), 'petow://matches'),
            _digest_module('nearby_services', 'خدمات قريبة', service_items, 'petow://services'),
            _digest_module('active_stories', 'قصص نشطة', list(story_items), 'petow://stories'),
        ]

        return Response({
            'generated_at': timezone.now(),
            'request_center_summary': {
                'total': len(request_cards),
                'requires_action': len([card for card in request_cards if card.get('requires_action')]),
                'unread_chats': len(unread_chat_items),
            },
            'modules': [module for module in modules if module['items']],
        })


def _parse_bool_param(raw_value, default=True):
    if raw_value is None:
        return default
    normalized = str(raw_value).strip().lower()
    if normalized in {'1', 'true', 'yes', 'y', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'n', 'off'}:
        return False
    return default


def _parse_bbox_param(raw_bbox):
    if not raw_bbox:
        raise ValueError('bbox مطلوب بصيغة min_lng,min_lat,max_lng,max_lat')
    try:
        min_lng, min_lat, max_lng, max_lat = [float(part.strip()) for part in str(raw_bbox).split(',')]
    except (TypeError, ValueError):
        raise ValueError('صيغة bbox غير صحيحة')

    if min_lng >= max_lng or min_lat >= max_lat:
        raise ValueError('حدود bbox غير صحيحة')
    if min_lat < -90 or max_lat > 90 or min_lng < -180 or max_lng > 180:
        raise ValueError('bbox خارج نطاق الإحداثيات المسموح')

    return min_lng, min_lat, max_lng, max_lat


def _parse_zoom_param(raw_zoom):
    if raw_zoom in (None, ''):
        raise ValueError('zoom مطلوب')
    try:
        zoom = int(float(raw_zoom))
    except (TypeError, ValueError):
        raise ValueError('zoom يجب أن يكون رقمًا صحيحًا')
    if zoom < 0 or zoom > 25:
        raise ValueError('zoom خارج النطاق المتوقع')
    return zoom


def _parse_optional_float(raw_value, field_name):
    if raw_value in (None, ''):
        return None
    try:
        return float(raw_value)
    except (TypeError, ValueError):
        raise ValueError(f'{field_name} غير صالح')


def _parse_point_limit(raw_limit):
    if raw_limit in (None, ''):
        return MAP_DEFAULT_POINT_LIMIT
    try:
        parsed = int(raw_limit)
    except (TypeError, ValueError):
        raise ValueError('limit_points يجب أن يكون رقمًا صحيحًا')
    if parsed <= 0:
        raise ValueError('limit_points يجب أن يكون أكبر من 0')
    return min(parsed, MAP_MAX_POINT_LIMIT)


def _cap_limit_points_for_zoom(limit_points, zoom):
    if zoom <= 8:
        return min(limit_points, MAP_LOW_ZOOM_POINT_LIMIT)
    return limit_points


def _cell_size_meters_for_zoom(zoom):
    meters_per_pixel = 40075016.686 / (256 * (2 ** max(zoom, 1)))
    return max(meters_per_pixel * 64, 25.0)


def _parse_int_param(raw_value, default, minimum=None, maximum=None):
    if raw_value in (None, ''):
        return default
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        return default
    if minimum is not None and parsed < minimum:
        return minimum
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def _build_offset_pagination_links(request, offset, limit, total_count):
    query_params = request.query_params.copy()
    query_params['limit'] = limit

    next_url = None
    next_offset = offset + limit
    if next_offset < total_count:
        query_params['offset'] = next_offset
        next_url = request.build_absolute_uri(f"{request.path}?{query_params.urlencode()}")

    previous_url = None
    if offset > 0:
        query_params['offset'] = max(0, offset - limit)
        previous_url = request.build_absolute_uri(f"{request.path}?{query_params.urlencode()}")

    return next_url, previous_url


def _paginate_queryset(request, queryset, default_limit=CHAT_ROOM_DEFAULT_LIMIT, max_limit=CHAT_ROOM_MAX_LIMIT):
    limit = _parse_int_param(
        request.query_params.get('limit'),
        default=default_limit,
        minimum=1,
        maximum=max_limit,
    )
    offset = _parse_int_param(
        request.query_params.get('offset'),
        default=0,
        minimum=0,
    )
    total_count = queryset.count()
    page_queryset = queryset[offset:offset + limit]
    next_url, previous_url = _build_offset_pagination_links(request, offset, limit, total_count)
    return page_queryset, limit, offset, total_count, next_url, previous_url


def _build_map_cache_key(prefix, params):
    parts = [f"{key}={params.get(key, '')}" for key in sorted(params.keys())]
    digest = hashlib.md5("&".join(parts).encode('utf-8')).hexdigest()
    return f"{prefix}:{digest}"


class PetMapMarkersView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        started_at = time.perf_counter()
        try:
            min_lng, min_lat, max_lng, max_lat = _parse_bbox_param(request.query_params.get('bbox'))
            zoom = _parse_zoom_param(request.query_params.get('zoom'))
            cluster_enabled = _parse_bool_param(request.query_params.get('cluster'), default=True)
            limit_points = _cap_limit_points_for_zoom(
                _parse_point_limit(request.query_params.get('limit_points')),
                zoom,
            )

            user_lat = _parse_optional_float(request.query_params.get('user_lat'), 'user_lat')
            user_lng = _parse_optional_float(request.query_params.get('user_lng'), 'user_lng')
            if (user_lat is None) != (user_lng is None):
                raise ValueError('يجب تمرير user_lat و user_lng معًا')
            if user_lat is not None and (user_lat < -90 or user_lat > 90):
                raise ValueError('user_lat خارج النطاق المسموح')
            if user_lng is not None and (user_lng < -180 or user_lng > 180):
                raise ValueError('user_lng خارج النطاق المسموح')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        status_param = request.query_params.get('status')
        exclude_status_param = request.query_params.get('exclude_status')
        search_term = request.query_params.get('search')
        pet_type = request.query_params.get('pet_type')
        gender = request.query_params.get('gender')
        min_age_months = request.query_params.get('min_age_months')
        max_age_months = request.query_params.get('max_age_months')

        cache_key = _build_map_cache_key(
            'pets_map_markers',
            {
                'bbox': request.query_params.get('bbox'),
                'zoom': zoom,
                'cluster': cluster_enabled,
                'limit_points': limit_points,
                'user_lat': user_lat,
                'user_lng': user_lng,
                'status': status_param,
                'exclude_status': exclude_status_param,
                'search': search_term,
                'pet_type': pet_type,
                'gender': gender,
                'min_age_months': min_age_months,
                'max_age_months': max_age_months,
            },
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        effective_point_field = gis_models.PointField(geography=True, srid=4326)
        bbox = Polygon.from_bbox((min_lng, min_lat, max_lng, max_lat))
        bbox.srid = 4326

        queryset = (
            Pet.objects
            .select_related('breed', 'owner')
            .annotate(
                effective_point=Coalesce(
                    'location_point',
                    'owner__location_point',
                    output_field=effective_point_field,
                )
            )
            .annotate(
                effective_point_geom=Cast(
                    'effective_point',
                    output_field=gis_models.PointField(srid=4326),
                )
            )
            .exclude(effective_point__isnull=True)
            .filter(effective_point__intersects=bbox)
            .annotate(
                map_latitude=Cast(Func(F('effective_point_geom'), function='ST_Y'), FloatField()),
                map_longitude=Cast(Func(F('effective_point_geom'), function='ST_X'), FloatField()),
            )
        )

        if status_param:
            queryset = queryset.filter(status=status_param)
        else:
            queryset = queryset.filter(status='available')

        if exclude_status_param:
            excluded = [value.strip() for value in exclude_status_param.split(',') if value.strip()]
            if excluded:
                queryset = queryset.exclude(status__in=excluded)

        if pet_type:
            pet_types = [v.strip() for v in pet_type.split(',') if v.strip()]
            if pet_types:
                queryset = queryset.filter(pet_type__in=pet_types)
        if gender:
            genders = [v.strip() for v in gender.split(',') if v.strip()]
            if genders:
                queryset = queryset.filter(gender__in=genders)
        if search_term:
            queryset = queryset.filter(
                Q(name__icontains=search_term) |
                Q(breed__name__icontains=search_term) |
                Q(location__icontains=search_term) |
                Q(description__icontains=search_term)
            )

        try:
            if min_age_months not in (None, ''):
                queryset = queryset.filter(age_months__gte=int(min_age_months))
            if max_age_months not in (None, ''):
                queryset = queryset.filter(age_months__lte=int(max_age_months))
        except (TypeError, ValueError):
            return Response(
                {'error': 'min_age_months و max_age_months يجب أن يكونا أرقامًا صحيحة'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_point = Point(user_lng, user_lat, srid=4326) if user_lat is not None and user_lng is not None else None
        if user_point is not None:
            queryset = queryset.annotate(map_distance_m=Distance('effective_point', user_point))

        total_matched = queryset.count()
        clusters_payload = []
        points_queryset = queryset

        use_clusters = cluster_enabled and zoom < MAP_CLUSTER_ZOOM_THRESHOLD
        if use_clusters:
            cell_size_meters = _cell_size_meters_for_zoom(zoom)
            clustered_queryset = queryset.annotate(
                point_mercator=Transform('effective_point_geom', 3857),
            ).annotate(
                grid_x=Cast(
                    Floor(
                        ExpressionWrapper(
                            Func(F('point_mercator'), function='ST_X') / Value(cell_size_meters),
                            output_field=FloatField(),
                        )
                    ),
                    IntegerField(),
                ),
                grid_y=Cast(
                    Floor(
                        ExpressionWrapper(
                            Func(F('point_mercator'), function='ST_Y') / Value(cell_size_meters),
                            output_field=FloatField(),
                        )
                    ),
                    IntegerField(),
                ),
            )

            grouped = clustered_queryset.values('grid_x', 'grid_y').annotate(
                bucket_count=Count('id'),
                latitude=Avg('map_latitude'),
                longitude=Avg('map_longitude'),
                point_id=Min('id'),
            )

            cluster_rows = list(grouped.filter(bucket_count__gt=1).order_by('-bucket_count'))
            clusters_payload = [
                {
                    'id': f"pet-{zoom}-{row['grid_x']}-{row['grid_y']}",
                    'latitude': float(row['latitude']) if row['latitude'] is not None else None,
                    'longitude': float(row['longitude']) if row['longitude'] is not None else None,
                    'count': int(row['bucket_count']),
                    'entity_type': 'pet',
                }
                for row in cluster_rows
            ]

            singleton_groups = grouped.filter(bucket_count=1)
            singleton_total = singleton_groups.count()
            if user_point is not None:
                singleton_groups = singleton_groups.annotate(sort_distance=Min('map_distance_m')).order_by('sort_distance', '-point_id')
            else:
                singleton_groups = singleton_groups.order_by('-point_id')

            point_ids = [row['point_id'] for row in singleton_groups[:limit_points]]
            points_queryset = queryset.filter(id__in=point_ids)
            if user_point is not None:
                points_queryset = points_queryset.order_by('map_distance_m', '-created_at')
            else:
                points_queryset = points_queryset.order_by('-created_at')
            truncated = singleton_total > len(point_ids)
        else:
            if user_point is not None:
                points_queryset = queryset.order_by('map_distance_m', '-created_at')
            else:
                points_queryset = queryset.order_by('-created_at')
            points_queryset = points_queryset[:limit_points]
            truncated = total_matched > limit_points

        points = list(points_queryset)
        serializer = PetMapPointSerializer(points, many=True, context={'request': request})
        points_payload = list(serializer.data)

        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        logger.info(
            "pets_map_markers bbox=%s zoom=%s cluster=%s total=%s clusters=%s points=%s truncated=%s duration_ms=%s",
            request.query_params.get('bbox'),
            zoom,
            use_clusters,
            total_matched,
            len(clusters_payload),
            len(points_payload),
            truncated,
            duration_ms,
        )

        payload = {
            'clusters': clusters_payload,
            'points': points_payload,
            'meta': {
                'zoom': zoom,
                'bbox': {
                    'min_lng': min_lng,
                    'min_lat': min_lat,
                    'max_lng': max_lng,
                    'max_lat': max_lat,
                },
                'total_matched': total_matched,
                'returned_clusters': len(clusters_payload),
                'returned_points': len(points_payload),
                'truncated': bool(truncated),
            }
        }
        cache.set(cache_key, payload, timeout=max(1, int(getattr(settings, 'MAP_MARKERS_CACHE_TTL_SECONDS', 30))))
        return Response(payload)

class BreedListView(generics.ListAPIView):
    """قائمة السلالات"""
    queryset = Breed.objects.all()
    serializer_class = BreedSerializer
    permission_classes = []
    authentication_classes = []  # No authentication needed


def active_story_queryset():
    return (
        Story.objects
        .filter(is_hidden=False, deleted_at__isnull=True, expires_at__gt=timezone.now())
        .select_related('author', 'pet', 'pet__breed')
        .prefetch_related('reactions__user')
        .annotate(reaction_count=Count('reactions', distinct=True))
        .order_by('-created_at')
    )


def _story_reaction_payload(story, user):
    summary = {choice[0]: 0 for choice in StoryReaction.REACTION_CHOICES}
    rows = story.reactions.values('reaction').annotate(total=Count('id'))
    for row in rows:
        summary[row['reaction']] = row['total']
    my_reaction = (
        StoryReaction.objects
        .filter(story=story, user=user)
        .values_list('reaction', flat=True)
        .first()
    )
    return {
        'success': True,
        'story_id': story.id,
        'my_reaction': my_reaction,
        'reaction_count': sum(summary.values()),
        'reactions_summary': summary,
    }


def _record_engagement_event(user, event_type, source, target_type, pet=None, story=None, metadata=None):
    try:
        EngagementEvent.objects.create(
            user=user,
            event_type=event_type,
            source=source,
            target_type=target_type,
            pet=pet,
            story=story,
            metadata=metadata or {},
        )
    except Exception:
        logger.exception(
            "Failed to record engagement event user_id=%s event_type=%s target_type=%s",
            getattr(user, 'id', None),
            event_type,
            target_type,
        )


class StoryListCreateView(generics.ListCreateAPIView):
    """قائمة القصص النشطة وإنشاء قصة جديدة."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return active_story_queryset()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StoryCreateSerializer
        return StorySerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.user.is_authenticated and self.request.method == 'GET':
            queryset = self.get_queryset()
            context['viewed_story_ids'] = set(
                StoryView.objects
                .filter(user=self.request.user, story__in=queryset)
                .values_list('story_id', flat=True)
            )
            context['my_story_reactions'] = dict(
                StoryReaction.objects
                .filter(user=self.request.user, story__in=queryset)
                .values_list('story_id', 'reaction')
            )
        return context

    def create(self, request, *args, **kwargs):
        started_at = time.perf_counter()
        image_file = request.FILES.get('image')
        image_size = getattr(image_file, 'size', None)
        content_type = getattr(image_file, 'content_type', None)
        serializer = self.get_serializer(data=request.data)
        validation_started_at = time.perf_counter()
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            logger.info(
                "story_create_timing user_id=%s valid=false image_size=%s content_type=%s validation_ms=%.2f total_ms=%.2f",
                getattr(request.user, 'id', None),
                image_size,
                content_type,
                (time.perf_counter() - validation_started_at) * 1000,
                (time.perf_counter() - started_at) * 1000,
            )
            raise
        validation_ms = (time.perf_counter() - validation_started_at) * 1000
        save_started_at = time.perf_counter()
        story = serializer.save()
        save_ms = (time.perf_counter() - save_started_at) * 1000
        serialize_started_at = time.perf_counter()
        data = StorySerializer(story, context=self.get_serializer_context()).data
        serialize_ms = (time.perf_counter() - serialize_started_at) * 1000
        total_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "story_create_timing user_id=%s story_id=%s valid=true image_size=%s content_type=%s validation_ms=%.2f save_ms=%.2f serialize_ms=%.2f total_ms=%.2f",
            getattr(request.user, 'id', None),
            story.id,
            image_size,
            content_type,
            validation_ms,
            save_ms,
            serialize_ms,
            total_ms,
        )
        headers = self.get_success_headers(data)
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class MyStoriesView(generics.ListAPIView):
    """قصصي النشطة للمستخدم الحالي."""
    serializer_class = StorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return active_story_queryset().filter(author=self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['viewed_story_ids'] = set(self.get_queryset().values_list('id', flat=True))
        return context


class StoryDeleteView(generics.DestroyAPIView):
    """حذف قصة المستخدم حذفاً ناعماً."""
    serializer_class = StorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Story.objects.filter(author=self.request.user, deleted_at__isnull=True)

    def destroy(self, request, *args, **kwargs):
        story = self.get_object()
        story.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_story_viewed(request, story_id):
    try:
        story = active_story_queryset().get(pk=story_id)
    except Story.DoesNotExist:
        return Response({'error': 'القصة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    _, created = StoryView.objects.get_or_create(story=story, user=request.user)
    if created:
        _record_engagement_event(
            request.user,
            EngagementEvent.EVENT_STORY_VIEW,
            EngagementEvent.SOURCE_STORY_VIEWER,
            EngagementEvent.TARGET_STORY,
            story=story,
        )
    return Response({'success': True, 'has_viewed': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_story(request, story_id):
    try:
        story = active_story_queryset().get(pk=story_id)
    except Story.DoesNotExist:
        return Response({'error': 'القصة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    if story.author_id == request.user.id:
        return Response(
            {'error': 'لا يمكنك الإبلاغ عن قصتك'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = StoryReportCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    report, created = StoryReport.objects.update_or_create(
        story=story,
        reporter=request.user,
        defaults={
            'reason': serializer.validated_data['reason'],
            'details': serializer.validated_data.get('details', ''),
            'status': StoryReport.STATUS_OPEN,
            'reviewed_by': None,
            'reviewed_at': None,
        },
    )
    return Response(
        {
            'success': True,
            'report_id': report.id,
            'status': report.status,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def react_to_story(request, story_id):
    try:
        story = active_story_queryset().get(pk=story_id)
    except Story.DoesNotExist:
        return Response({'error': 'القصة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    if story.author_id == request.user.id:
        return Response(
            {'error': 'لا يمكنك التفاعل مع قصتك'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == 'DELETE':
        deleted, _ = StoryReaction.objects.filter(story=story, user=request.user).delete()
        if deleted:
            _record_engagement_event(
                request.user,
                EngagementEvent.EVENT_STORY_REACTION_REMOVED,
                EngagementEvent.SOURCE_STORY_VIEWER,
                EngagementEvent.TARGET_STORY,
                story=story,
            )
        return Response(_story_reaction_payload(story, request.user))

    serializer = StoryReactionCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    reaction, _ = StoryReaction.objects.update_or_create(
        story=story,
        user=request.user,
        defaults={'reaction': serializer.validated_data['reaction']},
    )
    _record_engagement_event(
        request.user,
        EngagementEvent.EVENT_STORY_REACTION,
        EngagementEvent.SOURCE_STORY_VIEWER,
        EngagementEvent.TARGET_STORY,
        story=story,
        metadata={'reaction': reaction.reaction},
    )
    return Response(_story_reaction_payload(story, request.user))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def story_reactions(request, story_id):
    try:
        story = Story.objects.get(pk=story_id, author=request.user, deleted_at__isnull=True)
    except Story.DoesNotExist:
        return Response({'error': 'القصة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    reactions = story.reactions.select_related('user').order_by('-updated_at')
    data = [
        {
            'id': reaction.id,
            'reaction': reaction.reaction,
            'created_at': reaction.created_at,
            'updated_at': reaction.updated_at,
            'user': {
                'id': reaction.user_id,
                'full_name': reaction.user.get_full_name() or reaction.user.email,
                'profile_picture': (
                    request.build_absolute_uri(reaction.user.profile_picture.url)
                    if getattr(reaction.user, 'profile_picture', None)
                    else None
                ),
                'is_verified': getattr(reaction.user, 'is_verified', False),
            },
        }
        for reaction in reactions
    ]
    return Response({'count': len(data), 'results': data})

class PetFilterSet(django_filters.FilterSet):
    """
    Pet list filtering with multi-value support.

    `pet_type` and `gender` accept either a single value (`?pet_type=dogs`)
    or a comma-separated list (`?pet_type=dogs,cats`) — both shapes resolve
    to a `__in` lookup so the existing single-value clients keep working.
    `status` and `breed` stay single-value to preserve the previous semantics.
    """

    pet_type = django_filters.BaseInFilter(field_name='pet_type', lookup_expr='in')
    gender = django_filters.BaseInFilter(field_name='gender', lookup_expr='in')
    hosting_preference = django_filters.CharFilter(field_name='hosting_preference')

    class Meta:
        model = Pet
        fields = ['pet_type', 'gender', 'hosting_preference', 'status', 'breed']


class PetListCreateView(generics.ListCreateAPIView):
    """قائمة الحيوانات وإنشاء حيوان جديد"""
    queryset = Pet.objects.all()
    serializer_class = PetListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    
    def get_permissions(self):
        """Allow read access without authentication, require auth for create"""
        if self.request.method == 'GET':
            return []
        return [IsAuthenticated()]
    
    def create(self, request, *args, **kwargs):
        """Override create to add detailed logging"""
        try:
            with transaction.atomic():
                response = super().create(request, *args, **kwargs)

                if response.status_code == status.HTTP_201_CREATED and response.data.get('id'):
                    pet_id = response.data.get('id')
                    enqueue_notification_event(
                        event_type=NotificationOutbox.EVENT_PET_CREATED,
                        object_id=pet_id,
                        dedupe_key=f"pet_created:{pet_id}",
                    )
        except Exception:
            logger.exception(
                "Pet create failed for user_id=%s",
                request.user.id if request.user.is_authenticated else None,
            )
            raise

        return response
    # نُحافظ على البحث والفلترة، ونُدير الترتيب يدوياً لدعم الأقرب أولاً افتراضياً
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = PetFilterSet
    search_fields = ['name', 'breed__name', 'location', 'description']
    ordering_fields = ['created_at', 'age_months', 'breeding_fee']
    # اترك ترتيب افتراضي فارغاً ليتم استخدام ترتيب النموذج أو ما نحدده يدوياً
    ordering = []
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PetSerializer
        return PetListSerializer
    
    def get_queryset(self):
        # Start with all pets
        queryset = _with_pet_likes(Pet.objects.select_related('breed', 'owner'))
        
        # Handle status filtering
        status_param = self.request.query_params.get('status')
        exclude_status_param = self.request.query_params.get('exclude_status')
        
        if status_param:
            # Filter to only include pets with specific status (caller is explicit)
            queryset = queryset.filter(status=status_param)
        else:
            # Always exclude unavailable pets from public listings
            excluded_statuses = {'unavailable'}
            
            # Unless a specific status is requested, also hide adoption-only statuses from breeding lists
            excluded_statuses.update({'available_for_adoption', 'adoption_pending', 'adopted'})
            
            if exclude_status_param:
                # Support comma separated values
                extra_excludes = {
                    value.strip() for value in exclude_status_param.split(',') if value.strip()
                }
                excluded_statuses.update(extra_excludes)
            
            queryset = queryset.exclude(status__in=excluded_statuses)
        
        # فلترة حسب المنطقة
        location = self.request.query_params.get('location', None)
        if location:
            queryset = queryset.filter(location__icontains=location)
        
        # فلترة حسب النطاق السعري
        min_price = self.request.query_params.get('min_price', None)
        max_price = self.request.query_params.get('max_price', None)
        if min_price:
            queryset = queryset.filter(
                Q(breeding_fee__gte=min_price) | Q(is_free=True)
            )
        if max_price:
            queryset = queryset.filter(
                Q(breeding_fee__lte=max_price) | Q(is_free=True)
            )

        # فلترة حسب العمر (بالشهور)
        min_age_months = self.request.query_params.get('min_age_months')
        max_age_months = self.request.query_params.get('max_age_months')
        try:
            if min_age_months is not None and str(min_age_months).strip() != '':
                queryset = queryset.filter(age_months__gte=int(min_age_months))
            if max_age_months is not None and str(max_age_months).strip() != '':
                queryset = queryset.filter(age_months__lte=int(max_age_months))
        except (TypeError, ValueError):
            # تجاهل قيم غير صحيحة بدون كسر الاستجابة
            pass
        
        # فلترة المفضلات فقط
        favorites_only = self.request.query_params.get('favorites_only', None)
        if favorites_only and self.request.user.is_authenticated:
            favorite_pets = Favorite.objects.filter(user=self.request.user).values_list('pet_id', flat=True)
            queryset = queryset.filter(id__in=favorite_pets)
        
        # مسافة الأقرب أولاً: إذا تم تمرير احداثيات المستخدم، رتب حسب الأقرب فقط عند الطلب
        try:
            user_lat = self.request.query_params.get('user_lat') or \
                       self.request.query_params.get('lat') or \
                       self.request.query_params.get('user_latitude') or \
                       self.request.query_params.get('latitude') or \
                       self.request.query_params.get('current_lat')
            user_lng = self.request.query_params.get('user_lng') or \
                       self.request.query_params.get('lng') or \
                       self.request.query_params.get('user_longitude') or \
                       self.request.query_params.get('longitude') or \
                       self.request.query_params.get('current_lng')

            if user_lat is not None and user_lng is not None:
                try:
                    ulat = float(user_lat)
                    ulng = float(user_lng)
                    # استخدم إحداثيات الحيوان، أو إحداثيات المالك كبديل، أو قيمة بعيدة جداً لدفع العناصر بدون إحداثيات للنهاية
                    lat_expr = Cast(Coalesce(F('latitude'), F('owner__latitude'), Value(9999.0)), FloatField())
                    lng_expr = Cast(Coalesce(F('longitude'), F('owner__longitude'), Value(9999.0)), FloatField())

                    dlat = lat_expr - Value(ulat, output_field=FloatField())
                    dlng = lng_expr - Value(ulng, output_field=FloatField())
                    distance_sq = ExpressionWrapper(dlat * dlat + dlng * dlng, output_field=FloatField())

                    queryset = queryset.annotate(_distance_sq=distance_sq)
                    
                    # جديد: التحقق من معامل ordering لتحديد طريقة الترتيب
                    ordering_param = self.request.query_params.get('ordering', '')
                    
                    # تطبيق الترتيب بناءً على المعامل
                    if ordering_param == 'distance':
                        # ترتيب حسب المسافة
                        queryset = queryset.order_by('_distance_sq', '-created_at')
                    else:
                        # ترتيب افتراضي حسب تاريخ الإنشاء
                        queryset = queryset.order_by('-created_at')
                except (ValueError, TypeError):
                    # في حال عدم صحة الإحداثيات، استخدم الترتيب الافتراضي
                    queryset = queryset.order_by('-created_at')
            else:
                # لا توجد إحداثيات، استخدم الترتيب الافتراضي
                queryset = queryset.order_by('-created_at')
        except Exception:
            # لا تُفشل القائمة لأية أخطاء غير متوقعة في الحساب
            queryset = queryset.order_by('-created_at')

        return queryset
    
    def get_serializer_context(self):
        """تمرير context إضافي للسيريلايزر"""
        context = super().get_serializer_context()
        context['liked_pet_ids'] = _liked_pet_ids_for_request(self.request)
        
        # إضافة إحداثيات المستخدم من query parameters
        user_lat = self.request.query_params.get('user_lat')
        user_lng = self.request.query_params.get('user_lng')
        
        # محاولة الحصول من معاملات أخرى إذا لم تكن موجودة
        if not user_lat:
            user_lat = self.request.query_params.get('lat') or self.request.query_params.get('user_latitude') or self.request.query_params.get('latitude') or self.request.query_params.get('current_lat')
        
        if not user_lng:
            user_lng = self.request.query_params.get('lng') or self.request.query_params.get('user_longitude') or self.request.query_params.get('longitude') or self.request.query_params.get('current_lng')
        
        if user_lat and user_lng:
            context['user_lat'] = user_lat
            context['user_lng'] = user_lng
        
        return context

class PetDetailView(generics.RetrieveUpdateDestroyAPIView):
    """تفاصيل الحيوان"""
    queryset = (
        Pet.objects
        .select_related('breed', 'owner')
        .prefetch_related('additional_images')
    )
    serializer_class = PetSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    
    def get_permissions(self):
        """Allow read access without authentication, require auth for create"""
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAuthenticated()]
        return []
    
    def update(self, request, *args, **kwargs):
        """Override update to add detailed error logging"""
        try:
            return super().update(request, *args, **kwargs)
        except Exception:
            logger.exception(
                "Pet update failed for user_id=%s pet_id=%s",
                request.user.id if request.user.is_authenticated else None,
                kwargs.get('pk'),
            )
            raise
    
    def get_queryset(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            # المالك فقط يمكنه التعديل أو الحذف
            return (
                _with_pet_likes(
                    Pet.objects
                    .filter(owner=self.request.user)
                    .select_related('breed', 'owner')
                )
            )
        return _with_pet_likes(Pet.objects.select_related('breed', 'owner'))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['liked_pet_ids'] = _liked_pet_ids_for_request(self.request)
        return context

class MyPetsView(generics.ListAPIView):
    """حيواناتي الأليفة"""
    serializer_class = PetListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return _with_pet_likes(
            Pet.objects
            .filter(owner=self.request.user)
            .select_related('breed')
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['liked_pet_ids'] = _liked_pet_ids_for_request(self.request)
        return context

class FavoriteListCreateView(generics.ListCreateAPIView):
    """قائمة المفضلات وإضافة للمفضلات"""
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user).select_related('pet__breed', 'pet__owner')

class FavoriteDetailView(generics.DestroyAPIView):
    """حذف من المفضلات"""
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_favorite(request, pet_id):
    """إضافة أو حذف من المفضلات"""
    try:
        pet = Pet.objects.get(pk=pet_id)
    except Pet.DoesNotExist:
        return Response(
            {'error': 'الحيوان غير موجود'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    favorite, created = Favorite.objects.get_or_create(
        user=request.user, pet=pet
    )
    
    if not created:
        favorite.delete()
        _record_engagement_event(
            request.user,
            EngagementEvent.EVENT_UNFAVORITE,
            EngagementEvent.SOURCE_OTHER,
            EngagementEvent.TARGET_PET,
            pet=pet,
        )
        return Response({'favorited': False, 'is_favorite': False})
    
    _record_engagement_event(
        request.user,
        EngagementEvent.EVENT_FAVORITE,
        EngagementEvent.SOURCE_OTHER,
        EngagementEvent.TARGET_PET,
        pet=pet,
    )
    return Response({'favorited': True, 'is_favorite': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_pet_like(request, pet_id):
    """إعجاب خفيف بالحيوان، منفصل عن المفضلة."""
    try:
        pet = Pet.objects.get(pk=pet_id)
    except Pet.DoesNotExist:
        return Response(
            {'error': 'الحيوان غير موجود'},
            status=status.HTTP_404_NOT_FOUND,
        )

    source = request.data.get('source') if hasattr(request, 'data') else None
    valid_sources = {choice[0] for choice in EngagementEvent.SOURCE_CHOICES}
    if source not in valid_sources:
        source = EngagementEvent.SOURCE_PET_CARD

    like, created = PetLike.objects.get_or_create(user=request.user, pet=pet)
    if created:
        _record_engagement_event(
            request.user,
            EngagementEvent.EVENT_PET_LIKE,
            source,
            EngagementEvent.TARGET_PET,
            pet=pet,
        )
        is_liked = True
    else:
        like.delete()
        _record_engagement_event(
            request.user,
            EngagementEvent.EVENT_PET_UNLIKE,
            source,
            EngagementEvent.TARGET_PET,
            pet=pet,
        )
        is_liked = False

    return Response({
        'success': True,
        'pet_id': pet.id,
        'is_liked': is_liked,
        'likes_count': PetLike.objects.filter(pet=pet).count(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_engagement_event(request):
    serializer = EngagementEventCreateSerializer(
        data=request.data,
        context={'request': request},
    )
    serializer.is_valid(raise_exception=True)
    event = serializer.save()
    return Response(
        {
            'success': True,
            'id': event.id,
            'event_type': event.event_type,
            'target_type': event.target_type,
        },
        status=status.HTTP_201_CREATED,
    )

@api_view(['GET'])
@permission_classes([])
def pet_stats(request):
    """إحصائيات الحيوانات"""
    stats = {
        'total_pets': Pet.objects.count(),
        'available_pets': Pet.objects.filter(status='available').count(),
        'breeding_requests': BreedingRequest.objects.count(),
        'successful_matings': BreedingRequest.objects.filter(status='completed').count(),
        'by_type': {}
    }
    
    # إحصائيات حسب النوع
    for choice in Pet.PET_TYPE_CHOICES:
        pet_type = choice[0]
        count = Pet.objects.filter(pet_type=pet_type).count()
        stats['by_type'][pet_type] = count
    
    return Response(stats)

# العيادات البيطرية
class VeterinaryClinicListView(generics.ListAPIView):
    """قائمة العيادات البيطرية المتاحة"""
    queryset = VeterinaryClinic.objects.filter(is_active=True)
    serializer_class = VeterinaryClinicSerializer
    permission_classes = []
    authentication_classes = []

# طلبات المقابلة
class BreedingRequestListCreateView(generics.ListCreateAPIView):
    """قائمة طلبات المقابلة وإنشاء طلب جديد"""
    serializer_class = BreedingRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """إرجاع طلبات المقابلة الخاصة بالمستخدم"""
        user = self.request.user
        # طلبات مرسلة أو واردة للمستخدم
        return BreedingRequest.objects.filter(
            Q(requester=user) | Q(receiver=user)
        ).select_related(
            *BREEDING_REQUEST_SELECT_RELATED_FIELDS
        ).order_by('-created_at')
    
    def create(self, request, *args, **kwargs):
        """إنشاء طلب مقابلة جديد مع إرسال إشعار"""
        with transaction.atomic():
            response = super().create(request, *args, **kwargs)

            if response.status_code == status.HTTP_201_CREATED and response.data.get('id'):
                breeding_request_id = response.data['id']
                enqueue_notification_event(
                    event_type=NotificationOutbox.EVENT_BREEDING_REQUEST_RECEIVED,
                    object_id=breeding_request_id,
                    dedupe_key=f"breeding_request_received:{breeding_request_id}",
                )

        return response

class BreedingRequestDetailView(generics.RetrieveUpdateAPIView):
    """تفاصيل طلب المقابلة وتحديثه"""
    serializer_class = BreedingRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """المستخدم يمكنه رؤية طلباته المرسلة والواردة فقط"""
        user = self.request.user
        return BreedingRequest.objects.filter(
            Q(requester=user) | Q(receiver=user)
        ).select_related(
            *BREEDING_REQUEST_SELECT_RELATED_FIELDS
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_breeding_requests(request):
    """طلبات المقابلة المرسلة من المستخدم"""
    user = request.user
    sent_requests = BreedingRequest.objects.filter(
        requester=user
    ).select_related(
        *BREEDING_REQUEST_SELECT_RELATED_FIELDS
    ).order_by('-created_at')
    serializer = BreedingRequestSerializer(sent_requests, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def received_breeding_requests(request):
    """طلبات المقابلة الواردة للمستخدم"""
    user = request.user
    received_requests = BreedingRequest.objects.filter(
        receiver=user
    ).select_related(
        *BREEDING_REQUEST_SELECT_RELATED_FIELDS
    ).order_by('-created_at')
    serializer = BreedingRequestSerializer(received_requests, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_to_breeding_request(request, request_id):
    """الرد على طلب مقابلة (قبول/رفض)"""
    try:
        breeding_request = BreedingRequest.objects.get(
            id=request_id,
            receiver=request.user
        )
    except BreedingRequest.DoesNotExist:
        return Response(
            {'error': 'طلب المقابلة غير موجود أو ليس لديك صلاحية للرد عليه'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    response_type = request.data.get('response')  # 'approve' or 'reject'
    response_message = request.data.get('message', '')
    
    with transaction.atomic():
        if response_type == 'approve':
            breeding_request.status = 'approved'
            event_type = NotificationOutbox.EVENT_BREEDING_REQUEST_APPROVED
            event_dedupe_key = f"breeding_request_approved:{breeding_request.id}"
        elif response_type == 'reject':
            breeding_request.status = 'rejected'
            event_type = NotificationOutbox.EVENT_BREEDING_REQUEST_REJECTED
            event_dedupe_key = f"breeding_request_rejected:{breeding_request.id}"
        else:
            return Response(
                {'error': 'نوع الرد غير صحيح. يجب أن يكون approve أو reject'},
                status=status.HTTP_400_BAD_REQUEST
            )

        breeding_request.response_message = response_message
        breeding_request.save()

        enqueue_notification_event(
            event_type=event_type,
            object_id=breeding_request.id,
            dedupe_key=event_dedupe_key,
        )
    
    serializer = BreedingRequestSerializer(breeding_request)
    return Response(serializer.data)

# الإشعارات
class NotificationListView(generics.ListAPIView):
    """قائمة إشعارات المستخدم"""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).select_related(
            'related_pet', 'related_breeding_request', 'related_chat_room'
        )


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def notification_preferences(request):
    """Granular notification preferences with legacy compatibility."""
    settings_obj, _ = UserNotificationSettings.objects.get_or_create(user=request.user)
    settings_obj.sync_from_legacy_user_fields()

    if request.method == 'GET':
        serializer = NotificationPreferencesSerializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = NotificationPreferencesSerializer(settings_obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_notification_interaction_event(request):
    """Track notification engagement events from clients."""
    serializer = NotificationInteractionEventCreateSerializer(
        data=request.data,
        context={'request': request},
    )
    serializer.is_valid(raise_exception=True)
    event = serializer.save()
    return Response(
        {
            'id': event.id,
            'event_type': event.event_type,
            'source': event.source,
            'created_at': event.created_at,
        },
        status=status.HTTP_201_CREATED,
    )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_notification_as_read(request, notification_id):
    """تعيين إشعار كمقروء"""
    try:
        notification = Notification.objects.get(
            id=notification_id, 
            user=request.user
        )
        notification.mark_as_read()
        return Response({'message': 'تم تعيين الإشعار كمقروء'}, status=status.HTTP_200_OK)
    except Notification.DoesNotExist:
        return Response(
            {'error': 'الإشعار غير موجود'}, 
            status=status.HTTP_404_NOT_FOUND
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_notifications_as_read(request):
    """تعيين جميع الإشعارات كمقروءة"""
    from django.utils import timezone
    
    updated_count = Notification.objects.filter(
        user=request.user, 
        is_read=False
    ).update(is_read=True, read_at=timezone.now())
    
    return Response({
        'message': f'تم تعيين {updated_count} إشعار كمقروء'
    }, status=status.HTTP_200_OK)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_unread_notifications_count(request):
    """عدد الإشعارات غير المقروءة"""
    count = Notification.objects.filter(
        user=request.user, 
        is_read=False
    ).count()
    
    return Response({'unread_count': count}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_chat_notifications_as_read(request):
    """تعيين إشعارات المحادثة كمقروءة للمستخدم الحالي"""
    chat_id = request.data.get('chat_id') or request.data.get('firebase_chat_id')
    if not chat_id:
        return Response(
            {'error': 'معرف المحادثة مطلوب'},
            status=status.HTTP_400_BAD_REQUEST
        )

    chat_room = None
    try:
        chat_room = ChatRoom.objects.get(firebase_chat_id=str(chat_id))
    except ChatRoom.DoesNotExist:
        if str(chat_id).isdigit():
            chat_room = ChatRoom.objects.filter(id=int(chat_id)).first()

    if not chat_room:
        return Response(
            {'error': 'المحادثة غير موجودة'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not chat_room.can_user_access(request.user):
        return Response(
            {'error': 'غير مصرح لك بالوصول إلى هذه المحادثة'},
            status=status.HTTP_403_FORBIDDEN
        )

    from django.utils import timezone

    updated_count = Notification.objects.filter(
        user=request.user,
        is_read=False,
        type='chat_message_received',
        related_chat_room=chat_room
    ).update(is_read=True, read_at=timezone.now())

    return Response({
        'message': f'تم تعيين {updated_count} إشعار كمقروء',
        'updated_count': updated_count
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_chat_message_notification(request):
    """إرسال إشعار عند وصول رسالة جديدة"""
    try:
        chat_id = request.data.get('chat_id')
        message_content = (request.data.get('message') or '').strip()
        message_id = (
            request.data.get('message_id')
            or request.data.get('firebase_message_id')
            or request.data.get('client_message_id')
        )
        event_nonce = request.data.get('event_nonce') or str(int(time.time() * 1000))
        
        if not chat_id:
            return Response(
                {'error': 'معرف المحادثة مطلوب'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # البحث عن المحادثة
        try:
            chat_room = ChatRoom.objects.select_related(
                *CHAT_ROOM_SELECT_RELATED_FIELDS
            ).get(firebase_chat_id=str(chat_id))
        except ChatRoom.DoesNotExist:
            if str(chat_id).isdigit():
                chat_room = ChatRoom.objects.select_related(
                    *CHAT_ROOM_SELECT_RELATED_FIELDS
                ).filter(id=int(chat_id)).first()
            else:
                chat_room = None
            if not chat_room:
                return Response(
                    {'error': 'المحادثة غير موجودة'}, 
                    status=status.HTTP_404_NOT_FOUND
                )

        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مصرح لك بالوصول إلى هذه المحادثة'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # تحديد المرسل والمستقبل
        participants = chat_room.get_participants()
        if len(participants) < 2:
            return Response(
                {'error': 'المحادثة غير صالحة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # إنشاء حدث outbox لإرسال الإشعار خارج request path
        sender = request.user
        created_events = 0
        for participant in participants:
            if participant.id != sender.id:
                dedupe_key = (
                    f"chat_message_received:{chat_room.id}:{sender.id}:{participant.id}:"
                    f"{message_id or event_nonce}"
                )
                enqueue_notification_event(
                    event_type=NotificationOutbox.EVENT_CHAT_MESSAGE_RECEIVED,
                    object_id=chat_room.id,
                    dedupe_key=dedupe_key,
                    payload={
                        'sender_id': sender.id,
                        'recipient_id': participant.id,
                        'message_content': message_content,
                        'message_id': message_id,
                        'event_nonce': event_nonce,
                        'event_key': dedupe_key,
                    },
                )
                created_events += 1

        if created_events == 0:
            return Response(
                {'error': 'لم يتم العثور على مستقبل صالح للإشعار'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return Response(
            {'message': 'تمت جدولة الإشعار بنجاح'}, 
            status=status.HTTP_201_CREATED
        )
        
    except Exception as exc:
        logger.exception("Error scheduling chat message notification")
        return Response(
            {'error': f'خطأ في إرسال الإشعار: {str(exc)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_rooms(request):
    """قائمة المحادثات للمستخدم الحالي"""
    try:
        # الحصول على جميع المحادثات النشطة للمستخدم
        user_chat_rooms = ChatRoom.objects.filter(
            Q(breeding_request__requester_id=request.user.id) |
            Q(breeding_request__target_pet__owner_id=request.user.id) |
            Q(adoption_request__adopter_id=request.user.id) |
            Q(adoption_request__pet__owner_id=request.user.id) |
            Q(clinic_patient__linked_user_id=request.user.id),
            is_active=True
        ).select_related(
            *CHAT_ROOM_SELECT_RELATED_FIELDS
        ).order_by('-updated_at')

        paged_rooms, limit, offset, total_count, next_url, previous_url = _paginate_queryset(
            request,
            user_chat_rooms,
        )
        serializer = ChatRoomListSerializer(
            paged_rooms,
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'results': serializer.data,
            'count': total_count,
            'next': next_url,
            'previous': previous_url,
            'limit': limit,
            'offset': offset,
        })
        
    except Exception as e:
        logger.error(f"Error fetching chat rooms: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل المحادثات'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_room_detail(request, chat_id):
    """تفاصيل محادثة محددة"""
    try:
        chat_room = ChatRoom.objects.select_related(
            *CHAT_ROOM_SELECT_RELATED_FIELDS
        ).get(
            id=chat_id,
            is_active=True
        )
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بالوصول لهذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = ChatRoomSerializer(chat_room, context={'request': request})
        return Response(serializer.data)
        
    except ChatRoom.DoesNotExist:
        return Response(
            {'error': 'المحادثة غير موجودة'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error fetching chat room {chat_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_room_by_firebase_id(request, firebase_chat_id):
    """الحصول على غرفة محادثة بواسطة معرف Firebase"""
    try:
        chat_room = ChatRoom.objects.select_related(
            *CHAT_ROOM_SELECT_RELATED_FIELDS
        ).get(
            firebase_chat_id=firebase_chat_id
        )
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مخول لك بالوصول لهذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = ChatRoomSerializer(chat_room, context={'request': request})
        return Response(serializer.data)
        
    except ChatRoom.DoesNotExist:
        return Response(
            {'error': 'المحادثة غير موجودة'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error fetching chat room by Firebase ID {firebase_chat_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_room_by_breeding_request(request, breeding_request_id):
    """الحصول على غرفة محادثة بواسطة معرف طلب التزاوج"""
    try:
        # التحقق من أن المستخدم مشارك في طلب التزاوج
        breeding_request = BreedingRequest.objects.select_related(
            'requester',
            'target_pet__owner',
            'target_pet',
            'requester_pet__owner',
            'requester_pet',
        ).get(id=breeding_request_id)
        if request.user not in [breeding_request.requester, breeding_request.target_pet.owner]:
            return Response(
                {'error': 'غير مخول لك بالوصول لهذا الطلب'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # البحث عن غرفة المحادثة
        try:
            chat_room = ChatRoom.objects.select_related(
                'breeding_request__requester',
                'breeding_request__target_pet__owner',
                'breeding_request__target_pet',
                'breeding_request__requester_pet',
                'breeding_request__requester_pet__owner',
            ).get(breeding_request=breeding_request)
            serializer = ChatRoomSerializer(chat_room, context={'request': request})
            return Response(serializer.data)
        except ChatRoom.DoesNotExist:
            return Response(
                {'error': 'لا توجد محادثة لهذا الطلب'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
    except BreedingRequest.DoesNotExist:
        return Response(
            {'error': 'طلب التزاوج غير موجود'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error fetching chat room by breeding request {breeding_request_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_room_by_adoption_request(request, adoption_request_id):
    """الحصول على غرفة محادثة بواسطة معرف طلب التبني"""
    from .models import AdoptionRequest  # local import to avoid circular dependency at top
    try:
        adoption_request = AdoptionRequest.objects.select_related(
            'adopter',
            'pet__owner',
            'pet',
        ).get(id=adoption_request_id)
        participants = [adoption_request.adopter, getattr(adoption_request.pet, 'owner', None)]
        if request.user not in participants:
            return Response(
                {'error': 'غير مخول لك بالوصول لهذا الطلب'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            chat_room = ChatRoom.objects.select_related(
                'adoption_request__adopter',
                'adoption_request__pet__owner',
                'adoption_request__pet',
            ).get(adoption_request=adoption_request)
            serializer = ChatRoomSerializer(chat_room, context={'request': request})
            return Response(serializer.data)
        except ChatRoom.DoesNotExist:
            return Response(
                {'error': 'لا توجد محادثة لهذا الطلب'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    except AdoptionRequest.DoesNotExist:
        return Response(
            {'error': 'طلب التبني غير موجود'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error fetching chat room by adoption request {adoption_request_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_chat_room(request):
    """إنشاء غرفة محادثة جديدة لطلب تزاوج مقبول"""
    try:
        # استخدام السيريلايزر للتحقق من البيانات
        creation_serializer = ChatCreationSerializer(data=request.data, context={'request': request})
        if not creation_serializer.is_valid():
            return Response(
                creation_serializer.errors, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        breeding_request = creation_serializer.validated_data.get('breeding_request')
        adoption_request = creation_serializer.validated_data.get('adoption_request')
        existing_chat_room = creation_serializer.validated_data.get('existing_chat_room')

        if existing_chat_room:
            context_serializer = ChatContextSerializer(existing_chat_room, context={'request': request})
            return Response({
                'chat_room': ChatRoomSerializer(existing_chat_room, context={'request': request}).data,
                'context': context_serializer.data['chat_context'],
                'message': 'المحادثة موجودة بالفعل'
            }, status=status.HTTP_200_OK)
        
        if breeding_request:
            chat_room = ChatRoom.objects.create(breeding_request=breeding_request)
        elif adoption_request:
            chat_room = ChatRoom.objects.create(adoption_request=adoption_request)
        else:
            return Response(
                {'error': 'بيانات الطلب غير صالحة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # إرجاع بيانات المحادثة مع السياق الكامل
        context_serializer = ChatContextSerializer(chat_room, context={'request': request})
        
        return Response({
            'chat_room': ChatRoomSerializer(chat_room, context={'request': request}).data,
            'context': context_serializer.data['chat_context'],
            'message': 'تم إنشاء المحادثة بنجاح'
        }, status=status.HTTP_201_CREATED)
        
    except Exception as exc:
        logger.exception("Error creating chat room")
        return Response(
            {'error': 'خطأ في إنشاء المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def archive_chat_room(request, chat_id):
    """أرشفة غرفة محادثة (إنهاء المحادثة)"""
    try:
        chat_room = ChatRoom.objects.get(id=chat_id)
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بأرشفة هذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # أرشفة المحادثة
        chat_room.archive()
        
        return Response({'message': 'تم أرشفة المحادثة بنجاح'})
        
    except ChatRoom.DoesNotExist:
        return Response(
            {'error': 'المحادثة غير موجودة'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error archiving chat room {chat_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في أرشفة المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_room_status(request, chat_id):
    """الحصول على حالة غرفة محادثة محددة"""
    try:
        chat_room = ChatRoom.objects.select_related(
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'clinic_patient__linked_user',
        ).get(id=chat_id)
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بالوصول لهذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        participants = chat_room.get_participants()
        request_kind = None
        request_status = None
        viewer_role = None

        if chat_room.breeding_request:
            request_kind = 'breeding'
            request_status = chat_room.breeding_request.status
            if chat_room.breeding_request.requester_id == request.user.id:
                viewer_role = 'requester'
            else:
                viewer_role = 'owner'
        elif chat_room.adoption_request:
            request_kind = 'adoption'
            request_status = chat_room.adoption_request.status
            if chat_room.adoption_request.adopter_id == request.user.id:
                viewer_role = 'requester'
            else:
                viewer_role = 'owner'
        elif chat_room.clinic_patient:
            request_kind = 'clinic'
            request_status = 'active' if chat_room.is_active else 'archived'
            if getattr(chat_room, 'clinic_staff_id', None) == request.user.id:
                viewer_role = 'clinic_staff'
            else:
                viewer_role = 'patient'

        if not chat_room.is_active:
            chat_status = 'rejected'
        elif request_kind == 'clinic':
            chat_status = 'approved'
        elif request_status == 'pending':
            chat_status = 'pending'
        elif request_status == 'rejected':
            chat_status = 'rejected'
        elif request_kind == 'adoption' and viewer_role == 'requester' and not getattr(request.user, 'is_verified', False):
            chat_status = 'approved_pending_kyc'
        else:
            chat_status = 'approved'

        return Response({
            'id': chat_room.id,
            'firebase_chat_id': chat_room.firebase_chat_id,
            'is_active': chat_room.is_active,
            'created_at': chat_room.created_at,
            'updated_at': chat_room.updated_at,
            'request_kind': request_kind,
            'request_status': request_status,
            'chat_status': chat_status,
            'viewer_role': viewer_role,
            'breeding_request_status': request_status,
            'participants_count': len(participants)
        })
        
    except ChatRoom.DoesNotExist:
        return Response(
            {'error': 'المحادثة غير موجودة'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error fetching chat room status {chat_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل حالة المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_chat_status(request):
    """إحصائيات المحادثات للمستخدم الحالي"""
    try:
        user = request.user
        
        # المحادثات النشطة
        active_chats = ChatRoom.objects.filter(
            Q(breeding_request__requester_id=user.id) |
            Q(breeding_request__target_pet__owner_id=user.id) |
            Q(adoption_request__adopter_id=user.id) |
            Q(adoption_request__pet__owner_id=user.id) |
            Q(clinic_patient__linked_user_id=user.id),
            is_active=True
        ).count()
        
        # المحادثات المؤرشفة
        archived_chats = ChatRoom.objects.filter(
            Q(breeding_request__requester_id=user.id) |
            Q(breeding_request__target_pet__owner_id=user.id) |
            Q(adoption_request__adopter_id=user.id) |
            Q(adoption_request__pet__owner_id=user.id) |
            Q(clinic_patient__linked_user_id=user.id),
            is_active=False
        ).count()
        
        # إجمالي المحادثات
        total_chats = active_chats + archived_chats
        
        # عدد الرسائل غير المقروءة (من إشعارات الرسائل)
        unread_chat_messages = Notification.objects.filter(
            user=user,
            is_read=False,
            type='chat_message_received'
        ).count()
        
        # طلبات التزاوج المقبولة بدون محادثة
        pending_chat_creation = BreedingRequest.objects.filter(
            Q(requester_id=user.id) | Q(target_pet__owner_id=user.id),
            status='approved'
        ).exclude(
            id__in=ChatRoom.objects.values_list('breeding_request_id', flat=True)
        ).count()
        
        return Response({
            'active_chats': active_chats,
            'archived_chats': archived_chats,
            'total_chats': total_chats,
            'pending_chat_creation': pending_chat_creation,
            'user_id': user.id,
            'user_name': f"{user.first_name} {user.last_name}",
            'unread_messages_count': unread_chat_messages,
            'has_unread_messages': unread_chat_messages > 0,
        })
        
    except Exception as e:
        logger.error(f"Error fetching user chat status: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل إحصائيات المحادثات'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def archived_chat_rooms(request):
    """قائمة المحادثات المؤرشفة للمستخدم الحالي"""
    try:
        # الحصول على جميع المحادثات المؤرشفة للمستخدم
        user_archived_chats = ChatRoom.objects.filter(
            Q(breeding_request__requester_id=request.user.id) |
            Q(breeding_request__target_pet__owner_id=request.user.id) |
            Q(adoption_request__adopter_id=request.user.id) |
            Q(adoption_request__pet__owner_id=request.user.id) |
            Q(clinic_patient__linked_user_id=request.user.id),
            is_active=False
        ).select_related(
            *CHAT_ROOM_SELECT_RELATED_FIELDS
        ).order_by('-updated_at')

        paged_rooms, limit, offset, total_count, next_url, previous_url = _paginate_queryset(
            request,
            user_archived_chats,
        )
        serializer = ChatRoomListSerializer(
            paged_rooms,
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'results': serializer.data,
            'count': total_count,
            'next': next_url,
            'previous': previous_url,
            'limit': limit,
            'offset': offset,
        })
        
    except Exception as e:
        logger.error(f"Error fetching archived chat rooms: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل المحادثات المؤرشفة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_room_context(request, chat_id):
    """الحصول على السياق الكامل لمحادثة محددة"""
    try:
        chat_room = ChatRoom.objects.select_related(
            *CHAT_ROOM_SELECT_RELATED_FIELDS
        ).get(id=chat_id)
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بالوصول لهذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # إرجاع السياق الكامل للمحادثة
        context_serializer = ChatContextSerializer(chat_room, context={'request': request})
        return Response(context_serializer.data)
        
    except ChatRoom.DoesNotExist:
        return Response(
            {'error': 'المحادثة غير موجودة'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error fetching chat room context {chat_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في تحميل سياق المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reactivate_chat_room(request, chat_id):
    """إعادة تفعيل غرفة محادثة مؤرشفة"""
    try:
        chat_room = ChatRoom.objects.get(id=chat_id)
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بإعادة تفعيل هذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # التحقق من أن المحادثة مؤرشفة
        if chat_room.is_active:
            return Response(
                {'error': 'المحادثة نشطة بالفعل'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # إعادة تفعيل المحادثة
        chat_room.reactivate()
        
        return Response({
            'message': 'تم إعادة تفعيل المحادثة بنجاح',
            'chat_room': ChatRoomSerializer(chat_room, context={'request': request}).data
        })
        
    except ChatRoom.DoesNotExist:
        return Response(
            {'error': 'المحادثة غير موجودة'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error reactivating chat room {chat_id}: {str(e)}")
        return Response(
            {'error': 'خطأ في إعادة تفعيل المحادثة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_chat_image(request):
    """رفع صورة للمحادثة"""
    try:
        logger.info("Upload chat image request user_id=%s", getattr(getattr(request, 'user', None), 'id', None))

        chat_identifier = request.data.get('chat_id') or request.data.get('firebase_chat_id')
        if not chat_identifier:
            return Response(
                {'error': 'معرف المحادثة مطلوب'},
                status=status.HTTP_400_BAD_REQUEST
            )

        chat_lookup = Q(firebase_chat_id=str(chat_identifier))
        if str(chat_identifier).isdigit():
            chat_lookup |= Q(id=int(chat_identifier))
        chat_room = ChatRoom.objects.filter(chat_lookup).select_related(
            *CHAT_ROOM_SELECT_RELATED_FIELDS
        ).first()
        if not chat_room:
            return Response(
                {'error': 'المحادثة غير موجودة'},
                status=status.HTTP_404_NOT_FOUND
            )
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بإرسال صور في هذه المحادثة'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if 'image' not in request.FILES:
            logger.warning("No image file in request")
            return Response(
                {'error': 'لم يتم إرسال صورة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        image_file = request.FILES['image']
        logger.debug(
            "Received chat image name=%s size=%s type=%s",
            image_file.name,
            image_file.size,
            image_file.content_type,
        )
        
        # التحقق من نوع الملف
        if not image_file.content_type.startswith('image/'):
            logger.warning(f"Invalid file type: {image_file.content_type}")
            return Response(
                {'error': 'يجب أن يكون الملف صورة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # التحقق من حجم الملف (5MB max)
        if image_file.size > 5 * 1024 * 1024:
            logger.warning(f"File too large: {image_file.size} bytes")
            return Response(
                {'error': 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # حفظ الصورة عبر default_storage لتدعم التخزين المحلي أو S3
        import os
        import uuid

        file_extension = os.path.splitext(image_file.name)[1] or '.jpg'
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        storage_path = f"chat_images/{unique_filename}"
        saved_name = default_storage.save(storage_path, image_file)
        image_url = default_storage.url(saved_name)
        if image_url and not image_url.startswith('http') and not image_url.startswith('/'):
            image_url = f"/{image_url}"
        
        logger.info("Chat image saved path=%s", saved_name)
        
        return Response({
            'success': True,
            'image_url': image_url,
            'filename': os.path.basename(saved_name)
        })
        
    except Exception as e:
        logger.error(f"Error uploading chat image: {str(e)}")
        return Response(
            {'error': 'خطأ في رفع الصورة'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Adoption Views
class AdoptionRequestListCreateView(generics.ListCreateAPIView):
    """قائمة وإنشاء طلبات التبني"""
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """الحصول على طلبات التبني للمستخدم الحالي"""
        return AdoptionRequest.objects.filter(
            adopter=self.request.user
        ).select_related(
            *ADOPTION_REQUEST_SELECT_RELATED_FIELDS
        )
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdoptionRequestCreateSerializer
        return AdoptionRequestListSerializer
    
    def create(self, request, *args, **kwargs):
        """إنشاء طلب تبني جديد مع إرسال إشعار"""
        # فتح طلبات التبني بدون شرط توثيق رقم الهاتف
        with transaction.atomic():
            response = super().create(request, *args, **kwargs)

            if response.status_code == status.HTTP_201_CREATED and response.data.get('id'):
                adoption_request_id = response.data['id']
                enqueue_notification_event(
                    event_type=NotificationOutbox.EVENT_ADOPTION_REQUEST_RECEIVED,
                    object_id=adoption_request_id,
                    dedupe_key=f"adoption_request_received:{adoption_request_id}",
                )

        return response


class AdoptionRequestDetailView(generics.RetrieveAPIView):
    """تفاصيل طلب التبني"""
    serializer_class = AdoptionRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return AdoptionRequest.objects.filter(
            adopter=self.request.user
        ).select_related(
            *ADOPTION_REQUEST_SELECT_RELATED_FIELDS
        )


class MyAdoptionRequestsView(generics.ListAPIView):
    """طلبات التبني المرسلة من المستخدم"""
    serializer_class = AdoptionRequestListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return AdoptionRequest.objects.filter(
            adopter=self.request.user
        ).select_related(
            *ADOPTION_REQUEST_SELECT_RELATED_FIELDS
        )


class ReceivedAdoptionRequestsView(generics.ListAPIView):
    """طلبات التبني المستقبلة لحيوانات المستخدم"""
    serializer_class = AdoptionRequestListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return AdoptionRequest.objects.filter(
            pet__owner=self.request.user
        ).select_related(
            *ADOPTION_REQUEST_SELECT_RELATED_FIELDS
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_to_adoption_request(request, request_id):
    """الرد على طلب التبني (قبول/رفض/إكمال)"""
    try:
        adoption_request = AdoptionRequest.objects.select_related(
            *ADOPTION_REQUEST_SELECT_RELATED_FIELDS
        ).get(
            id=request_id,
            pet__owner=request.user
        )
    except AdoptionRequest.DoesNotExist:
        return Response(
            {'error': 'طلب التبني غير موجود'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    serializer = AdoptionRequestResponseSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    action = serializer.validated_data['action']
    notes = serializer.validated_data.get('notes', '')
    admin_notes = serializer.validated_data.get('admin_notes', '')
    
    # تحديث الملاحظات
    if notes:
        adoption_request.notes = notes
    if admin_notes:
        adoption_request.admin_notes = admin_notes
    
    with transaction.atomic():
        # تنفيذ الإجراء المطلوب
        if action == 'approve':
            if adoption_request.can_be_approved:
                adoption_request.approve()
                message = 'تم قبول طلب التبني'

                enqueue_notification_event(
                    event_type=NotificationOutbox.EVENT_ADOPTION_REQUEST_APPROVED,
                    object_id=adoption_request.id,
                    dedupe_key=f"adoption_request_approved:{adoption_request.id}",
                )

                # إنشاء غرفة محادثة عند قبول طلب التبني
                try:
                    from .models import ChatRoom
                    # التحقق من عدم وجود غرفة محادثة مسبقة
                    existing_chat = ChatRoom.objects.filter(
                        breeding_request__isnull=True,
                        adoption_request=adoption_request
                    ).first()

                    if not existing_chat:
                        # إنشاء غرفة محادثة جديدة
                        ChatRoom.objects.create(
                            firebase_chat_id=f"adoption_{adoption_request.id}_{int(time.time())}",
                            adoption_request=adoption_request,
                            is_active=True
                        )
                        message += ' - تم إنشاء غرفة محادثة للتواصل'
                except Exception as e:
                    # في حالة حدوث خطأ في إنشاء المحادثة، لا نوقف العملية
                    logger.warning("Error creating adoption chat room for request %s: %s", adoption_request.id, e)
                    message += ' - حدث خطأ في إنشاء غرفة المحادثة'
            else:
                return Response(
                    {'error': 'لا يمكن قبول هذا الطلب'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif action == 'reject':
            adoption_request.reject()
            message = 'تم رفض طلب التبني'
        elif action == 'complete':
            if adoption_request.can_be_completed:
                adoption_request.complete()
                message = 'تم إكمال عملية التبني'
            else:
                return Response(
                    {'error': 'لا يمكن إكمال هذا الطلب'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        adoption_request.save()
    
    return Response({
        'message': message,
        'adoption_request': AdoptionRequestSerializer(adoption_request).data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def adoption_pets(request):
    """الحيوانات المتاحة للتبني"""
    pets = _with_pet_likes(
        Pet.objects.filter(
            status='available_for_adoption'
        ).select_related(
            'breed',
            'owner',
        )
    )

    pet_type = request.GET.get('pet_type')
    if pet_type:
        pets = pets.filter(pet_type=pet_type)

    breed_id = request.GET.get('breed')
    if breed_id:
        pets = pets.filter(breed_id=breed_id)

    gender = request.GET.get('gender')
    if gender:
        pets = pets.filter(gender=gender)

    location = request.GET.get('location')
    if location:
        pets = pets.filter(location__icontains=location)

    user_lat_raw = request.GET.get('user_lat')
    user_lng_raw = request.GET.get('user_lng')
    user_lat = None
    user_lng = None

    if user_lat_raw and user_lng_raw:
        try:
            user_lat = float(user_lat_raw)
            user_lng = float(user_lng_raw)
            effective_point_field = gis_models.PointField(geography=True, srid=4326)
            user_point = Point(user_lng, user_lat, srid=4326)
            pets = pets.annotate(
                effective_point=Coalesce(
                    'location_point',
                    'owner__location_point',
                    output_field=effective_point_field,
                )
            ).annotate(
                distance_m=Distance('effective_point', user_point),
            ).order_by(
                F('distance_m').asc(nulls_last=True),
                '-created_at',
            )
        except (TypeError, ValueError):
            user_lat = None
            user_lng = None
            pets = pets.order_by('-created_at')
    else:
        pets = pets.order_by('-created_at')

    limit = _parse_int_param(request.GET.get('limit'), default=None, minimum=1, maximum=200)
    offset = _parse_int_param(request.GET.get('offset'), default=0, minimum=0)
    total_count = None
    if limit is not None:
        total_count = pets.count()
        pets = pets[offset:offset + limit]

    context = {
        'request': request,
        'liked_pet_ids': _liked_pet_ids_for_request(request),
    }
    if user_lat is not None and user_lng is not None:
        context['user_lat'] = user_lat
        context['user_lng'] = user_lng

    serializer = PetListSerializer(pets, many=True, context=context)
    if total_count is None:
        return Response(serializer.data)

    next_url, previous_url = _build_offset_pagination_links(request, offset, limit, total_count)
    return Response({
        'results': serializer.data,
        'count': total_count,
        'next': next_url,
        'previous': previous_url,
        'limit': limit,
        'offset': offset,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def adoption_stats(request):
    """إحصائيات التبني"""
    total_available = Pet.objects.filter(status='available_for_adoption').count()
    total_pending = Pet.objects.filter(status='adoption_pending').count()
    total_adopted = Pet.objects.filter(status='adopted').count()
    
    my_requests = AdoptionRequest.objects.filter(adopter=request.user).count()
    my_pending_requests = AdoptionRequest.objects.filter(
        adopter=request.user,
        status='pending'
    ).count()
    
    received_requests = AdoptionRequest.objects.filter(
        pet__owner=request.user
    ).count()
    
    return Response({
        'total_available_for_adoption': total_available,
        'total_adoption_pending': total_pending,
        'total_adopted': total_adopted,
        'my_adoption_requests': my_requests,
        'my_pending_requests': my_pending_requests,
        'received_requests': received_requests
    })


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def delete_cats(request):
    """حذف جميع القطط (للمشرفين فقط)"""
    try:
        # البحث عن جميع القطط
        cats = Pet.objects.filter(pet_type='cats')
        cat_count = cats.count()
        
        if cat_count == 0:
            return Response({
                'message': 'لا توجد قطط في قاعدة البيانات',
                'deleted_count': 0
            }, status=status.HTTP_200_OK)
        
        # حذف القطط
        with transaction.atomic():
            deleted_count = cats.delete()[0]
        
        return Response({
            'message': f'تم حذف {deleted_count} قط بنجاح',
            'deleted_count': deleted_count
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'حدث خطأ أثناء حذف القطط: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def delete_cats_by_breed(request, breed_name):
    """حذف القطط حسب السلالة (للمشرفين فقط)"""
    try:
        # البحث عن السلالة
        breed = Breed.objects.filter(name__icontains=breed_name, pet_type='cats').first()
        
        if not breed:
            return Response({
                'error': f'لم يتم العثور على سلالة القطط: {breed_name}'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # البحث عن القطط من هذه السلالة
        cats = Pet.objects.filter(breed=breed, pet_type='cats')
        cat_count = cats.count()
        
        if cat_count == 0:
            return Response({
                'message': f'لا توجد قطط من سلالة {breed.name}',
                'deleted_count': 0
            }, status=status.HTTP_200_OK)
        
        # حذف القطط
        with transaction.atomic():
            deleted_count = cats.delete()[0]
        
        return Response({
            'message': f'تم حذف {deleted_count} قط من سلالة {breed.name} بنجاح',
            'deleted_count': deleted_count
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'حدث خطأ أثناء حذف القطط: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def cats_summary(request):
    """ملخص القطط في قاعدة البيانات (للمشرفين فقط)"""
    try:
        cats = Pet.objects.filter(pet_type='cats').select_related('breed', 'owner')
        cat_count = cats.count()
        
        cats_data = []
        for cat in cats:
            cats_data.append({
                'id': cat.id,
                'name': cat.name,
                'breed': cat.breed.name if cat.breed else 'بدون سلالة',
                'owner': cat.owner.username if cat.owner else 'غير محدد',
                'created_at': cat.created_at
            })
        
        return Response({
            'total_cats': cat_count,
            'cats': cats_data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'حدث خطأ أثناء جلب ملخص القطط: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
