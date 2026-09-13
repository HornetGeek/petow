import uuid

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.text import get_valid_filename
import json

from rest_framework import serializers

from .invite_service import build_invite_link, build_invite_message, create_invite_for_patient
from .marketplace import MARKETPLACE_SERVICE_GROUPS, get_marketplace_group_for_category
from .models import (
    Clinic,
    ClinicStaff,
    ClinicService,
    ClinicProduct,
    StorefrontOrder,
    StorefrontOrderItem,
    StorefrontBooking,
    StorefrontBookingTimeline,
    StorefrontBookingProposal,
    ServicePricingTier,
    ServicePackage,
    ClinicPromotion,
    ClinicMessage,
    ClinicClientRecord,
    ClinicPatientRecord,
    ClinicPatientDocument,
    ClinicPatientNote,
    ClinicInvite,
    ProviderServiceRequest,
    VeterinaryAppointment,
    VeterinarySession,
)

User = get_user_model()

ISO_CURRENCY_CODES = {
    'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
    'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV',
    'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF',
    'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUC', 'CUP', 'CVE',
    'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
    'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD',
    'HNL', 'HRK', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
    'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD',
    'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL',
    'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN',
    'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR',
    'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD',
    'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE',
    'SLL', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS',
    'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD',
    'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST',
    'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF',
    'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW',
    'ZWL',
}


def validate_iso_currency(value):
    normalized = (value or 'EGP').strip().upper()
    if normalized not in ISO_CURRENCY_CODES:
        raise serializers.ValidationError("كود العملة غير صالح")
    return normalized


LEGACY_APPOINTMENT_STATUS_MAP = {
    'scheduled': VeterinaryAppointment.STATUS_ACCEPTED,
    'rescheduled': VeterinaryAppointment.STATUS_ACCEPTED,
    'completed': VeterinaryAppointment.STATUS_COMPLETED,
    'cancelled': VeterinaryAppointment.STATUS_CANCELLED,
}

LEGACY_BOOKING_STATUS_MAP = {
    'new': StorefrontBooking.STATUS_PENDING,
    'accepted': StorefrontBooking.STATUS_ACCEPTED,
    'confirmed': StorefrontBooking.STATUS_ACCEPTED,
    'in_progress': StorefrontBooking.STATUS_IN_SESSION,
    'waiting_owner': StorefrontBooking.STATUS_PENDING,
    'counter_proposed': StorefrontBooking.STATUS_PENDING,
    'rejected': StorefrontBooking.STATUS_REFUSED,
    'completed': StorefrontBooking.STATUS_COMPLETED,
    'cancelled': StorefrontBooking.STATUS_CANCELLED,
}


def normalize_appointment_status(value):
    return LEGACY_APPOINTMENT_STATUS_MAP.get(value, value)


def normalize_booking_status(value):
    return LEGACY_BOOKING_STATUS_MAP.get(value, value)


def _calculate_age_text(date_of_birth):
    if not date_of_birth:
        return ""

    today = timezone.now().date()
    if date_of_birth > today:
        return ""

    years = today.year - date_of_birth.year
    months = today.month - date_of_birth.month

    if today.day < date_of_birth.day:
        months -= 1

    if months < 0:
        years -= 1
        months += 12

    parts = []
    if years > 0:
        parts.append(f"{years} year{'s' if years != 1 else ''}")
    if months > 0:
        parts.append(f"{months} month{'s' if months != 1 else ''}")

    if not parts:
        delta_days = (today - date_of_birth).days
        if delta_days <= 1:
            parts.append('Less than 1 day')
        elif delta_days < 30:
            parts.append(f"{delta_days} day{'s' if delta_days != 1 else ''}")
        else:
            parts.append('Less than 1 month')

    return ' '.join(parts)


def _format_age_months(age_months):
    if age_months is None:
        return ""
    try:
        months = int(age_months)
    except (TypeError, ValueError):
        return ""
    if months < 0:
        return ""
    if months == 0:
        return "Less than 1 month"
    years, remaining_months = divmod(months, 12)
    parts = []
    if years:
        parts.append(f"{years} year{'s' if years != 1 else ''}")
    if remaining_months:
        parts.append(f"{remaining_months} month{'s' if remaining_months != 1 else ''}")
    return ' '.join(parts) if parts else "Less than 1 month"


def get_or_create_patient_record_for_pet(clinic, pet, owner=None):
    """Ensure an app pet also has a clinic patient record."""
    if not clinic or not pet:
        return None

    patient = (
        ClinicPatientRecord.objects
        .filter(clinic=clinic, linked_pet=pet)
        .select_related('owner', 'linked_user', 'linked_pet')
        .first()
    )
    if patient:
        return patient

    linked_user = owner or getattr(pet, 'owner', None)
    owner_name = ''
    owner_email = None
    owner_phone = None
    if linked_user:
        owner_name = linked_user.get_full_name() or linked_user.email or ''
        owner_email = linked_user.email or None
        owner_phone = getattr(linked_user, 'phone', None) or None

    owner_record = None
    owner_qs = ClinicClientRecord.objects.filter(clinic=clinic)
    if owner_email:
        owner_record = owner_qs.filter(email__iexact=owner_email).first()
    if not owner_record and owner_phone:
        owner_record = owner_qs.filter(phone=owner_phone).first()
    if not owner_record:
        owner_record = ClinicClientRecord.objects.create(
            clinic=clinic,
            full_name=owner_name or 'عميل غير محدد',
            email=owner_email,
            phone=owner_phone,
        )

    breed = getattr(pet, 'breed', None)
    gender = getattr(pet, 'gender', '') or ''
    if gender == 'M':
        gender = 'male'
    elif gender == 'F':
        gender = 'female'

    return ClinicPatientRecord.objects.create(
        clinic=clinic,
        owner=owner_record,
        name=pet.name,
        species=getattr(pet, 'pet_type', '') or 'غير محدد',
        breed=getattr(breed, 'name', '') or '',
        age_months=getattr(pet, 'age_months', None),
        age_text=getattr(pet, 'age_display', '') or '',
        gender=gender,
        linked_user=linked_user,
        linked_pet=pet,
        status='active',
    )


def _point_from_coordinates(latitude, longitude):
    if latitude in (None, '') or longitude in (None, ''):
        return None
    try:
        lat = float(latitude)
        lng = float(longitude)
    except (TypeError, ValueError):
        return None
    if lat < -90 or lat > 90 or lng < -180 or lng > 180:
        return None
    return Point(lng, lat, srid=4326)


class ClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'description', 'address', 'phone', 'emergency_phone',
            'whatsapp_phone', 'email', 'website', 'logo', 'opening_hours', 'services', 'storefront_primary_color',
            'latitude', 'longitude', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def create(self, validated_data):
        if 'latitude' in validated_data or 'longitude' in validated_data:
            lat = validated_data.get('latitude')
            lng = validated_data.get('longitude')
            validated_data['location_point'] = _point_from_coordinates(lat, lng)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        location_point = validated_data.get('location_point')
        if location_point is not None:
            validated_data['latitude'] = location_point.y
            validated_data['longitude'] = location_point.x
        elif 'latitude' in validated_data or 'longitude' in validated_data:
            lat = validated_data.get('latitude', instance.latitude)
            lng = validated_data.get('longitude', instance.longitude)
            validated_data['location_point'] = _point_from_coordinates(lat, lng)
        return super().update(instance, validated_data)


class ClinicPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'description', 'address', 'phone', 'whatsapp_phone',
            'email', 'website', 'logo', 'opening_hours', 'services', 'storefront_primary_color'
        ]
        read_only_fields = fields


class ClinicListSerializer(serializers.ModelSerializer):
    has_dashboard = serializers.SerializerMethodField()
    service_categories = serializers.SerializerMethodField()

    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'description', 'address', 'phone', 'whatsapp_phone', 'email', 'website',
            'logo', 'opening_hours', 'services', 'storefront_primary_color',
            'latitude', 'longitude', 'is_active', 'has_dashboard', 'service_categories',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_has_dashboard(self, obj):
        staff_count = getattr(obj, 'staff_count', None)
        if staff_count is None:
            staff_count = obj.staff_members.count()
        return bool(obj.owner_id or staff_count)

    def get_service_categories(self, obj):
        services = getattr(obj, '_prefetched_objects_cache', {}).get('services_list')
        if services is None:
            services = obj.services_list.filter(is_active=True).only('category')
        categories = {service.category for service in services if service.category}
        if not categories:
            return []
        ordered = [choice[0] for choice in ClinicService.CATEGORY_CHOICES]
        return [key for key in ordered if key in categories]


class ClinicMapPointSerializer(serializers.ModelSerializer):
    """Lightweight serializer for clinic map markers."""
    service_categories = serializers.SerializerMethodField()
    has_dashboard = serializers.SerializerMethodField()
    distance = serializers.SerializerMethodField()
    distance_display = serializers.SerializerMethodField()
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()

    def _distance_km(self, obj):
        distance_value = getattr(obj, 'map_distance_m', None)
        if distance_value is None:
            return None
        try:
            distance_meters = float(getattr(distance_value, 'm', distance_value))
        except (TypeError, ValueError):
            return None
        return round(distance_meters / 1000.0, 2)

    def get_distance(self, obj):
        return self._distance_km(obj)

    def get_distance_display(self, obj):
        distance_km = self._distance_km(obj)
        if distance_km is None:
            return None
        if distance_km < 1:
            return f"{int(distance_km * 1000)} متر"
        if distance_km < 100:
            return f"{distance_km:.1f} كم"
        return f"{int(distance_km)} كم"

    def get_latitude(self, obj):
        value = getattr(obj, 'map_latitude', None)
        if value is None:
            value = obj.latitude
        return float(value) if value is not None else None

    def get_longitude(self, obj):
        value = getattr(obj, 'map_longitude', None)
        if value is None:
            value = obj.longitude
        return float(value) if value is not None else None

    def get_service_categories(self, obj):
        services = getattr(obj, '_prefetched_objects_cache', {}).get('services_list')
        if services is None:
            services = obj.services_list.filter(is_active=True).only('category')
        categories = {service.category for service in services if service.category}
        if not categories:
            return []
        ordered = [choice[0] for choice in ClinicService.CATEGORY_CHOICES]
        return [key for key in ordered if key in categories]

    def get_has_dashboard(self, obj):
        staff_count = getattr(obj, 'staff_count', None)
        if staff_count is None:
            staff_count = obj.staff_members.count()
        return bool(obj.owner_id or staff_count)

    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'address', 'city', 'phone', 'whatsapp_phone', 'email',
            'logo', 'opening_hours', 'services', 'storefront_primary_color',
            'latitude', 'longitude', 'is_active',
            'has_dashboard', 'service_categories', 'distance', 'distance_display',
        ]
        read_only_fields = fields


