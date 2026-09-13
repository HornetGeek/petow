from datetime import timedelta

from django.db.models import Q, Min, Max, Exists, OuterRef
from django.utils import timezone

from clinics.marketplace import (
    MARKETPLACE_SERVICE_GROUPS,
    get_marketplace_categories_for_group,
    get_marketplace_group_for_category,
)
from clinics.models import ClinicService, ClinicStaff

from .models import Pet, SavedSearch
from .serializers import PetListSerializer


GENDER_ALIASES = {
    'male': 'M',
    'm': 'M',
    'ذكر': 'M',
    'female': 'F',
    'f': 'F',
    'أنثى': 'F',
}


def normalize_saved_search_filters(filters):
    return filters if isinstance(filters, dict) else {}


def _parse_int_filter(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def build_pet_saved_search_queryset(saved_search, *, user=None, since=None):
    filters = normalize_saved_search_filters(saved_search.filters)
    queryset = Pet.objects.select_related('breed', 'owner')

    if user and getattr(user, 'is_authenticated', False):
        queryset = queryset.exclude(owner=user)

    target_type = saved_search.target_type
    if target_type == SavedSearch.TARGET_ADOPTION:
        queryset = queryset.filter(status='available_for_adoption')
    elif target_type == SavedSearch.TARGET_BREEDING:
        queryset = queryset.filter(status='available')
    elif filters.get('status'):
        queryset = queryset.filter(status=str(filters.get('status')).strip())
    else:
        queryset = queryset.exclude(status__in=['unavailable', 'adopted'])

    pet_type = filters.get('pet_type')
    if isinstance(pet_type, list):
        pet_type_values = [str(value).strip() for value in pet_type if str(value).strip()]
        if pet_type_values:
            queryset = queryset.filter(pet_type__in=pet_type_values)
    elif pet_type and pet_type != 'all':
        queryset = queryset.filter(pet_type=str(pet_type).strip())

    gender = filters.get('gender')
    if gender and gender != 'all':
        gender_value = GENDER_ALIASES.get(str(gender).strip().lower(), str(gender).strip())
        queryset = queryset.filter(gender=gender_value)

    breed = filters.get('breed') or filters.get('breed_id')
    breed_id = _parse_int_filter(breed)
    if breed_id:
        queryset = queryset.filter(breed_id=breed_id)

    min_age = _parse_int_filter(filters.get('min_age_months'))
    max_age = _parse_int_filter(filters.get('max_age_months'))
    if min_age is not None:
        queryset = queryset.filter(age_months__gte=min_age)
    if max_age is not None:
        queryset = queryset.filter(age_months__lte=max_age)

    location = str(filters.get('location') or saved_search.city or '').strip()
    if location:
        queryset = queryset.filter(location__icontains=location)

    search = str(filters.get('search') or filters.get('query') or '').strip()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(description__icontains=search)
            | Q(breed__name__icontains=search)
            | Q(location__icontains=search)
        )

    if since:
        queryset = queryset.filter(updated_at__gt=since)

    return queryset.order_by('-created_at')


def build_service_saved_search_queryset(saved_search, *, since=None):
    filters = normalize_saved_search_filters(saved_search.filters)
    queryset = (
        ClinicService.objects
        .filter(is_active=True, clinic__is_active=True)
        .annotate(has_staff=Exists(ClinicStaff.objects.filter(clinic_id=OuterRef('clinic_id'))))
        .filter(Q(clinic__owner__isnull=False) | Q(has_staff=True))
        .annotate(
            marketplace_min_price=Min(
                'pricing_tiers__price',
                filter=Q(pricing_tiers__is_active=True),
            ),
            marketplace_max_price=Max(
                'pricing_tiers__price',
                filter=Q(pricing_tiers__is_active=True),
            ),
        )
        .select_related('clinic')
        .distinct()
    )

    category = filters.get('category')
    group = filters.get('group')
    if category:
        categories = [value.strip() for value in str(category).split(',') if value.strip()]
        queryset = queryset.filter(category__in=categories)
    elif group:
        categories = get_marketplace_categories_for_group(str(group).strip())
        if categories:
            queryset = queryset.filter(category__in=categories)

    city = str(filters.get('city') or filters.get('location') or saved_search.city or '').strip()
    if city:
        queryset = queryset.filter(Q(clinic__city__icontains=city) | Q(clinic__address__icontains=city))

    search = str(filters.get('search') or filters.get('query') or '').strip()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(description__icontains=search)
            | Q(clinic__name__icontains=search)
            | Q(clinic__address__icontains=search)
            | Q(clinic__services__icontains=search)
        )

    if since:
        queryset = queryset.filter(updated_at__gt=since)

    return queryset.order_by('-is_featured', 'display_order', 'base_price', 'name')


def get_saved_search_queryset(saved_search, *, user=None, since=None):
    if saved_search.target_type == SavedSearch.TARGET_SERVICE:
        return build_service_saved_search_queryset(saved_search, since=since)
    return build_pet_saved_search_queryset(saved_search, user=user, since=since)


def serialize_service_card(service, request=None):
    clinic = service.clinic
    group_key = get_marketplace_group_for_category(service.category)
    group_config = MARKETPLACE_SERVICE_GROUPS.get(group_key or '', {})
    image = None
    if getattr(service, 'service_image', None):
        try:
            image = service.service_image.url
            if request and image and not image.startswith('http'):
                image = request.build_absolute_uri(image)
        except Exception:
            image = None
    logo = None
    if getattr(clinic, 'logo', None):
        try:
            logo = clinic.logo.url
            if request and logo and not logo.startswith('http'):
                logo = request.build_absolute_uri(logo)
        except Exception:
            logo = None
    return {
        'id': service.id,
        'name': service.name,
        'description': service.description,
        'category': service.category,
        'category_display': service.get_category_display(),
        'group': group_key,
        'group_display': group_config.get('label') or service.get_category_display(),
        'base_price': str(service.base_price),
        'price_range': str(getattr(service, 'price_range', service.base_price)),
        'service_image': image,
        'clinic': {
            'id': clinic.id,
            'name': clinic.name,
            'city': clinic.city,
            'address': clinic.address,
            'phone': clinic.phone,
            'whatsapp_phone': clinic.whatsapp_phone,
            'logo': logo,
        },
    }


def serialize_saved_search_results(saved_search, request=None, *, limit=10):
    queryset = get_saved_search_queryset(saved_search, user=getattr(request, 'user', None))
    total = queryset.count()
    page = list(queryset[:limit])
    if saved_search.target_type == SavedSearch.TARGET_SERVICE:
        results = [serialize_service_card(service, request=request) for service in page]
    else:
        serializer = PetListSerializer(page, many=True, context={'request': request})
        results = serializer.data
    return {'count': total, 'results': results}


def recent_saved_search_cutoff(saved_search):
    if saved_search.last_checked_at:
        return saved_search.last_checked_at
    return timezone.now() - timedelta(days=7)
