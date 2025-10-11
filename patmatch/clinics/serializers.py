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
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    last_visit = serializers.DateField(required=False, allow_null=True)
    next_appointment = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = ClinicPatientRecord
        fields = [
            'id', 'name', 'species', 'breed', 'date_of_birth', 'age', 'gender', 'status',
            'notes', 'owner_name', 'owner_phone', 'owner_email', 'owner_password',
            'last_visit', 'next_appointment', 'linked_user', 'linked_pet', 'created_at', 'updated_at'
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
            # Create new user account
            from django.contrib.auth.hashers import make_password
            import random
            import string
            
            # Generate password if not provided
            password = owner_password if owner_password else ''.join(random.choices(string.ascii_letters + string.digits, k=12))
            
            # Parse name
            name_parts = owner_name.strip().split(' ', 1)
            first_name = name_parts[0] if len(name_parts) > 0 else owner_name
            last_name = name_parts[1] if len(name_parts) > 1 else ''
            
            user = User.objects.create(
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
        }
        for camel, snake in camel_to_snake.items():
            if camel in data and snake not in data:
                data[snake] = data[camel]
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
        dob = validated_data.get('date_of_birth')

        if dob:
            validated_data['age_text'] = _calculate_age_text(dob)
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
        # Compute age with fallbacks: stored age_text -> derived from DOB -> linked pet age_display
        age_value = instance.age_text or _calculate_age_text(instance.date_of_birth) or ''
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
            'dateOfBirth': instance.date_of_birth.isoformat() if instance.date_of_birth else None,
            'gender': instance.gender or 'unknown',
            'ownerName': instance.owner.full_name,
            'ownerPhone': owner_phone,
            'ownerEmail': instance.owner.email or '',
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