class ClinicStaffSerializer(serializers.ModelSerializer):
    user_full_name = serializers.SerializerMethodField()
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = ClinicStaff
        fields = [
            'id', 'user', 'user_full_name', 'user_email', 'clinic',
            'role', 'is_primary', 'invitation_email', 'created_at'
        ]
        read_only_fields = ['id', 'clinic', 'created_at', 'user_full_name', 'user_email']

    def get_user_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.email


class VeterinarianSerializer(serializers.ModelSerializer):
    """Serializer for veterinarian staff members"""
    id = serializers.CharField(read_only=True)
    user = serializers.IntegerField(source='user.id', read_only=True)
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    avatar = serializers.SerializerMethodField()
    join_date = serializers.DateTimeField(source='created_at', read_only=True)
    
    class Meta:
        model = ClinicStaff
        fields = [
            'id', 'user', 'name', 'email', 'phone', 'avatar', 'role', 
            'is_primary', 'join_date', 'created_at'
        ]
        read_only_fields = ['id', 'name', 'email', 'phone', 'avatar', 'join_date', 'created_at']

    def get_name(self, obj):
        return obj.user.get_full_name() or obj.user.email

    def get_avatar(self, obj):
        name = obj.user.get_full_name() or obj.user.email
        if name:
            parts = name.split()
            if len(parts) >= 2:
                return f"{parts[0][0]}{parts[1][0]}".upper()
            return name[:2].upper()
        return "V"


class ServicePricingTierSerializer(serializers.ModelSerializer):
    """Serializer for service pricing tiers"""
    tier_size_display = serializers.CharField(source='get_tier_size_display', read_only=True)
    
    class Meta:
        model = ServicePricingTier
        fields = [
            'id', 'service', 'tier_name', 'tier_size', 'tier_size_display',
            'weight_range', 'price', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'service', 'tier_size_display', 'created_at', 'updated_at']


