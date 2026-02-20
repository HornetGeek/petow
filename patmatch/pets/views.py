from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly, AllowAny, IsAdminUser
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from django.db import transaction
from django.contrib.gis.db import models as gis_models
from django.contrib.gis.db.models.functions import Distance, Transform
from django.contrib.gis.geos import Point, Polygon
from .models import Breed, Pet, BreedingRequest, Favorite, VeterinaryClinic, Notification, ChatRoom, AdoptionRequest
from .serializers import (
    BreedSerializer, PetSerializer, PetListSerializer, 
    BreedingRequestSerializer, FavoriteSerializer, VeterinaryClinicSerializer,
    NotificationSerializer, ChatRoomSerializer, ChatRoomListSerializer,
    ChatContextSerializer, ChatStatusSerializer, ChatCreationSerializer,
    AdoptionRequestSerializer, AdoptionRequestCreateSerializer, 
    AdoptionRequestListSerializer, AdoptionRequestResponseSerializer
)
from .notifications import (
    notify_breeding_request_received, notify_breeding_request_approved,
    notify_breeding_request_rejected, notify_breeding_request_completed,
    notify_favorite_added, notify_adoption_request_received,
    notify_adoption_request_approved, notify_new_pet_added
)
# إضافة imports للإشعارات الجديدة
from accounts.firebase_service import firebase_service
import logging
import time
from django.db import models
from django.db.models import F, Value, FloatField, ExpressionWrapper, Count, Avg, Min, Max, IntegerField, Func
from django.db.models.functions import Coalesce, Cast, Floor
import requests

logger = logging.getLogger(__name__)

def reverse_geocode_address(lat: float, lng: float) -> str:
    try:
        res = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "format": "jsonv2",
                "lat": str(lat),
                "lon": str(lng),
                "addressdetails": "1",
                "accept-language": "ar,en",
            },
            headers={
                "User-Agent": "PetMatchBackend/1.0 (contact@yourdomain.com)",
                "Accept": "application/json",
            },
            timeout=6,
        )
        res.raise_for_status()
        data = res.json() or {}
        full = data.get("display_name") or ""
        if full:
            parts = full.split(", ")
            return ", ".join(parts[:3]) if len(parts) > 3 else full
        return f"{lat:.4f}, {lng:.4f}"
    except Exception:
        return f"{lat:.4f}, {lng:.4f}"


MAP_DEFAULT_POINT_LIMIT = 300
MAP_MAX_POINT_LIMIT = 1000
MAP_CLUSTER_ZOOM_THRESHOLD = 13


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


def _cell_size_meters_for_zoom(zoom):
    meters_per_pixel = 40075016.686 / (256 * (2 ** max(zoom, 1)))
    return max(meters_per_pixel * 64, 25.0)


def _format_distance_display(distance_km):
    if distance_km is None:
        return None
    if distance_km < 1:
        return f"{int(distance_km * 1000)} متر"
    if distance_km < 100:
        return f"{distance_km:.1f} كم"
    return f"{int(distance_km)} كم"


class PetMapMarkersView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        started_at = time.perf_counter()
        try:
            min_lng, min_lat, max_lng, max_lat = _parse_bbox_param(request.query_params.get('bbox'))
            zoom = _parse_zoom_param(request.query_params.get('zoom'))
            cluster_enabled = _parse_bool_param(request.query_params.get('cluster'), default=True)
            limit_points = _parse_point_limit(request.query_params.get('limit_points'))

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
            queryset = queryset.filter(pet_type=pet_type)
        if gender:
            queryset = queryset.filter(gender=gender)
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
                singleton_groups = singleton_groups.annotate(sort_id=Max('point_id')).order_by('-sort_id')

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
        serializer_context = {'request': request}
        if user_lat is not None and user_lng is not None:
            serializer_context['user_lat'] = user_lat
            serializer_context['user_lng'] = user_lng
        serializer = PetListSerializer(points, many=True, context=serializer_context)
        points_payload = list(serializer.data)

        for index, pet in enumerate(points):
            lat_value = getattr(pet, 'map_latitude', None)
            lng_value = getattr(pet, 'map_longitude', None)
            if lat_value is not None:
                points_payload[index]['latitude'] = float(lat_value)
            if lng_value is not None:
                points_payload[index]['longitude'] = float(lng_value)

            if user_point is not None:
                distance_value = getattr(pet, 'map_distance_m', None)
                if distance_value is not None:
                    distance_meters = float(getattr(distance_value, 'm', distance_value))
                    distance_km = round(distance_meters / 1000.0, 2)
                    points_payload[index]['distance'] = distance_km
                    points_payload[index]['distance_display'] = _format_distance_display(distance_km)

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

        return Response({
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
        })

