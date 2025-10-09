from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .invite_service import build_invite_link, build_invite_message, create_invite_for_patient
from .models import (
    Clinic,
    ClinicStaff,
    ClinicService,
    ClinicPromotion,
    ClinicMessage,
    ClinicClientRecord,
    ClinicPatientRecord,
    ClinicInvite,
    VeterinaryAppointment,
)

User = get_user_model()


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


class ClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'description', 'address', 'phone', 'emergency_phone',
            'email', 'website', 'logo', 'opening_hours', 'services',
            'latitude', 'longitude', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at', 'logo']


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
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    avatar = serializers.SerializerMethodField()
    join_date = serializers.DateTimeField(source='created_at', read_only=True)
    
    class Meta:
        model = ClinicStaff
        fields = [
            'id', 'name', 'email', 'phone', 'avatar', 'role', 
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


class ClinicServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicService
        fields = [
            'id', 'clinic', 'name', 'description', 'category', 'price',
            'duration_minutes', 'is_active', 'highlight', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'created_at', 'updated_at']


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
    class Meta:
        model = ClinicMessage
        fields = [
            'id', 'clinic', 'sender_name', 'sender_email', 'sender_phone',
            'subject', 'message', 'status', 'priority', 'is_internal',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'clinic', 'created_at', 'updated_at']


class ClinicPatientRecordSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(write_only=True)
    owner_phone = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    owner_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    owner_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    age = serializers.CharField(write_only=True, required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    last_visit = serializers.DateField(required=False, allow_null=True)
    next_appointment = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = ClinicPatientRecord
        fields = [
            'id', 'name', 'species', 'breed', 'date_of_birth', 'age', 'gender', 'status',
            'notes', 'owner_name', 'owner_phone', 'owner_email', 'owner_password',
            'last_visit', 'next_appointment', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def _get_or_create_owner(self, clinic: Clinic, validated_data):
        full_name = validated_data.pop('owner_name').strip()
        phone = (validated_data.pop('owner_phone', None) or '') or None
        email = (validated_data.pop('owner_email', None) or '').strip() or None
        validated_data.pop('owner_password', None)

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
        return owner

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
        }
        for camel, snake in camel_to_snake.items():
            if camel in data and snake not in data:
                data[snake] = data[camel]
        return super().to_internal_value(data)

    def create(self, validated_data):
        clinic = self.context['clinic']
        owner = self._get_or_create_owner(clinic, validated_data)
        age_value = validated_data.pop('age', None)
        dob = validated_data.get('date_of_birth')

        if dob:
            validated_data['age_text'] = _calculate_age_text(dob)
        elif age_value and isinstance(age_value, str) and age_value.strip():
            validated_data['age_text'] = age_value.strip()
        else:
            validated_data['age_text'] = None

        patient = ClinicPatientRecord.objects.create(
            clinic=clinic,
            owner=owner,
            **validated_data,
        )
        return patient

    def update(self, instance, validated_data):
        clinic = self.context['clinic']
        owner_updated = False
        if 'owner_name' in validated_data or 'owner_phone' in validated_data or 'owner_email' in validated_data:
            owner = self._get_or_create_owner(clinic, validated_data)
            instance.owner = owner
            owner_updated = True

        age_value_present = 'age' in validated_data
        age_value = validated_data.pop('age', None)
        dob_present = 'date_of_birth' in validated_data
        dob_value = validated_data.get('date_of_birth')

        if dob_present:
            instance.date_of_birth = dob_value
            instance.age_text = _calculate_age_text(dob_value) if dob_value else None
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
        instance.last_visit = validated_data.get('last_visit', instance.last_visit)
        instance.next_appointment = validated_data.get('next_appointment', instance.next_appointment)
        instance.name = validated_data.get('name', instance.name)
        if owner_updated:
            instance.owner.save(update_fields=['updated_at'])
        instance.save()
        return instance

    def to_representation(self, instance):
        data = {
            'id': str(instance.id),
            'name': instance.name,
            'species': instance.species,
            'breed': instance.breed or '',
            'age': instance.age_text or _calculate_age_text(instance.date_of_birth) or '',
            'dateOfBirth': instance.date_of_birth.isoformat() if instance.date_of_birth else None,
            'gender': instance.gender or 'unknown',
            'ownerName': instance.owner.full_name,
            'ownerPhone': instance.owner.phone or '',
            'ownerEmail': instance.owner.email or '',
            'status': instance.status,
            'lastVisit': instance.last_visit.isoformat() if instance.last_visit else None,
            'nextAppointment': instance.next_appointment.isoformat() if instance.next_appointment else None,
            'notes': instance.notes or '',
            'createdAt': instance.created_at.isoformat(),
            'updatedAt': instance.updated_at.isoformat(),
        }

        try:
            invite = create_invite_for_patient(instance)
        except Exception:
            invite = None

        if invite:
            data.update({
                'inviteToken': str(invite.token),
                'inviteLink': build_invite_link(invite.token),
                'inviteMessage': build_invite_message(invite),
                'inviteStatus': invite.status,
                'inviteCreatedAt': invite.created_at.isoformat(),
            })

        return data

class ClinicAppointmentSerializer(serializers.ModelSerializer):
    pet_name = serializers.CharField(source='pet.name', read_only=True)
    owner_name = serializers.SerializerMethodField()
    owner_phone = serializers.CharField(source='owner.phone', read_only=True)
    owner_email = serializers.EmailField(source='owner.email', read_only=True)
    clinic_name = serializers.CharField(source='clinic.name', read_only=True)

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        else:
            data = dict(data)
        camel_to_snake = {
            'petId': 'pet',
            'ownerId': 'owner',
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
            'id', 'clinic', 'clinic_name', 'pet', 'pet_name', 'owner', 'owner_name',
            'owner_phone', 'owner_email', 'appointment_type', 'scheduled_date',
            'scheduled_time', 'duration_minutes', 'reason', 'notes', 'status',
            'payment_status', 'service_fee', 'diagnosis', 'treatment',
            'next_appointment', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'clinic', 'clinic_name', 'owner_name', 'owner_phone',
            'owner_email', 'pet_name', 'created_at', 'updated_at'
        ]

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() or obj.owner.email

    def create(self, validated_data):
        clinic = self.context['clinic']
        validated_data['clinic'] = clinic
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('clinic', None)
        return super().update(instance, validated_data)


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
    clinic_name = serializers.CharField(max_length=200)
    clinic_description = serializers.CharField(required=False, allow_blank=True)
    clinic_email = serializers.EmailField()
    clinic_phone = serializers.CharField(max_length=20)
    clinic_emergency_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    clinic_address = serializers.CharField()
    clinic_opening_hours = serializers.CharField()
    clinic_services = serializers.CharField()
    clinic_website = serializers.URLField(required=False, allow_blank=True)
    clinic_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    clinic_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    owner_first_name = serializers.CharField(max_length=150)
    owner_last_name = serializers.CharField(max_length=150)
    owner_email = serializers.EmailField()
    owner_phone = serializers.CharField(max_length=20)
    password1 = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)

    def validate_owner_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل")
        return value

    def validate(self, attrs):
        if attrs['password1'] != attrs['password2']:
            raise serializers.ValidationError({'password2': "كلمات المرور غير متطابقة"})
        validate_password(attrs['password1'])
        return attrs

    def create(self, validated_data):
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
            email=validated_data['clinic_email'],
            website=validated_data.get('clinic_website'),
            opening_hours=validated_data['clinic_opening_hours'],
            services=validated_data['clinic_services'],
            latitude=validated_data.get('clinic_latitude'),
            longitude=validated_data.get('clinic_longitude'),
        )

        ClinicStaff.objects.create(
            user=owner,
            clinic=clinic,
            role='owner',
            is_primary=True,
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