class ClinicServiceSerializer(serializers.ModelSerializer):
    """Enhanced service serializer with pet types and tiered pricing"""
    pricing_tiers = ServicePricingTierSerializer(many=True, read_only=True)
    price_range = serializers.SerializerMethodField()
    pet_type_display = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    clear_service_image = serializers.BooleanField(write_only=True, required=False, default=False)
    
    class Meta:
        model = ClinicService
        fields = [
            'id', 'clinic', 'name', 'description', 'category', 'category_display',
            'applicable_pet_types', 'pet_type_display',
            'base_price', 'currency', 'has_tiered_pricing', 'pricing_tiers', 'price_range',
            'pricing_unit', 'min_duration_units',
            'duration_minutes', 'requires_appointment',
            'is_active', 'is_featured', 'display_order',
            'service_icon', 'service_image', 'clear_service_image',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'pricing_tiers', 'price_range', 
                           'category_display', 'pet_type_display', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        """Normalize empty optional multipart fields before DRF field validation."""
        if hasattr(data, 'copy'):
            data = data.copy()
        elif isinstance(data, dict):
            data = dict(data)

        if hasattr(data, 'get'):
            if data.get('min_duration_units') == '':
                data.pop('min_duration_units', None)

            service_image = data.get('service_image')
            if service_image == '' or (
                service_image is not None and getattr(service_image, 'size', None) == 0
            ):
                data.pop('service_image', None)

        return super().to_internal_value(data)
    
    def get_price_range(self, obj):
        """Get price range for display"""
        return obj.price_range
    
    def get_pet_type_display(self, obj):
        """Get human-readable pet types"""
        return obj.pet_type_display


    def validate_applicable_pet_types(self, value):
        """Ensure at least one pet type is selected"""
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                raise serializers.ValidationError("صيغة أنواع الحيوانات غير صالحة")

        if not value or len(value) == 0:
            raise serializers.ValidationError("يجب اختيار نوع حيوان واحد على الأقل")
        
        # Ensure all values are valid
        valid_types = [choice[0] for choice in ClinicService.PET_TYPE_CHOICES]
        for pet_type in value:
            if pet_type not in valid_types:
                raise serializers.ValidationError(f"نوع الحيوان غير صالح: {pet_type}")
        
        return value

    def validate_currency(self, value):
        return validate_iso_currency(value)

    def validate_min_duration_units(self, value):
        if value is not None and value < 1:
            raise serializers.ValidationError("الحد الأدنى للمدة يجب أن يكون رقمًا موجبًا")
        return value

    def create(self, validated_data):
        validated_data.pop('clear_service_image', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        clear_service_image = validated_data.pop('clear_service_image', False)
        if clear_service_image and instance.service_image:
            instance.service_image.delete(save=False)
            instance.service_image = None
        return super().update(instance, validated_data)


def normalize_provider_whatsapp(value):
    digits = ''.join(character for character in str(value or '') if character.isdigit())
    if digits.startswith('00'):
        digits = digits[2:]
    if digits.startswith('01') and len(digits) == 11:
        digits = f"20{digits[1:]}"
    if len(digits) < 8 or len(digits) > 15:
        raise serializers.ValidationError('أدخل رقم واتساب صحيحاً')
    return digits


class ProviderServiceRequestMobileSerializer(serializers.ModelSerializer):
    reference = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    existing_clinic_name = serializers.CharField(source='existing_clinic.name', read_only=True)
    converted_clinic_name = serializers.CharField(source='converted_clinic.name', read_only=True)

    class Meta:
        model = ProviderServiceRequest
        fields = [
            'public_id', 'reference', 'request_kind', 'existing_clinic',
            'existing_clinic_name', 'business_name', 'whatsapp_phone',
            'service_groups', 'address', 'latitude', 'longitude', 'status',
            'status_label', 'converted_clinic', 'converted_clinic_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ProviderServiceRequestCreateSerializer(serializers.ModelSerializer):
    consent = serializers.BooleanField(write_only=True)

    class Meta:
        model = ProviderServiceRequest
        fields = [
            'request_kind', 'existing_clinic', 'business_name', 'whatsapp_phone',
            'service_groups', 'address', 'latitude', 'longitude', 'consent',
        ]
        extra_kwargs = {'business_name': {'required': False}}

    def validate_service_groups(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError('اختر نوع خدمة واحداً على الأقل')
        normalized = list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))
        invalid = [item for item in normalized if item not in MARKETPLACE_SERVICE_GROUPS]
        if invalid:
            raise serializers.ValidationError('توجد فئة خدمة غير مدعومة')
        return normalized

    def validate_whatsapp_phone(self, value):
        normalize_provider_whatsapp(value)
        return value.strip()

    def validate_consent(self, value):
        if value is not True:
            raise serializers.ValidationError('يجب الموافقة على التواصل وتمثيل النشاط')
        return value

    def validate(self, attrs):
        request_kind = attrs.get('request_kind')
        existing_clinic = attrs.get('existing_clinic')
        if request_kind == ProviderServiceRequest.REQUEST_EXISTING_LISTING:
            if not existing_clinic or not existing_clinic.is_active:
                raise serializers.ValidationError({
                    'existing_clinic': 'اختر نشاطاً منشوراً على Petow',
                })
            attrs['business_name'] = existing_clinic.name
        elif existing_clinic:
            raise serializers.ValidationError({
                'existing_clinic': 'لا يمكن ربط نشاط موجود بطلب نشاط جديد',
            })
        elif len((attrs.get('business_name') or '').strip()) < 2:
            raise serializers.ValidationError({
                'business_name': 'أدخل اسم النشاط',
            })

        latitude = attrs.get('latitude')
        longitude = attrs.get('longitude')
        if latitude is not None and not -90 <= latitude <= 90:
            raise serializers.ValidationError({'latitude': 'خط العرض غير صالح'})
        if longitude is not None and not -180 <= longitude <= 180:
            raise serializers.ValidationError({'longitude': 'خط الطول غير صالح'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('consent', None)
        validated_data['requester'] = self.context['request'].user
        validated_data['normalized_whatsapp'] = normalize_provider_whatsapp(
            validated_data['whatsapp_phone'],
        )
        validated_data['consented_at'] = timezone.now()
        return super().create(validated_data)


class ProviderServiceRequestAdminSerializer(serializers.ModelSerializer):
    reference = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    requester_name = serializers.SerializerMethodField()
    requester_email = serializers.EmailField(source='requester.email', read_only=True)
    requester_phone = serializers.CharField(source='requester.phone', read_only=True)
    existing_clinic_name = serializers.CharField(source='existing_clinic.name', read_only=True)
    converted_clinic_name = serializers.CharField(source='converted_clinic.name', read_only=True)

    class Meta:
        model = ProviderServiceRequest
        fields = [
            'id', 'public_id', 'reference', 'requester', 'requester_name',
            'requester_email', 'requester_phone', 'request_kind', 'existing_clinic',
            'existing_clinic_name', 'business_name', 'whatsapp_phone',
            'normalized_whatsapp', 'service_groups', 'address', 'latitude',
            'longitude', 'consented_at', 'status', 'status_label', 'close_reason',
            'internal_notes', 'possible_duplicate', 'converted_clinic',
            'converted_clinic_name', 'contacted_at', 'converted_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'public_id', 'reference', 'requester', 'requester_name',
            'requester_email', 'requester_phone', 'request_kind', 'existing_clinic',
            'existing_clinic_name', 'business_name', 'whatsapp_phone',
            'normalized_whatsapp', 'service_groups', 'address', 'latitude',
            'longitude', 'consented_at', 'status_label', 'possible_duplicate',
            'converted_clinic_name', 'contacted_at', 'converted_at',
            'created_at', 'updated_at',
        ]

    def get_requester_name(self, obj):
        return obj.requester.get_full_name() or obj.requester.email

    def validate(self, attrs):
        next_status = attrs.get('status', self.instance.status)
        allowed_transitions = {
            ProviderServiceRequest.STATUS_NEW: {
                ProviderServiceRequest.STATUS_NEW,
                ProviderServiceRequest.STATUS_CONTACTED,
                ProviderServiceRequest.STATUS_QUALIFIED,
                ProviderServiceRequest.STATUS_CLOSED,
            },
            ProviderServiceRequest.STATUS_CONTACTED: {
                ProviderServiceRequest.STATUS_CONTACTED,
                ProviderServiceRequest.STATUS_QUALIFIED,
                ProviderServiceRequest.STATUS_CLOSED,
            },
            ProviderServiceRequest.STATUS_QUALIFIED: {
                ProviderServiceRequest.STATUS_QUALIFIED,
                ProviderServiceRequest.STATUS_CONTACTED,
                ProviderServiceRequest.STATUS_CONVERTED,
                ProviderServiceRequest.STATUS_CLOSED,
            },
            ProviderServiceRequest.STATUS_CONVERTED: {
                ProviderServiceRequest.STATUS_CONVERTED,
            },
            ProviderServiceRequest.STATUS_CLOSED: {
                ProviderServiceRequest.STATUS_CLOSED,
                ProviderServiceRequest.STATUS_NEW,
                ProviderServiceRequest.STATUS_CONTACTED,
            },
        }
        if next_status not in allowed_transitions.get(self.instance.status, set()):
            raise serializers.ValidationError({'status': 'انتقال حالة الطلب غير مسموح'})
        converted_clinic = attrs.get('converted_clinic', self.instance.converted_clinic)
        if next_status == ProviderServiceRequest.STATUS_CONVERTED:
            if not converted_clinic or not converted_clinic.is_active:
                raise serializers.ValidationError({
                    'converted_clinic': 'اربط الطلب بنشاط فعال قبل التحويل',
                })
            categories = {
                category
                for group_key in self.instance.service_groups
                for category in MARKETPLACE_SERVICE_GROUPS.get(group_key, {}).get('categories', ())
            }
            has_requested_service = converted_clinic.services_list.filter(
                is_active=True,
                category__in=categories,
            ).exists()
            if not has_requested_service:
                raise serializers.ValidationError({
                    'status': 'أضف خدمة فعالة ضمن الفئات المطلوبة قبل التحويل',
                })
        if next_status == ProviderServiceRequest.STATUS_CLOSED and not attrs.get(
            'close_reason', self.instance.close_reason
        ):
            raise serializers.ValidationError({'close_reason': 'سبب الإغلاق مطلوب'})
        return attrs

    def update(self, instance, validated_data):
        previous_status = instance.status
        instance = super().update(instance, validated_data)
        update_fields = []
        if instance.status == ProviderServiceRequest.STATUS_CONTACTED and not instance.contacted_at:
            instance.contacted_at = timezone.now()
            update_fields.append('contacted_at')
        if instance.status == ProviderServiceRequest.STATUS_CONVERTED and not instance.converted_at:
            instance.converted_at = timezone.now()
            update_fields.append('converted_at')
        if previous_status == ProviderServiceRequest.STATUS_CLOSED and instance.status != previous_status:
            instance.close_reason = ''
            update_fields.append('close_reason')
        if update_fields:
            instance.save(update_fields=[*update_fields, 'updated_at'])
        return instance


class MarketplaceServiceSerializer(serializers.ModelSerializer):
    """Service-first public marketplace row with embedded clinic summary."""

    category_display = serializers.CharField(source='get_category_display', read_only=True)
    price_range = serializers.SerializerMethodField()
    group = serializers.SerializerMethodField()
    group_display = serializers.SerializerMethodField()
    distance = serializers.SerializerMethodField()
    distance_display = serializers.SerializerMethodField()
    clinic = serializers.SerializerMethodField()

    class Meta:
        model = ClinicService
        fields = [
            'id', 'name', 'description', 'category', 'category_display',
            'group', 'group_display', 'applicable_pet_types',
            'base_price', 'currency', 'price_range', 'pricing_unit', 'min_duration_units',
            'duration_minutes', 'requires_appointment', 'is_featured', 'display_order',
            'service_icon', 'service_image', 'distance', 'distance_display', 'clinic',
        ]
        read_only_fields = fields

    def get_price_range(self, obj):
        min_price = getattr(obj, 'marketplace_min_price', None)
        max_price = getattr(obj, 'marketplace_max_price', None)
        if obj.has_tiered_pricing and min_price is not None and max_price is not None:
            if min_price == max_price:
                return str(min_price)
            return f"{min_price}-{max_price}"
        return str(obj.base_price)

    def _group_key(self, obj):
        return get_marketplace_group_for_category(obj.category)

    def get_group(self, obj):
        return self._group_key(obj)

    def get_group_display(self, obj):
        group_key = self._group_key(obj)
        groups = self.context.get('marketplace_groups', MARKETPLACE_SERVICE_GROUPS)
        if group_key and group_key in groups:
            return groups[group_key].get('label')
        return obj.get_category_display()

    def _distance_km(self, obj):
        distance_value = getattr(obj, 'marketplace_distance_m', None)
        if distance_value is None:
            return None
        try:
            distance_meters = float(getattr(distance_value, 'm', distance_value))
        except (TypeError, ValueError):
            return None
        return round(distance_meters / 1000.0, 2)

    def get_distance(self, obj):
        return self._distance_km(obj)

    def get_distance_display(self, obj):
        distance_km = self._distance_km(obj)
        if distance_km is None:
            return None
        if distance_km < 1:
            return f"{int(distance_km * 1000)} متر"
        if distance_km < 100:
            return f"{distance_km:.1f} كم"
        return f"{int(distance_km)} كم"

    def _image_url(self, image_field):
        if not image_field:
            return None
        try:
            url = image_field.url
        except ValueError:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def get_clinic(self, obj):
        clinic = obj.clinic
        return {
            'id': clinic.id,
            'name': clinic.name,
            'description': clinic.description,
            'address': clinic.address,
            'phone': clinic.phone,
            'whatsapp_phone': clinic.whatsapp_phone,
            'email': clinic.email,
            'website': clinic.website,
            'logo': self._image_url(clinic.logo),
            'opening_hours': clinic.opening_hours,
            'services': clinic.services,
            'storefront_primary_color': clinic.storefront_primary_color,
            'latitude': float(clinic.latitude) if clinic.latitude is not None else None,
            'longitude': float(clinic.longitude) if clinic.longitude is not None else None,
            'distance': self.get_distance(obj),
            'distance_display': self.get_distance_display(obj),
            'has_dashboard': bool(clinic.owner_id or getattr(obj, 'has_staff', False)),
        }


class ClinicProductSerializer(serializers.ModelSerializer):
    """Serializer for clinic storefront products"""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    image = serializers.SerializerMethodField()
    product_image = serializers.ImageField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = ClinicProduct
        fields = [
            'id', 'clinic', 'name', 'description', 'category', 'category_display',
            'price', 'currency', 'cost_price', 'stock_quantity', 'sku', 'low_stock_threshold',
            'is_active', 'images', 'image', 'product_image',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'category_display', 'image', 'created_at', 'updated_at']

    def _save_product_image(self, uploaded_file):
        filename = get_valid_filename(getattr(uploaded_file, 'name', '') or 'product.jpg')
        path = default_storage.save(f"products/{uuid.uuid4()}-{filename}", uploaded_file)
        return default_storage.url(path)

    def get_image(self, obj):
        if isinstance(obj.images, list) and obj.images:
            image = obj.images[0]
            if isinstance(image, str) and image.startswith('/'):
                request = self.context.get('request')
                return request.build_absolute_uri(image) if request else image
            return image
        return None

    def validate_currency(self, value):
        return validate_iso_currency(value)

    def create(self, validated_data):
        product_image = validated_data.pop('product_image', None)
        instance = super().create(validated_data)
        if product_image:
            instance.images = [self._save_product_image(product_image)]
            instance.save(update_fields=['images', 'updated_at'])
        return instance

    def update(self, instance, validated_data):
        product_image = validated_data.pop('product_image', None)
        instance = super().update(instance, validated_data)
        if product_image:
            instance.images = [self._save_product_image(product_image)]
            instance.save(update_fields=['images', 'updated_at'])
        return instance


class StorefrontOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_image = serializers.SerializerMethodField()

    class Meta:
        model = StorefrontOrderItem
        fields = [
            'id', 'product', 'product_name', 'product_image',
            'quantity', 'unit_price', 'line_total'
        ]
        read_only_fields = fields

    def get_product_image(self, obj):
        if isinstance(obj.product.images, list) and obj.product.images:
            return obj.product.images[0]
        return None


class StorefrontOrderItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class StorefrontOrderSerializer(serializers.ModelSerializer):
    items = StorefrontOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = StorefrontOrder
        fields = [
            'public_id', 'clinic', 'customer_name', 'customer_phone', 'customer_email',
            'delivery_address', 'notes', 'status', 'total_amount', 'currency', 'created_at', 'items'
        ]
        read_only_fields = ['public_id', 'clinic', 'status', 'total_amount', 'currency', 'created_at', 'items']


class StorefrontBookingProposalSerializer(serializers.ModelSerializer):
    proposed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StorefrontBookingProposal
        fields = [
            'id', 'booking', 'proposed_date', 'proposed_time', 'duration_minutes',
            'note', 'status', 'proposed_by', 'proposed_by_name', 'created_at', 'responded_at'
        ]
        read_only_fields = [
            'id', 'booking', 'status', 'proposed_by', 'proposed_by_name', 'created_at', 'responded_at'
        ]

    def get_proposed_by_name(self, obj):
        user = getattr(obj, 'proposed_by', None)
        if not user:
            return ''
        return user.get_full_name() or user.email or ''


class StorefrontBookingTimelineSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = StorefrontBookingTimeline
        fields = ['id', 'event_type', 'message', 'actor', 'actor_name', 'created_at']
        read_only_fields = fields

    def get_actor_name(self, obj):
        actor = getattr(obj, 'actor', None)
        if not actor:
            return ''
        return actor.get_full_name() or actor.email or ''


class StorefrontBookingSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    latest_proposal = serializers.SerializerMethodField()
    proposals = serializers.SerializerMethodField()
    confirmed_appointment = serializers.SerializerMethodField()
    pet_photo_url = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    assigned_staff_name = serializers.SerializerMethodField()
    linked_patient_summary = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()

    class Meta:
        model = StorefrontBooking
        fields = [
            'public_id', 'clinic', 'service', 'service_name', 'customer_user',
            'customer_name', 'customer_phone', 'customer_email',
            'pet_name', 'pet_type', 'pet_breed', 'pet_age', 'pet_photo', 'pet_photo_url',
            'preferred_date', 'preferred_time',
            'notes', 'request_type', 'source', 'contact_channel',
            'status', 'quoted_price', 'quoted_currency', 'confirmed_appointment', 'latest_proposal', 'proposals',
            'cancelled_reason', 'confirmed_at', 'cancelled_at', 'completed_at', 'created_at',
            'status_display', 'assigned_staff', 'assigned_staff_name', 'internal_notes',
            'doctor_notes', 'diagnosis', 'treatment', 'price_estimate', 'completed_result',
            'linked_patient', 'linked_patient_summary', 'timeline',
        ]
        read_only_fields = [
            'public_id', 'clinic', 'customer_user', 'status', 'quoted_price', 'quoted_currency', 'created_at',
            'service_name', 'latest_proposal', 'proposals', 'confirmed_appointment', 'pet_photo_url',
            'cancelled_reason', 'confirmed_at', 'cancelled_at', 'completed_at',
            'status_display', 'assigned_staff_name', 'linked_patient_summary', 'timeline',
        ]

    def get_pet_photo_url(self, obj):
        if not obj.pet_photo:
            return None
        request = self.context.get('request')
        url = obj.pet_photo.url
        return request.build_absolute_uri(url) if request else url

    def get_latest_proposal(self, obj):
        proposal = obj.proposals.order_by('-created_at').first()
        if not proposal:
            return None
        return StorefrontBookingProposalSerializer(proposal, context=self.context).data

    def get_proposals(self, obj):
        proposals = obj.proposals.order_by('-created_at')[:10]
        return StorefrontBookingProposalSerializer(proposals, many=True, context=self.context).data

    def get_confirmed_appointment(self, obj):
        appointment = getattr(obj, 'confirmed_appointment', None)
        if not appointment:
            return None
        return {
            'id': appointment.id,
            'scheduled_date': appointment.scheduled_date,
            'scheduled_time': appointment.scheduled_time,
            'status': appointment.status,
            'reason': appointment.reason,
        }

    def get_assigned_staff_name(self, obj):
        user = getattr(obj, 'assigned_staff', None)
        if not user:
            return ''
        return user.get_full_name() or user.email or ''

    def get_linked_patient_summary(self, obj):
        patient = getattr(obj, 'linked_patient', None)
        if not patient:
            return None
        return {
            'id': patient.id,
            'name': patient.name,
            'species': patient.species,
            'breed': patient.breed or '',
            'owner_name': patient.owner.full_name if patient.owner_id else '',
        }

    def get_timeline(self, obj):
        events = obj.timeline_events.select_related('actor').order_by('created_at')[:30]
        return StorefrontBookingTimelineSerializer(events, many=True, context=self.context).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['status'] = normalize_booking_status(data.get('status'))
        return data


class StorefrontBookingUpdateSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)

    class Meta:
        model = StorefrontBooking
        fields = [
            'public_id', 'clinic', 'service', 'service_name', 'customer_user',
            'customer_name', 'customer_phone', 'customer_email',
            'pet_name', 'pet_type', 'pet_breed', 'pet_age', 'pet_photo', 'preferred_date', 'preferred_time',
            'notes', 'request_type', 'source', 'contact_channel',
            'status', 'quoted_price', 'quoted_currency', 'cancelled_reason', 'confirmed_at', 'cancelled_at', 'completed_at', 'created_at'
        ]
        read_only_fields = [
            'public_id', 'clinic', 'service', 'service_name', 'customer_user',
            'customer_name', 'customer_phone', 'customer_email',
            'pet_name', 'pet_type', 'pet_breed', 'pet_age', 'pet_photo', 'preferred_date', 'preferred_time',
            'notes', 'request_type', 'source', 'contact_channel', 'quoted_price', 'quoted_currency',
            'cancelled_reason', 'confirmed_at', 'cancelled_at', 'completed_at', 'created_at'
        ]

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        else:
            data = dict(data)
        if data.get('status'):
            data['status'] = normalize_booking_status(data['status'])
        return super().to_internal_value(data)


class StorefrontBookingProposalCreateSerializer(serializers.Serializer):
    proposed_date = serializers.DateField()
    proposed_time = serializers.TimeField()
    duration_minutes = serializers.IntegerField(min_value=5, max_value=480, required=False)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StorefrontBookingAcceptSerializer(serializers.Serializer):
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    scheduled_time = serializers.TimeField(required=False, allow_null=True)
    duration_minutes = serializers.IntegerField(min_value=5, max_value=480, required=False)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StorefrontBookingRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StorefrontBookingNoteSerializer(serializers.Serializer):
    note = serializers.CharField(allow_blank=False, trim_whitespace=True)
    visibility = serializers.ChoiceField(
        choices=['internal', 'doctor', 'owner'],
        required=False,
        default='internal',
    )


class StorefrontBookingAssignSerializer(serializers.Serializer):
    staff_id = serializers.IntegerField(required=False, allow_null=True)


class StorefrontBookingPatientLinkSerializer(serializers.Serializer):
    patient_id = serializers.IntegerField(required=False, allow_null=True)


class StorefrontBookingScheduleSerializer(StorefrontBookingAcceptSerializer):
    pass


class StorefrontBookingCompleteSerializer(serializers.Serializer):
    completed_result = serializers.ChoiceField(
        choices=[choice[0] for choice in StorefrontBooking.COMPLETED_RESULT_CHOICES],
        required=False,
        default='visit_completed',
    )
    internal_notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    doctor_notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    diagnosis = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    treatment = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    price_estimate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    next_appointment = serializers.DateField(required=False, allow_null=True)


class VeterinarySessionSerializer(serializers.ModelSerializer):
    appointment_id = serializers.IntegerField(source='appointment.id', read_only=True)
    clinic_id = serializers.IntegerField(source='clinic.id', read_only=True)
    pet_id = serializers.IntegerField(source='pet.id', read_only=True, allow_null=True)
    pet_name = serializers.SerializerMethodField()
    owner_id = serializers.IntegerField(source='owner.id', read_only=True, allow_null=True)
    owner_name = serializers.SerializerMethodField()
    clinic_patient_id = serializers.IntegerField(source='clinic_patient.id', read_only=True, allow_null=True)
    care_provider = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
    )
    care_provider_name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = VeterinarySession
        fields = [
            'id', 'appointment', 'appointment_id', 'clinic_id', 'clinic_patient_id',
            'pet_id', 'pet_name', 'owner_id', 'owner_name', 'care_provider',
            'care_provider_name', 'session_date', 'session_started_at', 'session_ended_at',
            'service_type', 'main_complaint', 'symptoms', 'symptoms_duration',
            'owner_notes', 'previous_treatment', 'current_medications', 'allergies',
            'vitals', 'physical_exam', 'physical_exam_notes', 'diagnosis',
            'provisional_diagnosis', 'case_severity', 'doctor_notes',
            'services_performed', 'medications', 'lab_tests_requested',
            'imaging_requested', 'attachments', 'home_care_instructions',
            'food_instructions', 'warning_signs', 'follow_up_needed',
            'next_appointment_date', 'owner_summary_sent_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'appointment', 'clinic_id', 'clinic_patient_id', 'pet_id',
            'pet_name', 'owner_id', 'owner_name',
            'session_date', 'session_started_at', 'session_ended_at',
            'owner_summary_sent_at', 'created_at', 'updated_at',
        ]

    def get_pet_name(self, obj):
        if obj.pet:
            return obj.pet.name or ''
        if obj.clinic_patient:
            return obj.clinic_patient.name or ''
        return ''

    def get_owner_name(self, obj):
        if obj.owner:
            return obj.owner.get_full_name() or obj.owner.email or ''
        if obj.clinic_patient and obj.clinic_patient.owner:
            return obj.clinic_patient.owner.full_name or obj.clinic_patient.owner.email or ''
        return ''

    def validate_care_provider(self, value):
        if value is None:
            return value
        clinic = self.context.get('clinic') or getattr(self.instance, 'clinic', None)
        if not clinic:
            raise serializers.ValidationError('تعذر تحديد العيادة.')
        exists = ClinicStaff.objects.filter(
            clinic=clinic,
            user=value,
            role='veterinarian',
        ).exists()
        if not exists:
            raise serializers.ValidationError('الطبيب المحدد لا ينتمي لهذه العيادة.')
        return value

    def update(self, instance, validated_data):
        provider = validated_data.get('care_provider')
        if provider:
            validated_data['care_provider_name'] = (
                validated_data.get('care_provider_name')
                or provider.get_full_name()
                or provider.email
                or ''
            )
        return super().update(instance, validated_data)

    def validate_vitals(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('vitals must be an object.')
        return value

    def validate_physical_exam(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('physical_exam must be an object.')
        return value

    def validate_medications(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('medications must be a list.')
        return value

    def validate_attachments(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('attachments must be a list.')
        return value


class VeterinarySessionEndSerializer(VeterinarySessionSerializer):
    def validate(self, attrs):
        instance = self.instance

        def merged(field, default=''):
            if field in attrs:
                return attrs.get(field) or default
            return getattr(instance, field, default) if instance else default

        vitals = attrs.get('vitals', getattr(instance, 'vitals', {}) if instance else {})
        weight = vitals.get('weight') if isinstance(vitals, dict) else None
        weight_status = weight.get('status') if isinstance(weight, dict) else None
        has_weight = weight_status == 'not_checked' or bool(weight and weight.get('value') not in (None, ''))

        missing = []
        if not (merged('main_complaint') or '').strip():
            missing.append('main_complaint')
        if not has_weight:
            missing.append('vitals.weight')
        if not (merged('physical_exam_notes') or '').strip():
            missing.append('physical_exam_notes')
        if not ((merged('diagnosis') or '').strip() or (merged('provisional_diagnosis') or '').strip()):
            missing.append('diagnosis')
        if not ((merged('services_performed') or '').strip() or merged('medications', [])):
            missing.append('treatment_plan')
        if not (merged('home_care_instructions') or '').strip():
            missing.append('home_care_instructions')
        if missing:
            raise serializers.ValidationError({'required_fields': missing})
        return attrs


class ClinicPatientCompletedSessionSerializer(VeterinarySessionEndSerializer):
    appointment_type = serializers.ChoiceField(
        choices=[choice[0] for choice in VeterinaryAppointment.APPOINTMENT_TYPE_CHOICES],
        required=False,
        default='checkup',
    )
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    scheduled_time = serializers.TimeField(required=False, allow_null=True)

    class Meta(VeterinarySessionEndSerializer.Meta):
        fields = [
            'appointment_type',
            'scheduled_date',
            'scheduled_time',
            *VeterinarySessionEndSerializer.Meta.fields,
        ]

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if not data.get('appointment_type'):
            data['appointment_type'] = 'checkup'
        for key in ('scheduled_date', 'scheduled_time'):
            if data.get(key) in ('', None):
                data.pop(key, None)
        if data.get('next_appointment_date') == '':
            data['next_appointment_date'] = None
        return super().to_internal_value(data)


class StorefrontBookingCreateSerializer(serializers.Serializer):
    service_id = serializers.IntegerField()
    customer_name = serializers.CharField()
    customer_phone = serializers.CharField()
    customer_email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    pet_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    pet_type = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    pet_breed = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    pet_age = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    pet_photo = serializers.ImageField(required=False, allow_null=True)
    preferred_date = serializers.DateField(required=False, allow_null=True)
    preferred_time = serializers.TimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    request_type = serializers.ChoiceField(
        choices=[choice[0] for choice in StorefrontBooking.REQUEST_TYPE_CHOICES],
        required=False,
        default='appointment',
    )
    source = serializers.CharField(required=False, allow_blank=True, default='PetMatch')
    contact_channel = serializers.ChoiceField(
        choices=[choice[0] for choice in StorefrontBooking.CONTACT_CHANNEL_CHOICES],
        required=False,
        default='app',
    )


class ServicePackageSerializer(serializers.ModelSerializer):
    """Serializer for service packages with discounts"""
    services = ClinicServiceSerializer(many=True, read_only=True)
    service_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )
    savings_percentage = serializers.SerializerMethodField()
    
    class Meta:
        model = ServicePackage
        fields = [
            'id', 'clinic', 'name', 'description', 
            'services', 'service_ids',
            'regular_price', 'package_price', 'savings_amount', 'savings_percentage',
            'valid_from', 'valid_until',
            'is_active', 'is_featured',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'savings_amount', 'savings_percentage', 'created_at', 'updated_at']
    
    def get_savings_percentage(self, obj):
        """Get savings percentage"""
        return obj.savings_percentage
    
    def create(self, validated_data):
        service_ids = validated_data.pop('service_ids', [])
        package = ServicePackage.objects.create(**validated_data)
        if service_ids:
            package.services.set(service_ids)
        return package
    
    def update(self, instance, validated_data):
        service_ids = validated_data.pop('service_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if service_ids is not None:
            instance.services.set(service_ids)
        
        return instance


class ClinicPromotionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicPromotion
        fields = [
            'id', 'clinic', 'title', 'description', 'promotion_type',
            'start_date', 'end_date', 'discount_percentage', 'price_after_discount',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'created_at', 'updated_at']


class ClinicMessageSerializer(serializers.ModelSerializer):
    clinic_patient = serializers.PrimaryKeyRelatedField(
        queryset=ClinicPatientRecord.objects.all(),
        required=False,
        allow_null=True
    )
    firebase_chat_id = serializers.SerializerMethodField()
    chat_room_id = serializers.SerializerMethodField()

    class Meta:
        model = ClinicMessage
        fields = [
            'id', 'clinic', 'clinic_patient', 'sender_name', 'sender_email', 'sender_phone',
            'subject', 'message', 'status', 'priority', 'is_internal',
            'firebase_chat_id', 'chat_room_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'firebase_chat_id', 'chat_room_id', 'created_at', 'updated_at']

    def get_firebase_chat_id(self, obj):
        chat_room = getattr(obj, 'chat_room', None)
        return chat_room.firebase_chat_id if chat_room else None

    def get_chat_room_id(self, obj):
        chat_room = getattr(obj, 'chat_room', None)
        return chat_room.id if chat_room else None


class ClinicPatientRecordSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(write_only=True)
    owner_phone = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    owner_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    owner_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    age = serializers.CharField(write_only=True, required=False, allow_blank=True)
    age_months = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=360)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    last_visit = serializers.DateField(required=False, allow_null=True)
    next_appointment = serializers.DateField(required=False, allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    blood_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    photo = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = ClinicPatientRecord
        fields = [
            'id', 'name', 'species', 'breed', 'date_of_birth', 'age', 'age_months', 'gender', 'status',
            'notes', 'owner_name', 'owner_phone', 'owner_email', 'owner_password',
            'last_visit', 'next_appointment', 'weight_kg', 'blood_type', 'photo',
            'linked_user', 'linked_pet', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'linked_user', 'linked_pet', 'created_at', 'updated_at']

    def _get_or_create_user(self, owner_name, owner_phone, owner_email, owner_password):
        """Get or create a User account for the pet owner."""
        from accounts.models import User
        
        # Try to find existing user
        user = None
        if owner_email:
            user = User.objects.filter(email__iexact=owner_email).first()
        if not user and owner_phone:
            user = User.objects.filter(phone=owner_phone).first()
        
        if not user and owner_email:
            # Create new user account (ensure a unique username since AbstractUser keeps a unique username field)
            from django.contrib.auth.hashers import make_password
            import random
            import string
            
            # Generate password if not provided
            password = owner_password if owner_password else ''.join(random.choices(string.ascii_letters + string.digits, k=12))
            
            # Parse name
            name_parts = owner_name.strip().split(' ', 1)
            first_name = name_parts[0] if len(name_parts) > 0 else owner_name
            last_name = name_parts[1] if len(name_parts) > 1 else ''
            
            # Use email as username to satisfy the unique username constraint
            user = User.objects.create(
                username=owner_email,
                email=owner_email,
                phone=owner_phone or '',
                first_name=first_name,
                last_name=last_name,
                password=make_password(password),
                is_phone_verified=False,
            )
        
        return user

    def _get_or_create_owner(self, clinic: Clinic, validated_data):
        full_name = validated_data.pop('owner_name').strip()
        phone = (validated_data.pop('owner_phone', None) or '') or None
        email = (validated_data.pop('owner_email', None) or '').strip() or None
        password = validated_data.pop('owner_password', None)

        owner_qs = ClinicClientRecord.objects.filter(clinic=clinic)
        owner = None
        if email:
            owner = owner_qs.filter(email__iexact=email).first()
        if not owner and phone:
            owner = owner_qs.filter(phone=phone).first()

        if owner:
            updates = {}
            if full_name and owner.full_name != full_name:
                updates['full_name'] = full_name
            if email and owner.email != email:
                updates['email'] = email
            if phone and owner.phone != phone:
                updates['phone'] = phone
            if updates:
                for field, value in updates.items():
                    setattr(owner, field, value)
                owner.save(update_fields=list(updates.keys()) + ['updated_at'])
        else:
            owner = ClinicClientRecord.objects.create(
                clinic=clinic,
                full_name=full_name or 'غير معروف',
                email=email,
                phone=phone,
            )
        
        # Get or create User account if email is provided
        user = None
        if email:
            user = self._get_or_create_user(full_name, phone, email, password)
        
        return owner, user

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        else:
            data = dict(data)
        camel_to_snake = {
            'ownerName': 'owner_name',
            'ownerPhone': 'owner_phone',
            'ownerEmail': 'owner_email',
            'ownerPassword': 'owner_password',
            'lastVisit': 'last_visit',
            'nextAppointment': 'next_appointment',
            'dateOfBirth': 'date_of_birth',
            'ageMonths': 'age_months',
            'weightKg': 'weight_kg',
            'bloodType': 'blood_type',
        }
        for camel, snake in camel_to_snake.items():
            if camel in data and snake not in data:
                data[snake] = data[camel]
        if data.get('status'):
            data['status'] = normalize_appointment_status(data['status'])
        return super().to_internal_value(data)

    def _create_pet_in_main_app(self, patient_data, user):
        """Create a Pet in the main pets table for this clinic patient."""
        from pets.models import Pet, Breed
        
        # Map species name to pet_type
        species_map = {
            'dog': 'dogs',
            'dogs': 'dogs',
            'cat': 'cats',
            'cats': 'cats',
            'bird': 'birds',
            'birds': 'birds',
        }
        pet_type = species_map.get(patient_data.get('species', '').lower(), 'dogs')
        
        # If an exact pet already exists for this owner (same name and type), link it instead of creating a duplicate
        existing_pet = Pet.objects.filter(
            owner=user,
            name__iexact=patient_data.get('name', ''),
            pet_type=pet_type,
        ).first()
        if existing_pet:
            return existing_pet
        
        # Try to find a default breed for this pet type
        breed = Breed.objects.filter(pet_type=pet_type).first()
        if not breed:
            # Create a generic breed if none exists
            breed = Breed.objects.create(
                name=f"{pet_type.title()} - Generic",
                pet_type=pet_type,
                description="Generic breed created by clinic"
            )
        
        # Calculate age in months
        age_months = 12  # Default 1 year
        if patient_data.get('date_of_birth'):
            from datetime import date
            today = date.today()
            dob = patient_data['date_of_birth']
            age_months = max(1, (today.year - dob.year) * 12 + (today.month - dob.month))
        
        # Determine gender
        gender = 'M'  # Default male
        if patient_data.get('gender'):
            gender_str = str(patient_data['gender']).upper()
            if gender_str in ['F', 'FEMALE', 'أنثى']:
                gender = 'F'
        
        # Create the pet
        pet = Pet.objects.create(
            owner=user,
            name=patient_data['name'],
            pet_type=pet_type,
            breed=breed,
            age_months=age_months,
            gender=gender,
            description=f"Added by {self.context['clinic'].name}",
            status='unavailable',  # Clinic-added pets are unavailable for breeding by default
            location=self.context['clinic'].address or 'غير محدد',
            latitude=self.context['clinic'].latitude,
            longitude=self.context['clinic'].longitude,
            is_free=True,
        )
        
        return pet

    def _get_or_create_owner(self, clinic: Clinic, validated_data):
        full_name = validated_data.pop('owner_name').strip()
        phone = (validated_data.pop('owner_phone', None) or '') or None
        email = (validated_data.pop('owner_email', None) or '').strip() or None
        password = validated_data.pop('owner_password', None)

        owner_qs = ClinicClientRecord.objects.filter(clinic=clinic)
        owner = None
        if email:
            owner = owner_qs.filter(email__iexact=email).first()
        if not owner and phone:
            owner = owner_qs.filter(phone=phone).first()

        if owner:
            updates = {}
            if full_name and owner.full_name != full_name:
                updates['full_name'] = full_name
            if email and owner.email != email:
                updates['email'] = email
            if phone and owner.phone != phone:
                updates['phone'] = phone
            if updates:
                for field, value in updates.items():
                    setattr(owner, field, value)
                owner.save(update_fields=list(updates.keys()) + ['updated_at'])
        else:
            owner = ClinicClientRecord.objects.create(
                clinic=clinic,
                full_name=full_name or 'غير معروف',
                email=email,
                phone=phone,
            )
        
        # Get or create User account if email is provided
        user = None
        if email:
            user = self._get_or_create_user(full_name, phone, email, password)
        
        return owner, user

    def create(self, validated_data):
        clinic = self.context['clinic']
        owner, user = self._get_or_create_owner(clinic, validated_data)
        age_value = validated_data.pop('age', None)
        age_months = validated_data.get('age_months')
        dob = validated_data.get('date_of_birth')

        if dob:
            validated_data['age_text'] = _calculate_age_text(dob)
            validated_data['age_months'] = None
        elif age_months is not None:
            validated_data['age_text'] = _format_age_months(age_months)
        elif age_value and isinstance(age_value, str) and age_value.strip():
            validated_data['age_text'] = age_value.strip()
        else:
            validated_data['age_text'] = None

        # Create the clinic patient record
        # Note: Pet will be created when user accepts the invitation
        patient = ClinicPatientRecord.objects.create(
            clinic=clinic,
            owner=owner,
            linked_user=user,  # Link the user immediately if email provided
            **validated_data,
        )
        
        return patient

    def update(self, instance, validated_data):
        clinic = self.context['clinic']
        owner_updated = False
        user_updated = False
        if 'owner_name' in validated_data or 'owner_phone' in validated_data or 'owner_email' in validated_data:
            owner, user = self._get_or_create_owner(clinic, validated_data)
            instance.owner = owner
            owner_updated = True
            
            # Update linked_user if we got a user
            if user and instance.linked_user != user:
                instance.linked_user = user
                user_updated = True

        age_value_present = 'age' in validated_data
        age_value = validated_data.pop('age', None)
        age_months_present = 'age_months' in validated_data
        age_months_value = validated_data.get('age_months')
        dob_present = 'date_of_birth' in validated_data
        dob_value = validated_data.get('date_of_birth')

        if dob_present:
            instance.date_of_birth = dob_value
            instance.age_text = _calculate_age_text(dob_value) if dob_value else None
            if dob_value:
                instance.age_months = None
        elif age_months_present:
            instance.age_months = age_months_value
            instance.age_text = _format_age_months(age_months_value) if age_months_value is not None else None
        elif age_value_present:
            if isinstance(age_value, str) and age_value.strip():
                instance.age_text = age_value.strip()
            else:
                instance.age_text = None

        instance.gender = validated_data.get('gender', instance.gender)
        instance.status = validated_data.get('status', instance.status)
        instance.species = validated_data.get('species', instance.species)
        instance.breed = validated_data.get('breed', instance.breed)
        instance.notes = validated_data.get('notes', instance.notes)
        instance.weight_kg = validated_data.get('weight_kg', instance.weight_kg)
        instance.blood_type = validated_data.get('blood_type', instance.blood_type)
        instance.photo = validated_data.get('photo', instance.photo)
        instance.last_visit = validated_data.get('last_visit', instance.last_visit)
        instance.next_appointment = validated_data.get('next_appointment', instance.next_appointment)
        instance.name = validated_data.get('name', instance.name)
        if owner_updated:
            instance.owner.save(update_fields=['updated_at'])
        instance.save()
        return instance

    def to_representation(self, instance):
        # Compute age with fallbacks: stored age_text -> derived from DOB -> linked pet age_display
        age_value = (
            _format_age_months(instance.age_months)
            or instance.age_text
            or _calculate_age_text(instance.date_of_birth)
            or ''
        )
        if not age_value and getattr(instance, 'linked_pet_id', None):
            pet = getattr(instance, 'linked_pet', None)
            if pet is not None:
                age_value = getattr(pet, 'age_display', '') or age_value

        # Owner phone fallback: clinic owner record -> linked_user phone
        owner_phone = (getattr(instance.owner, 'phone', '') or '')
        if not owner_phone and getattr(instance, 'linked_user', None):
            fallback_phone = getattr(instance.linked_user, 'phone', '') or ''
            if fallback_phone:
                owner_phone = fallback_phone
                # Persist back to clinic owner record for future responses
                try:
                    instance.owner.phone = fallback_phone
                    # Some models have updated_at; ignore if not present
                    instance.owner.save(update_fields=['phone', 'updated_at'])
                except Exception:
                    try:
                        instance.owner.save(update_fields=['phone'])
                    except Exception:
                        pass

        data = {
            'id': str(instance.id),
            'name': instance.name,
            'species': instance.species,
            'breed': instance.breed or '',
            'age': age_value,
            'age_months': instance.age_months,
            'ageMonths': instance.age_months,
            'dateOfBirth': instance.date_of_birth.isoformat() if instance.date_of_birth else None,
            'gender': instance.gender or 'unknown',
            'weight_kg': str(instance.weight_kg) if instance.weight_kg is not None else None,
            'weightKg': str(instance.weight_kg) if instance.weight_kg is not None else None,
            'blood_type': instance.blood_type or '',
            'bloodType': instance.blood_type or '',
            'photo_url': self._absolute_file_url(instance.photo),
            'photoUrl': self._absolute_file_url(instance.photo),
            'ownerName': instance.owner.full_name,
            'ownerPhone': owner_phone,
            'ownerEmail': instance.owner.email or '',
            'owner_display_name': instance.owner.full_name,
            'owner_display_phone': owner_phone,
            'owner_display_email': instance.owner.email or '',
            'status': instance.status,
            'linked_user': instance.linked_user_id,
            'linked_pet': instance.linked_pet_id,
            'lastVisit': instance.last_visit.isoformat() if instance.last_visit else None,
            'nextAppointment': instance.next_appointment.isoformat() if instance.next_appointment else None,
            'notes': instance.notes or '',
            'createdAt': instance.created_at.isoformat(),
            'updatedAt': instance.updated_at.isoformat(),
        }

        # Only include existing pending invite info; do NOT create/resend during serialization
        invite = instance.invites.filter(status=getattr(instance.invites.model, 'STATUS_PENDING', 'pending')).order_by('-created_at').first()

        if invite:
            data.update({
                'inviteToken': str(invite.token),
                'inviteLink': build_invite_link(invite.token),
                'inviteMessage': build_invite_message(invite),
                'inviteStatus': invite.status,
                'inviteCreatedAt': invite.created_at.isoformat(),
            })

        return data

    def _absolute_file_url(self, file_field):
        if not file_field:
            return None
        try:
            url = file_field.url
        except Exception:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url


class ClinicPatientNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClinicPatientNote
        fields = ['id', 'text', 'created_by', 'created_by_name', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at']

    def get_created_by_name(self, obj):
        user = getattr(obj, 'created_by', None)
        if not user:
            return ''
        return user.get_full_name() or user.email or ''


class ClinicPatientDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClinicPatientDocument
        fields = [
            'id', 'title', 'category', 'category_display', 'file', 'file_url', 'notes',
            'issued_at', 'expires_at', 'uploaded_by', 'uploaded_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'file_url', 'category_display', 'uploaded_by', 'uploaded_by_name', 'created_at']

    def get_file_url(self, obj):
        return _absolute_file_url(self.context.get('request'), obj.file)

    def get_uploaded_by_name(self, obj):
        user = getattr(obj, 'uploaded_by', None)
        if not user:
            return ''
        return user.get_full_name() or user.email or ''


def _absolute_file_url(request, file_field):
    if not file_field:
        return None
    try:
        url = file_field.url
    except Exception:
        return None
    return request.build_absolute_uri(url) if request else url


class ClinicPatientProfileSerializer(serializers.Serializer):
    def to_representation(self, instance):
        request = self.context.get('request')
        patient_data = ClinicPatientRecordSerializer(instance, context=self.context).data
        photo_url = patient_data.get('photo_url') or self._linked_pet_file_url(instance, 'main_image')
        weight = patient_data.get('weight_kg')
        blood_type = patient_data.get('blood_type') or ''

        appointments = list(
            instance.clinic_appointments.select_related('owner', 'pet', 'clinic_patient')
            .order_by('-scheduled_date', '-scheduled_time')[:20]
        )
        medical_records = [self._appointment_record(appointment) for appointment in appointments]
        vaccinations = [
            self._appointment_record(appointment)
            for appointment in appointments
            if appointment.appointment_type == 'vaccination'
        ]

        documents = list(instance.documents.select_related('uploaded_by').all()[:50])
        document_data = ClinicPatientDocumentSerializer(
            documents,
            many=True,
            context=self.context,
        ).data
        certificate_files = self._linked_pet_certificate_files(instance)
        vaccination_documents = [
            item for item in document_data if item.get('category') == 'vaccination'
        ]

        notes = ClinicPatientNoteSerializer(
            instance.profile_notes.select_related('created_by').all()[:50],
            many=True,
            context=self.context,
        ).data

        return {
            **patient_data,
            'photo_url': photo_url,
            'photoUrl': photo_url,
            'weight_kg': weight,
            'weightKg': weight,
            'blood_type': blood_type,
            'bloodType': blood_type,
            'stats': {
                'age': patient_data.get('age') or '',
                'weight_kg': weight,
                'gender': patient_data.get('gender') or '',
                'blood_type': blood_type,
            },
            'medical_records': medical_records,
            'vaccinations': vaccinations + vaccination_documents,
            'files': document_data + certificate_files,
            'notes_list': notes,
            'notesList': notes,
        }

    def _appointment_record(self, appointment):
        return {
            'id': appointment.id,
            'source': 'appointment',
            'date': appointment.scheduled_date.isoformat() if appointment.scheduled_date else None,
            'time': appointment.scheduled_time.isoformat() if appointment.scheduled_time else None,
            'title': appointment.get_appointment_type_display(),
            'appointment_type': appointment.appointment_type,
            'status': appointment.status,
            'status_display': appointment.get_status_display(),
            'doctor_name': '',
            'reason': appointment.reason or '',
            'notes': appointment.notes or '',
            'diagnosis': appointment.diagnosis or '',
            'treatment': appointment.treatment or '',
            'next_appointment': appointment.next_appointment.isoformat() if appointment.next_appointment else None,
            'created_at': appointment.created_at.isoformat() if appointment.created_at else None,
        }

    def _linked_pet_file_url(self, instance, field_name):
        pet = getattr(instance, 'linked_pet', None)
        if not pet:
            return None
        return _absolute_file_url(self.context.get('request'), getattr(pet, field_name, None))

    def _linked_pet_certificate_files(self, instance):
        pet = getattr(instance, 'linked_pet', None)
        if not pet:
            return []
        certificate_fields = [
            ('vaccination_certificate', 'vaccination', 'شهادة التطعيم'),
            ('health_certificate', 'certificate', 'الشهادة الصحية'),
            ('disease_free_certificate', 'certificate', 'شهادة خلو من الأمراض'),
            ('additional_certificate', 'certificate', 'شهادة إضافية'),
        ]
        files = []
        for field_name, category, title in certificate_fields:
            file_field = getattr(pet, field_name, None)
            url = _absolute_file_url(self.context.get('request'), file_field)
            if url:
                files.append({
                    'id': f'linked_pet:{field_name}',
                    'title': title,
                    'category': category,
                    'category_display': title,
                    'file': None,
                    'file_url': url,
                    'notes': '',
                    'issued_at': None,
                    'expires_at': None,
                    'uploaded_by': None,
                    'uploaded_by_name': '',
                    'created_at': None,
                    'source': 'linked_pet',
                })
        return files

class ClinicAppointmentSerializer(serializers.ModelSerializer):
    pet_name = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    owner_phone = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source='clinic.name', read_only=True)
    clinic_patient = serializers.PrimaryKeyRelatedField(
        queryset=ClinicPatientRecord.objects.all(),
        required=False,
        allow_null=True,
    )

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        else:
            data = dict(data)
        camel_to_snake = {
            'petId': 'pet',
            'ownerId': 'owner',
            'clinicPatientId': 'clinic_patient',
            'appointmentType': 'appointment_type',
            'scheduledDate': 'scheduled_date',
            'scheduledTime': 'scheduled_time',
            'durationMinutes': 'duration_minutes',
            'duration': 'duration_minutes',
            'paymentStatus': 'payment_status',
            'serviceFee': 'service_fee',
            'nextAppointment': 'next_appointment',
            'date': 'scheduled_date',
            'time': 'scheduled_time',
        }
        for camel, snake in camel_to_snake.items():
            if camel in data and snake not in data:
                data[snake] = data[camel]
        return super().to_internal_value(data)


    class Meta:
        model = VeterinaryAppointment
        fields = [
            'id', 'clinic', 'clinic_name', 'pet', 'pet_name', 'owner', 'owner_name', 'clinic_patient',
            'owner_phone', 'owner_email', 'appointment_type', 'scheduled_date',
            'scheduled_time', 'duration_minutes', 'reason', 'notes', 'status',
            'payment_status', 'service_fee', 'diagnosis', 'treatment',
            'next_appointment', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'clinic', 'clinic_name', 'owner_name', 'owner_phone',
            'owner_email', 'pet_name', 'created_at', 'updated_at'
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['status'] = normalize_appointment_status(data.get('status'))
        return data

    def get_owner_name(self, obj):
        owner = getattr(obj, 'owner', None)
        if owner:
            return owner.get_full_name() or owner.email or ''
        clinic_patient = getattr(obj, 'clinic_patient', None)
        if clinic_patient and clinic_patient.owner:
            return clinic_patient.owner.full_name or clinic_patient.owner.email or ''
        return ''

    def get_owner_phone(self, obj):
        owner = getattr(obj, 'owner', None)
        if owner and getattr(owner, 'phone', None):
            return owner.phone
        clinic_patient = getattr(obj, 'clinic_patient', None)
        if clinic_patient and clinic_patient.owner:
            return clinic_patient.owner.phone or ''
        return ''

    def get_owner_email(self, obj):
        owner = getattr(obj, 'owner', None)
        if owner and getattr(owner, 'email', None):
            return owner.email
        clinic_patient = getattr(obj, 'clinic_patient', None)
        if clinic_patient and clinic_patient.owner:
            return clinic_patient.owner.email or ''
        return ''

    def get_pet_name(self, obj):
        pet = getattr(obj, 'pet', None)
        if pet:
            return pet.name or ''
        clinic_patient = getattr(obj, 'clinic_patient', None)
        if clinic_patient:
            return clinic_patient.name or ''
        return ''

    def validate(self, attrs):
        clinic = self.context.get('clinic')
        instance = getattr(self, 'instance', None)
        clinic_patient = attrs.get('clinic_patient', getattr(instance, 'clinic_patient', None))
        pet = attrs.get('pet', getattr(instance, 'pet', None))
        owner = attrs.get('owner', getattr(instance, 'owner', None))

        if clinic_patient and clinic and clinic_patient.clinic_id != clinic.id:
            raise serializers.ValidationError({'clinic_patient': 'هذا المريض لا ينتمي لهذه العيادة'})

        if (pet is None) ^ (owner is None):
            raise serializers.ValidationError('يجب توفير المالك والحيوان معًا عند الربط.')

        if not clinic_patient and not (pet and owner):
            raise serializers.ValidationError('يجب اختيار مريض أو ربط الموعد بحيوان ومالك.')

        if clinic_patient and pet and owner:
            linked_user_id = getattr(clinic_patient, 'linked_user_id', None)
            linked_pet_id = getattr(clinic_patient, 'linked_pet_id', None)
            if linked_user_id and owner.id != linked_user_id:
                raise serializers.ValidationError({'owner': 'المالك المحدد لا يطابق المالك المرتبط بهذا المريض.'})
            if linked_pet_id and pet.id != linked_pet_id:
                raise serializers.ValidationError({'pet': 'الحيوان المحدد لا يطابق الحيوان المرتبط بهذا المريض.'})

        return attrs

    def create(self, validated_data):
        clinic = self.context['clinic']
        validated_data['clinic'] = clinic
        clinic_patient = validated_data.get('clinic_patient')
        if clinic_patient and not validated_data.get('pet') and not validated_data.get('owner'):
            if clinic_patient.linked_pet_id and clinic_patient.linked_user_id:
                validated_data['pet'] = clinic_patient.linked_pet
                validated_data['owner'] = clinic_patient.linked_user
        if not clinic_patient and validated_data.get('pet'):
            linked_patient = ClinicPatientRecord.objects.filter(
                clinic=clinic,
                linked_pet=validated_data['pet'],
            ).first()
            if linked_patient:
                validated_data['clinic_patient'] = linked_patient
            else:
                validated_data['clinic_patient'] = get_or_create_patient_record_for_pet(
                    clinic,
                    validated_data['pet'],
                    validated_data.get('owner'),
                )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('clinic', None)
        return super().update(instance, validated_data)


class ClinicPatientMedicalRecordCreateSerializer(serializers.Serializer):
    appointment_type = serializers.ChoiceField(choices=VeterinaryAppointment.APPOINTMENT_TYPE_CHOICES)
    scheduled_date = serializers.DateField()
    scheduled_time = serializers.TimeField()
    reason = serializers.CharField(allow_blank=False, trim_whitespace=True)
    notes = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    diagnosis = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    treatment = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    next_appointment = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        clinical_text = [
            attrs.get('notes'),
            attrs.get('diagnosis'),
            attrs.get('treatment'),
        ]
        if not any((value or '').strip() for value in clinical_text):
            raise serializers.ValidationError({
                'non_field_errors': ['أدخل التشخيص أو العلاج أو ملاحظات الزيارة.']
            })
        return attrs


class ClinicClientSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    phone = serializers.CharField(allow_blank=True)
    pet_count = serializers.IntegerField()
    pets = serializers.ListField(child=serializers.DictField(), required=False)
    last_visit = serializers.DateTimeField(allow_null=True)


class ClinicDashboardStatsSerializer(serializers.Serializer):
    todays_appointments = serializers.IntegerField()
    upcoming_appointments = serializers.IntegerField()
    pending_requests = serializers.IntegerField()
    revenue_this_month = serializers.DecimalField(max_digits=10, decimal_places=2)
    clients_count = serializers.IntegerField()
    pets_seen = serializers.IntegerField()
    top_services = serializers.ListField(child=serializers.DictField())
    appointment_trend = serializers.ListField(child=serializers.DictField())
    revenue_trend = serializers.ListField(child=serializers.DictField())
    appointments_by_status = serializers.ListField(child=serializers.DictField())
    recent_messages = serializers.ListField(child=serializers.DictField())


class ClinicRegistrationSerializer(serializers.Serializer):
    LISTING_MODE_DASHBOARD = 'dashboard_account'
    LISTING_MODE_CONTACT = 'contact_only'
    LISTING_MODE_INTERNAL = 'internal_only'
    LISTING_MODE_CHOICES = (
        (LISTING_MODE_DASHBOARD, 'Dashboard account'),
        (LISTING_MODE_CONTACT, 'Mobile contact listing'),
        (LISTING_MODE_INTERNAL, 'Internal only'),
    )

    listing_mode = serializers.ChoiceField(
        choices=LISTING_MODE_CHOICES,
        required=False,
        default=LISTING_MODE_DASHBOARD,
    )
    clinic_name = serializers.CharField(max_length=200)
    clinic_description = serializers.CharField(required=False, allow_blank=True)
    clinic_email = serializers.EmailField(required=False, allow_blank=True)
    clinic_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    clinic_emergency_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    clinic_whatsapp_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    clinic_address = serializers.CharField()
    clinic_opening_hours = serializers.CharField()
    clinic_services = serializers.CharField(required=False, allow_blank=True)
    clinic_website = serializers.URLField(required=False, allow_blank=True)
    clinic_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    clinic_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    owner_first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_email = serializers.EmailField(required=False, allow_blank=True)
    owner_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password1 = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password2 = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_owner_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل")
        return value

    def validate(self, attrs):
        listing_mode = attrs.get('listing_mode') or self.LISTING_MODE_DASHBOARD

        if listing_mode == self.LISTING_MODE_DASHBOARD:
            required_fields = [
                'clinic_email',
                'clinic_phone',
                'clinic_services',
                'owner_first_name',
                'owner_last_name',
                'owner_email',
                'owner_phone',
                'password1',
                'password2',
            ]
            missing = [field for field in required_fields if not attrs.get(field)]
            if missing:
                raise serializers.ValidationError({
                    field: "هذا الحقل مطلوب" for field in missing
                })
        elif listing_mode == self.LISTING_MODE_CONTACT:
            if not attrs.get('clinic_whatsapp_phone'):
                raise serializers.ValidationError({
                    'clinic_whatsapp_phone': "رقم واتساب مطلوب لعيادة بدون حساب لوحة تحكم"
                })
            if attrs.get('clinic_latitude') is None or attrs.get('clinic_longitude') is None:
                raise serializers.ValidationError({
                    'clinic_location': "يجب تحديد موقع العيادة على الخريطة"
                })

        if attrs.get('password1') != attrs.get('password2'):
            raise serializers.ValidationError({'password2': "كلمات المرور غير متطابقة"})
        return attrs

    def create(self, validated_data):
        listing_mode = validated_data.get('listing_mode') or self.LISTING_MODE_DASHBOARD
        if listing_mode in (self.LISTING_MODE_CONTACT, self.LISTING_MODE_INTERNAL):
            clinic = Clinic.objects.create(
                owner=None,
                name=validated_data['clinic_name'],
                description=validated_data.get('clinic_description', ''),
                address=validated_data['clinic_address'],
                phone=validated_data.get('clinic_phone') or validated_data.get('clinic_whatsapp_phone') or '',
                emergency_phone=validated_data.get('clinic_emergency_phone'),
                whatsapp_phone=validated_data.get('clinic_whatsapp_phone'),
                email=validated_data.get('clinic_email') or None,
                website=validated_data.get('clinic_website'),
                opening_hours=validated_data['clinic_opening_hours'],
                services=validated_data.get('clinic_services') or '',
                latitude=validated_data.get('clinic_latitude'),
                longitude=validated_data.get('clinic_longitude'),
                is_active=listing_mode == self.LISTING_MODE_CONTACT,
            )
            return {'clinic': clinic, 'owner': None}

        password = validated_data.pop('password1')
        validated_data.pop('password2', None)

        owner = User.objects.create_user(
            username=validated_data['owner_email'],
            email=validated_data['owner_email'],
            password=password,
            first_name=validated_data['owner_first_name'],
            last_name=validated_data['owner_last_name'],
            phone=validated_data['owner_phone'],
            user_type='clinic_staff',
        )

        clinic = Clinic.objects.create(
            owner=owner,
            name=validated_data['clinic_name'],
            description=validated_data.get('clinic_description', ''),
            address=validated_data['clinic_address'],
            phone=validated_data['clinic_phone'],
            emergency_phone=validated_data.get('clinic_emergency_phone'),
            whatsapp_phone=validated_data.get('clinic_whatsapp_phone'),
            email=validated_data['clinic_email'],
            website=validated_data.get('clinic_website'),
            opening_hours=validated_data['clinic_opening_hours'],
            services=validated_data.get('clinic_services') or '',
            latitude=validated_data.get('clinic_latitude'),
            longitude=validated_data.get('clinic_longitude'),
        )

        # Create owner staff record
        ClinicStaff.objects.create(
            user=owner,
            clinic=clinic,
            role='owner',
            is_primary=True,
            invitation_email=validated_data['owner_email'],
        )

        # Create default veterinarian record for the owner
        ClinicStaff.objects.create(
            user=owner,
            clinic=clinic,
            role='veterinarian',
            is_primary=False,
            invitation_email=validated_data['owner_email'],
        )

        return {'clinic': clinic, 'owner': owner}


class ClinicInviteSerializer(serializers.ModelSerializer):
    """Expose clinic invite details to the mobile app."""

    class Meta:
        model = ClinicInvite
        fields = [
            'id', 'token', 'status', 'clinic', 'patient', 'owner_record',
            'phone', 'email', 'created_at', 'updated_at', 'accepted_at', 'declined_at',
        ]
        read_only_fields = [
            'id', 'token', 'status', 'clinic', 'patient', 'owner_record',
            'phone', 'email', 'created_at', 'updated_at', 'accepted_at', 'declined_at',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop('clinic', None)
        data.pop('patient', None)
        data.pop('owner_record', None)
        data.update({
            'token': str(instance.token),
            'status': instance.status,
            'clinicId': str(instance.clinic_id),
            'clinicName': instance.clinic.name,
            'patientId': str(instance.patient_id),
            'patientName': instance.patient.name,
            'inviteLink': build_invite_link(instance.token),
            'createdAt': instance.created_at.isoformat(),
            'updatedAt': instance.updated_at.isoformat(),
            'acceptedAt': instance.accepted_at.isoformat() if instance.accepted_at else None,
            'declinedAt': instance.declined_at.isoformat() if instance.declined_at else None,
            'inviteMessage': build_invite_message(instance),
        })
        return data