class BreedListView(generics.ListAPIView):
    """قائمة السلالات"""
    queryset = Breed.objects.all()
    serializer_class = BreedSerializer
    permission_classes = []
    authentication_classes = []  # No authentication needed

class PetListCreateView(generics.ListCreateAPIView):
    """قائمة الحيوانات وإنشاء حيوان جديد"""
    queryset = Pet.objects.all()
    serializer_class = PetListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    
    def get_permissions(self):
        """Allow read access without authentication, require auth for create"""
        print(f"🔐 Django: get_permissions called for method: {self.request.method}")
        print(f"🔐 Django: User: {self.request.user}")
        print(f"🔐 Django: Is authenticated: {self.request.user.is_authenticated}")
        print(f"🔐 Django: User ID: {getattr(self.request.user, 'id', 'NO_ID')}")
        print(f"🔐 Django: User email: {getattr(self.request.user, 'email', 'NO_EMAIL')}")
        print(f"🔐 Django: Request headers: {dict(self.request.headers)}")
        print(f"🔐 Django: Authorization header: {self.request.headers.get('Authorization', 'NOT_FOUND')}")
        print(f"🔐 Django: All headers keys: {list(self.request.headers.keys())}")
        
        if self.request.method == 'GET':
            print(f"🔐 Django: GET request - no permissions required")
            return []
        
        print(f"🔐 Django: POST request - requiring IsAuthenticated")
        return [IsAuthenticated()]
    
    def create(self, request, *args, **kwargs):
        """Override create to add detailed logging"""
        print(f"🆕 Django: Create request from user: {request.user}")
        print(f"🆕 Django: User ID: {request.user.id if request.user.is_authenticated else 'Anonymous'}")
        print(f"🆕 Django: User email: {request.user.email if request.user.is_authenticated else 'Anonymous'}")
        print(f"🆕 Django: Is authenticated: {request.user.is_authenticated}")
        print(f"🆕 Django: Request data keys: {list(request.data.keys())}")
        print(f"🆕 Django: Request headers: {dict(request.headers)}")
        print(f"🆕 Django: Authorization header: {request.headers.get('Authorization', 'NOT_FOUND')}")
        print(f"🆕 Django: Request method: {request.method}")
        print(f"🆕 Django: Request user: {request.user}")
        print(f"🆕 Django: Request user backend: {getattr(request.user, 'backend', 'NO_BACKEND')}")
        
        try:
            response = super().create(request, *args, **kwargs)
            if response.status_code == status.HTTP_201_CREATED and response.data.get('id'):
                try:
                    pet = Pet.objects.get(id=response.data['id'])
                    notify_new_pet_added(pet)
                except Pet.DoesNotExist:
                    logger.warning("Newly created pet not found for notification (id=%s)", response.data.get('id'))
            return response
        except Exception as e:
            print(f"❌ Django: Create error: {str(e)}")
            print(f"❌ Django: Error type: {type(e)}")
            raise
    # نُحافظ على البحث والفلترة، ونُدير الترتيب يدوياً لدعم الأقرب أولاً افتراضياً
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['pet_type', 'gender', 'status', 'breed']
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
        queryset = Pet.objects.select_related('breed', 'owner')
        
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
    queryset = Pet.objects.select_related('breed', 'owner').prefetch_related('additional_images')
    serializer_class = PetSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    
    def get_permissions(self):
        """Allow read access without authentication, require auth for create"""
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAuthenticated()]
        return []
    
    def update(self, request, *args, **kwargs):
        """Override update to add detailed error logging"""
        print(f"🔄 Django: Update request data: {request.data}")
        try:
            return super().update(request, *args, **kwargs)
        except Exception as e:
            print(f"❌ Django: Update error: {str(e)}")
            print(f"❌ Django: Error type: {type(e)}")
            raise
    
    def get_queryset(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            # المالك فقط يمكنه التعديل أو الحذف
            print(f"🔍 Django: Checking ownership for user: {self.request.user}")
            print(f"🔍 Django: User ID: {self.request.user.id}")
            print(f"🔍 Django: User email: {self.request.user.email}")
            print(f"🔍 Django: Is authenticated: {self.request.user.is_authenticated}")
            
            # Get the pet being requested
            pet_id = self.kwargs.get('pk')
            try:
                pet = Pet.objects.get(pk=pet_id)
                print(f"🐾 Django: Pet owner: {pet.owner}")
                print(f"🐾 Django: Pet owner ID: {pet.owner.id}")
                print(f"🐾 Django: Pet owner email: {pet.owner.email}")
                print(f"🔍 Django: Ownership match: {pet.owner == self.request.user}")
            except Pet.DoesNotExist:
                print(f"❌ Django: Pet with ID {pet_id} not found")
            
            queryset = Pet.objects.filter(owner=self.request.user)
            print(f"🔍 Django: Filtered queryset count: {queryset.count()}")
            return queryset
        return Pet.objects.all()

class MyPetsView(generics.ListAPIView):
    """حيواناتي الأليفة"""
    serializer_class = PetListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Pet.objects.filter(owner=self.request.user).select_related('breed')

class BreedingRequestListCreateView(generics.ListCreateAPIView):
    """قائمة طلبات التزاوج وإنشاء طلب جديد"""
    serializer_class = BreedingRequestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status']
    ordering = ['-created_at']
    
    def get_queryset(self):
        # عرض الطلبات المرسلة والمستقبلة
        return BreedingRequest.objects.filter(
            Q(requester=self.request.user) | Q(receiver=self.request.user)
        ).select_related('male_pet', 'female_pet', 'requester', 'receiver')

class BreedingRequestDetailView(generics.RetrieveUpdateAPIView):
    """تفاصيل طلب التزاوج"""
    serializer_class = BreedingRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return BreedingRequest.objects.filter(
            Q(requester=self.request.user) | Q(receiver=self.request.user)
        )
    
    def get_permissions(self):
        # فقط المستقبل يمكنه تحديث الطلب (الموافقة/الرفض)
        if self.request.method in ['PUT', 'PATCH']:
            return [IsAuthenticated()]
        return [IsAuthenticated()]

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_to_breeding_request(request, pk):
    """الرد على طلب التزاوج"""
    try:
        breeding_request = BreedingRequest.objects.get(
            pk=pk, receiver=request.user
        )
    except BreedingRequest.DoesNotExist:
        return Response(
            {'error': 'طلب التزاوج غير موجود'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    action = request.data.get('action')  # 'approve' or 'reject'
    response_message = request.data.get('response_message', '')
    
    if action == 'approve':
        breeding_request.status = 'approved'
        # تحديث حالة الحيوانات إلى "في عملية التزاوج"
        breeding_request.male_pet.status = 'mating'
        breeding_request.female_pet.status = 'mating'
        breeding_request.male_pet.save()
        breeding_request.female_pet.save()
    elif action == 'reject':
        breeding_request.status = 'rejected'
    else:
        return Response(
            {'error': 'إجراء غير صحيح'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    breeding_request.response_message = response_message
    breeding_request.save()
    
    serializer = BreedingRequestSerializer(breeding_request)
    return Response(serializer.data)

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
        return Response({'favorited': False})
    
    return Response({'favorited': True})

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
        ).order_by('-created_at')
    
    def create(self, request, *args, **kwargs):
        """إنشاء طلب مقابلة جديد مع إرسال إشعار"""
        response = super().create(request, *args, **kwargs)
        
        # إرسال إشعار للمستقبل
        if response.status_code == 201:
            breeding_request = BreedingRequest.objects.get(id=response.data['id'])
            notify_breeding_request_received(breeding_request)
        
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
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_breeding_requests(request):
    """طلبات المقابلة المرسلة من المستخدم"""
    user = request.user
    sent_requests = BreedingRequest.objects.filter(requester=user).order_by('-created_at')
    serializer = BreedingRequestSerializer(sent_requests, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def received_breeding_requests(request):
    """طلبات المقابلة الواردة للمستخدم"""
    user = request.user
    received_requests = BreedingRequest.objects.filter(receiver=user).order_by('-created_at')
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
    
    if response_type == 'approve':
        breeding_request.status = 'approved'
        # إرسال إشعار بالقبول
        notify_breeding_request_approved(breeding_request)
    elif response_type == 'reject':
        breeding_request.status = 'rejected'
        # إرسال إشعار بالرفض
        notify_breeding_request_rejected(breeding_request)
    else:
        return Response(
            {'error': 'نوع الرد غير صحيح. يجب أن يكون approve أو reject'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    breeding_request.response_message = response_message
    breeding_request.save()
    
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
        message_content = request.data.get('message', '')
        
        if not chat_id:
            return Response(
                {'error': 'معرف المحادثة مطلوب'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # البحث عن المحادثة
        try:
            chat_room = ChatRoom.objects.get(firebase_chat_id=chat_id)
        except ChatRoom.DoesNotExist:
            return Response(
                {'error': 'المحادثة غير موجودة'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # تحديد المرسل والمستقبل
        participants = chat_room.get_participants()
        if len(participants) < 2:
            return Response(
                {'error': 'المحادثة غير صالحة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # إرسال إشعار للمشارك الآخر
        sender = request.user
        for participant in participants:
            if participant.id != sender.id:
                notification = Notification.create_chat_message_notification(
                    recipient_user=participant,
                    sender_user=sender,
                    chat_room=chat_room,
                    message_content=message_content
                )
                break
        
        return Response(
            {'message': 'تم إرسال الإشعار بنجاح'}, 
            status=status.HTTP_201_CREATED
        )
        
    except Exception as e:
        return Response(
            {'error': f'خطأ في إرسال الإشعار: {str(e)}'}, 
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
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'adoption_request__pet',
            'clinic_patient__clinic',
            'clinic_patient__owner',
            'clinic_patient__linked_user'
        ).order_by('-updated_at')
        
        serializer = ChatRoomListSerializer(
            user_chat_rooms, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'results': serializer.data,
            'count': user_chat_rooms.count()
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
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'adoption_request__pet',
            'clinic_patient__clinic',
            'clinic_patient__owner',
            'clinic_patient__linked_user'
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
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'adoption_request__pet',
            'clinic_patient__clinic',
            'clinic_patient__owner',
            'clinic_patient__linked_user'
        ).get(
            firebase_chat_id=firebase_chat_id,
            is_active=True
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
        breeding_request = BreedingRequest.objects.get(id=breeding_request_id)
        if request.user not in [breeding_request.requester, breeding_request.target_pet.owner]:
            return Response(
                {'error': 'غير مخول لك بالوصول لهذا الطلب'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # البحث عن غرفة المحادثة
        try:
            chat_room = ChatRoom.objects.get(breeding_request=breeding_request)
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
        adoption_request = AdoptionRequest.objects.get(id=adoption_request_id)
        participants = [adoption_request.adopter, getattr(adoption_request.pet, 'owner', None)]
        if request.user not in participants:
            return Response(
                {'error': 'غير مخول لك بالوصول لهذا الطلب'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            chat_room = ChatRoom.objects.get(adoption_request=adoption_request)
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
        # Debug logging
        print(f"DEBUG: Request data: {request.data}")
        print(f"DEBUG: Request user: {request.user}")
        
        # استخدام السيريلايزر للتحقق من البيانات
        creation_serializer = ChatCreationSerializer(data=request.data, context={'request': request})
        if not creation_serializer.is_valid():
            print(f"DEBUG: Serializer errors: {creation_serializer.errors}")
            return Response(
                creation_serializer.errors, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        breeding_request = creation_serializer.validated_data.get('breeding_request')
        adoption_request = creation_serializer.validated_data.get('adoption_request')
        
        if breeding_request:
            print(f"DEBUG: Creating chat for breeding request ID: {breeding_request.id}")
            chat_room = ChatRoom.objects.create(breeding_request=breeding_request)
        elif adoption_request:
            print(f"DEBUG: Creating chat for adoption request ID: {adoption_request.id}")
            chat_room = ChatRoom.objects.create(adoption_request=adoption_request)
        else:
            return Response(
                {'error': 'بيانات الطلب غير صالحة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        print(f"DEBUG: Chat room created with ID: {chat_room.id}")
        
        # إرجاع بيانات المحادثة مع السياق الكامل
        context_serializer = ChatContextSerializer(chat_room, context={'request': request})
        
        return Response({
            'chat_room': ChatRoomSerializer(chat_room, context={'request': request}).data,
            'context': context_serializer.data['chat_context'],
            'message': 'تم إنشاء المحادثة بنجاح'
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        print(f"DEBUG: Exception occurred: {str(e)}")
        logger.error(f"Error creating chat room: {str(e)}")
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
            'breeding_request__target_pet__owner'
        ).get(id=chat_id)
        
        # التحقق من أن المستخدم مشارك في المحادثة
        if not chat_room.can_user_access(request.user):
            return Response(
                {'error': 'غير مسموح لك بالوصول لهذه المحادثة'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        participants = chat_room.get_participants()
        return Response({
            'id': chat_room.id,
            'firebase_chat_id': chat_room.firebase_chat_id,
            'is_active': chat_room.is_active,
            'created_at': chat_room.created_at,
            'updated_at': chat_room.updated_at,
            'breeding_request_status': chat_room.breeding_request.status,
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
            Q(breeding_request__target_pet__owner_id=request.user.id),
            is_active=False
        ).select_related(
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet'
        ).order_by('-updated_at')
        
        serializer = ChatRoomListSerializer(
            user_archived_chats, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'results': serializer.data,
            'count': user_archived_chats.count()
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
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet'
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
@permission_classes([AllowAny])  # Allow any user temporarily for testing
def upload_chat_image(request):
    """رفع صورة للمحادثة"""
    try:
        # Log request details for debugging
        logger.info(f"Upload request from user: {getattr(request, 'user', 'Anonymous')}")
        logger.info(f"Request headers: {dict(request.headers)}")
        logger.info(f"Request FILES: {list(request.FILES.keys())}")
        
        if 'image' not in request.FILES:
            logger.warning("No image file in request")
            return Response(
                {'error': 'لم يتم إرسال صورة'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        image_file = request.FILES['image']
        logger.info(f"Image file: {image_file.name}, size: {image_file.size}, type: {image_file.content_type}")
        
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
        
        # حفظ الصورة
        import os
        from django.conf import settings
        
        # إنشاء مجلد للصور إذا لم يكن موجود
        upload_dir = os.path.join(settings.MEDIA_ROOT, 'chat_images')
        os.makedirs(upload_dir, exist_ok=True)
        
        # إنشاء اسم فريد للملف
        import uuid
        file_extension = os.path.splitext(image_file.name)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        
        # حفظ الملف
        file_path = os.path.join(upload_dir, unique_filename)
        with open(file_path, 'wb+') as destination:
            for chunk in image_file.chunks():
                destination.write(chunk)
        
        logger.info(f"Image saved successfully: {file_path}")
        
        # إرجاع URL الصورة (relative path فقط)
        image_url = f"/media/chat_images/{unique_filename}"
        
        logger.info(f"Image URL generated: {image_url}")
        
        return Response({
            'success': True,
            'image_url': image_url,
            'filename': unique_filename
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
        return AdoptionRequest.objects.filter(adopter=self.request.user)
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdoptionRequestCreateSerializer
        return AdoptionRequestListSerializer
    
    def create(self, request, *args, **kwargs):
        """إنشاء طلب تبني جديد مع إرسال إشعار"""
        # فتح طلبات التبني بدون شرط توثيق رقم الهاتف
        response = super().create(request, *args, **kwargs)
        
        # إرسال إشعار لصاحب الحيوان
        if response.status_code == 201:
            adoption_request = AdoptionRequest.objects.get(id=response.data['id'])
            notify_adoption_request_received(adoption_request)
        
        return response


class AdoptionRequestDetailView(generics.RetrieveAPIView):
    """تفاصيل طلب التبني"""
    serializer_class = AdoptionRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return AdoptionRequest.objects.filter(adopter=self.request.user)


class MyAdoptionRequestsView(generics.ListAPIView):
    """طلبات التبني المرسلة من المستخدم"""
    serializer_class = AdoptionRequestListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return AdoptionRequest.objects.filter(adopter=self.request.user)


class ReceivedAdoptionRequestsView(generics.ListAPIView):
    """طلبات التبني المستقبلة لحيوانات المستخدم"""
    serializer_class = AdoptionRequestListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return AdoptionRequest.objects.filter(pet__owner=self.request.user)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_to_adoption_request(request, request_id):
    """الرد على طلب التبني (قبول/رفض/إكمال)"""
    try:
        adoption_request = AdoptionRequest.objects.get(
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
    
    # تنفيذ الإجراء المطلوب
    if action == 'approve':
        if adoption_request.can_be_approved:
            adoption_request.approve()
            message = 'تم قبول طلب التبني'
            
            # إرسال إشعار لطالب التبني
            notify_adoption_request_approved(adoption_request)
            
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
                    chat_room = ChatRoom.objects.create(
                        firebase_chat_id=f"adoption_{adoption_request.id}_{int(time.time())}",
                        adoption_request=adoption_request,
                        is_active=True
                    )
                    message += ' - تم إنشاء غرفة محادثة للتواصل'
            except Exception as e:
                # في حالة حدوث خطأ في إنشاء المحادثة، لا نوقف العملية
                print(f"Error creating chat room: {e}")
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
    pets = Pet.objects.filter(status='available_for_adoption')
    
    # تطبيق الفلاتر
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
    
    # الحصول على موقع المستخدم للترتيب حسب المسافة
    user_lat = request.GET.get('user_lat')
    user_lng = request.GET.get('user_lng')
    
    print(f"🔍 Django: user_lat={user_lat}, user_lng={user_lng}")
    
    # ترتيب النتائج
    if user_lat and user_lng:
        try:
            user_lat = float(user_lat)
            user_lng = float(user_lng)
            # ترتيب حسب المسافة (الأقرب أولاً)
            pets = sorted(pets, key=lambda pet: pet.calculate_distance(user_lat, user_lng) or float('inf'))
            print(f"🔍 Django: Sorted {len(pets)} pets by distance")
        except (ValueError, TypeError) as e:
            print(f"❌ Django: Error sorting by distance: {e}")
            pass
    
    # ترتيب افتراضي: الأحدث أولاً
    if not (user_lat and user_lng):
        pets = pets.order_by('-created_at')
        print(f"🔍 Django: Sorted {len(pets)} pets by creation date")
    
    # إضافة موقع المستخدم للـ context
    context = {'request': request}
    
    # تمرير موقع المستخدم مباشرة للـ context
    if user_lat and user_lng:
        context['user_lat'] = user_lat
        context['user_lng'] = user_lng
        print(f"🔍 Django: Added location to context: lat={user_lat}, lng={user_lng}")
    
    serializer = PetListSerializer(pets, many=True, context=context)
    data = serializer.data
    
    # طباعة بيانات المسافة للتحقق
    if user_lat and user_lng:
        print(f"🔍 Django: First pet distance: {data[0].get('distance_display') if data else 'No pets'}")
    
    return Response(data)


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
