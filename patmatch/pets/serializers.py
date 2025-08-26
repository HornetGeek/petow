from rest_framework import serializers
from .models import Breed, Pet, PetImage, BreedingRequest, Favorite, VeterinaryClinic, Notification, ChatRoom, AdoptionRequest

class BreedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Breed
        fields = ['id', 'name', 'pet_type', 'description']

class VeterinaryClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryClinic
        fields = ['id', 'name', 'code', 'address', 'city', 'phone', 'email', 'working_hours', 'is_active']

class PetImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PetImage
        fields = ['id', 'image', 'caption']

class PetSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.get_full_name', read_only=True)
    owner_email = serializers.CharField(source='owner.email', read_only=True)
    breed_name = serializers.CharField(source='breed.name', read_only=True)
    age_display = serializers.CharField(read_only=True)
    price_display = serializers.CharField(read_only=True)
    additional_images = PetImageSerializer(many=True, read_only=True)
    pet_type_display = serializers.CharField(read_only=True)
    status_display = serializers.CharField(read_only=True)
    gender_display = serializers.CharField(read_only=True)
    has_health_certificates = serializers.BooleanField(read_only=True)
    
    # Make main_image optional during updates
    main_image = serializers.ImageField(required=False)
    
    # Make certificate fields optional
    vaccination_certificate = serializers.FileField(required=False)
    health_certificate = serializers.FileField(required=False)
    disease_free_certificate = serializers.FileField(required=False)
    additional_certificate = serializers.FileField(required=False)
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Fix image URLs - if it's an external URL, use the raw value instead of Django's processed URL
        if instance.main_image:
            main_image_name = instance.main_image.name
            if main_image_name.startswith('https://') or main_image_name.startswith('http://'):
                data['main_image'] = main_image_name
            
        # Apply same fix to other image fields
        for field in ['image_2', 'image_3', 'image_4']:
            image_field = getattr(instance, field, None)
            if image_field and hasattr(image_field, 'name'):
                if image_field.name.startswith('https://') or image_field.name.startswith('http://'):
                    data[field] = image_field.name
        return data
    
    class Meta:
        model = Pet
        fields = [
            'id', 'name', 'pet_type', 'pet_type_display', 'breed', 'breed_name', 
            'age_months', 'age_display', 'gender', 'gender_display', 'color', 
            'weight', 'description', 'health_status', 'is_fertile', 
            'breeding_history', 'last_breeding_date', 'number_of_offspring',
            'temperament', 'is_trained', 'good_with_kids', 'good_with_pets',
            'main_image', 'image_2', 'image_3', 'image_4', 'additional_images',
            'vaccination_certificate', 'health_certificate', 'disease_free_certificate', 'additional_certificate',
            'has_health_certificates', 'status', 'status_display', 'location', 
            'latitude', 'longitude', 'is_free', 'price_display', 'owner_name', 'owner_email', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['owner', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)
    
    def validate(self, data):
        # Check if this is a create operation and main_image is required
        if not self.instance and 'main_image' not in data:
            raise serializers.ValidationError({'main_image': 'الصورة الرئيسية مطلوبة عند إضافة حيوان جديد'})
        
        # التحقق من وجود الإحداثيات عند إضافة حيوان جديد
        if not self.instance:
            if 'latitude' not in data or 'longitude' not in data:
                raise serializers.ValidationError({
                    'latitude': 'إحداثيات الموقع مطلوبة (خط العرض)',
                    'longitude': 'إحداثيات الموقع مطلوبة (خط الطول)'
                })
            
            # التحقق من صحة الإحداثيات
            try:
                lat = float(data.get('latitude', 0))
                lng = float(data.get('longitude', 0))
                
                if not (-90 <= lat <= 90):
                    raise serializers.ValidationError({'latitude': 'خط العرض يجب أن يكون بين -90 و 90'})
                
                if not (-180 <= lng <= 180):
                    raise serializers.ValidationError({'longitude': 'خط الطول يجب أن يكون بين -180 و 180'})
                    
            except (ValueError, TypeError):
                raise serializers.ValidationError({
                    'latitude': 'إحداثيات الموقع غير صحيحة',
                    'longitude': 'إحداثيات الموقع غير صحيحة'
                })
        
        return data
    
    def update(self, instance, validated_data):
        # Handle image and certificate fields - if not provided in request, don't update them
        request = self.context.get('request')
        if request and hasattr(request, 'FILES'):
            # Only update file fields that are actually provided in the request
            file_fields = [
                'main_image', 'image_2', 'image_3', 'image_4',
                'vaccination_certificate', 'health_certificate', 
                'disease_free_certificate', 'additional_certificate'
            ]
            for field in file_fields:
                if field not in request.FILES and field in validated_data:
                    # Remove the field from validated_data if no new file was uploaded
                    validated_data.pop(field, None)
        
        return super().update(instance, validated_data)

class PetListSerializer(serializers.ModelSerializer):
    """سيريلايزر مبسط لقائمة الحيوانات"""
    breed_name = serializers.CharField(source='breed.name', read_only=True)
    pet_type_display = serializers.CharField(read_only=True)
    age_display = serializers.CharField(read_only=True)
    gender_display = serializers.CharField(read_only=True)
    status_display = serializers.CharField(read_only=True)
    owner_name = serializers.CharField(source='owner.get_full_name', read_only=True)
    has_health_certificates = serializers.BooleanField(read_only=True)
    distance = serializers.SerializerMethodField()
    distance_display = serializers.SerializerMethodField()
    
    def get_distance(self, obj):
        """حساب المسافة بالكيلومتر"""
        # الحصول على الموقع من context مباشرة
        user_lat = self.context.get('user_lat')
        user_lng = self.context.get('user_lng')
        
        if user_lat and user_lng:
            try:
                return obj.calculate_distance(float(user_lat), float(user_lng))
            except (ValueError, TypeError):
                return None
        return None
    
    def get_distance_display(self, obj):
        """عرض المسافة بشكل مفهوم"""
        # الحصول على الموقع من context مباشرة
        user_lat = self.context.get('user_lat')
        user_lng = self.context.get('user_lng')
        
        print(f"🔍 Serializer: user_lat={user_lat}, user_lng={user_lng}")
        
        if user_lat and user_lng:
            try:
                distance_display = obj.get_distance_display(float(user_lat), float(user_lng))
                print(f"🔍 Serializer: Pet {obj.name} distance: {distance_display}")
                return distance_display
            except (ValueError, TypeError) as e:
                print(f"❌ Serializer: Error calculating distance: {e}")
                return "الموقع غير محدد"
        else:
            print(f"❌ Serializer: No user coordinates in context")
        return None
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        
        # Fix image URLs - if it's an external URL, use the raw value
        if instance.main_image:
            main_image_name = instance.main_image.name
            if main_image_name.startswith('https://') or main_image_name.startswith('http://'):
                data['main_image'] = main_image_name
            else:
                # For local images, get the full URL
                request = self.context.get('request')
                if request:
                    data['main_image'] = request.build_absolute_uri(instance.main_image.url)
                else:
                    data['main_image'] = instance.main_image.url if instance.main_image else None
        
        return data
    
    class Meta:
        model = Pet
        fields = [
            'id', 'name', 'pet_type', 'pet_type_display', 'breed_name', 
            'age_display', 'gender', 'gender_display', 'main_image', 
            'location', 'latitude', 'longitude', 'distance', 'distance_display',
            'price_display', 'status', 'status_display', 'owner_name', 
            'is_fertile', 'has_health_certificates', 'created_at'
        ]

class BreedingRequestSerializer(serializers.ModelSerializer):
    # Pet details
    target_pet_details = PetListSerializer(source='target_pet', read_only=True)
    requester_pet_details = PetListSerializer(source='requester_pet', read_only=True)
    
    # User details
    requester_name = serializers.CharField(source='requester.get_full_name', read_only=True)
    receiver_name = serializers.CharField(source='receiver.get_full_name', read_only=True)
    
    # Clinic details
    veterinary_clinic_details = VeterinaryClinicSerializer(source='veterinary_clinic', read_only=True)
    
    # Status display
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = BreedingRequest
        fields = [
            'id', 'target_pet', 'target_pet_details', 'requester_pet', 'requester_pet_details',
            'requester', 'requester_name', 'receiver', 'receiver_name',
            'message', 'meeting_date', 'veterinary_clinic', 'veterinary_clinic_details',
            'contact_phone', 'status', 'status_display', 'response_message',
            'created_at', 'updated_at', 'completed_at'
        ]
        read_only_fields = ['requester', 'receiver', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        validated_data['requester'] = self.context['request'].user
        # تحديد المستقبل بناءً على مالك الحيوان المطلوب
        target_pet = validated_data['target_pet']
        validated_data['receiver'] = target_pet.owner
        
        return super().create(validated_data)
    
    def validate(self, data):
        target_pet = data['target_pet']
        requester_pet = data['requester_pet']
        current_user = self.context['request'].user
        
        # التحقق من أن المستخدم يملك الحيوان المرسل
        if current_user != requester_pet.owner:
            raise serializers.ValidationError("يجب أن تملك الحيوان المرسل")
        
        # التحقق من أن المستخدم لا يطلب مقابلة مع حيوانه الخاص
        if current_user == target_pet.owner:
            raise serializers.ValidationError("لا يمكنك طلب مقابلة مع حيوانك الخاص")
        
        # التحقق من أن الحيوانين من جنس مختلف
        if target_pet.gender == requester_pet.gender:
            raise serializers.ValidationError("يجب أن يكون الحيوانان من جنس مختلف للتزاوج")
        
        # التحقق من أن الحيوانين متاحين للمقابلة
        if target_pet.status != 'available':
            raise serializers.ValidationError("الحيوان المطلوب غير متاح للمقابلات")
        if requester_pet.status != 'available':
            raise serializers.ValidationError("حيوانك غير متاح للمقابلات")
        
        # التحقق من أن الحيوانين قادرين على التزاوج
        if not target_pet.is_fertile:
            raise serializers.ValidationError("الحيوان المطلوب غير قادر على التزاوج")
        if not requester_pet.is_fertile:
            raise serializers.ValidationError("حيوانك غير قادر على التزاوج")
        
        # التحقق من أن الحيوانين من نفس النوع
        if target_pet.pet_type != requester_pet.pet_type:
            raise serializers.ValidationError("يجب أن يكون الحيوانان من نفس النوع")
        
        return data

class FavoriteSerializer(serializers.ModelSerializer):
    pet = PetListSerializer(read_only=True)
    
    class Meta:
        model = Favorite
        fields = ['id', 'pet', 'created_at']
        read_only_fields = ['user', 'created_at']
    
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class NotificationSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    related_pet_details = PetListSerializer(source='related_pet', read_only=True)
    time_ago = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'type_display', 'title', 'message', 
            'related_pet', 'related_pet_details',
            'related_breeding_request', 'related_chat_room', 'is_read', 'read_at',
            'extra_data', 'created_at', 'time_ago'
        ]
        read_only_fields = ['user', 'created_at', 'read_at']
    
    def get_time_ago(self, obj):
        """حساب الوقت المنقضي منذ إنشاء الإشعار"""
        from django.utils import timezone
        import datetime
        
        now = timezone.now()
        diff = now - obj.created_at
        
        if diff.days > 0:
            return f"منذ {diff.days} يوم"
        elif diff.seconds > 3600:
            hours = diff.seconds // 3600
            return f"منذ {hours} ساعة"
        elif diff.seconds > 60:
            minutes = diff.seconds // 60
            return f"منذ {minutes} دقيقة"
        else:
            return "الآن" 

class ChatRoomSerializer(serializers.ModelSerializer):
    """سيريلايزر لغرف المحادثة"""
    participants = serializers.SerializerMethodField()
    other_participant = serializers.SerializerMethodField()
    pet_details = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatRoom
        fields = [
            'id', 'firebase_chat_id', 'created_at', 'updated_at', 
            'is_active', 'participants', 'other_participant', 'pet_details'
        ]
        read_only_fields = ['firebase_chat_id', 'created_at', 'updated_at']
    
    def get_participants(self, obj):
        """بيانات جميع المشاركين"""
        return obj.get_participants_data()
    
    def get_other_participant(self, obj):
        """بيانات المشارك الآخر (ليس المستخدم الحالي)"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            other_user = obj.get_other_participant(request.user)
            if other_user:
                return {
                    'id': other_user.id,
                    'name': f"{other_user.first_name} {other_user.last_name}",
                    'email': other_user.email,
                    'phone': other_user.phone,
                }
        return None
    
    def get_pet_details(self, obj):
        """تفاصيل الحيوان المرتبط بالطلب"""
        pet = obj.breeding_request.target_pet
        return {
            'id': pet.id,
            'name': pet.name,
            'breed_name': pet.breed.name,
            'pet_type_display': pet.pet_type_display,
            'main_image': pet.main_image.url if pet.main_image else None,
        }


class ChatRoomListSerializer(serializers.ModelSerializer):
    """سيريلايزر مبسط لقائمة المحادثات"""
    other_participant = serializers.SerializerMethodField()
    pet_name = serializers.SerializerMethodField()
    pet_image = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatRoom
        fields = [
            'id', 'firebase_chat_id', 'created_at', 'updated_at',
            'other_participant', 'pet_name', 'pet_image'
        ]
    
    def get_other_participant(self, obj):
        """اسم المشارك الآخر"""
        try:
            request = self.context.get('request')
            if request and request.user.is_authenticated:
                # Get participants safely
                participants = []
                try:
                    if obj.breeding_request and obj.breeding_request.requester:
                        participants.append(obj.breeding_request.requester)
                    if obj.breeding_request and obj.breeding_request.target_pet and obj.breeding_request.target_pet.owner:
                        participants.append(obj.breeding_request.target_pet.owner)
                except:
                    pass
                
                # Find the other participant
                for participant in participants:
                    if participant.id != request.user.id:
                        return f"{participant.first_name} {participant.last_name}"
        except Exception:
            pass
        return "مستخدم آخر"
    
    def get_pet_name(self, obj):
        """اسم الحيوان"""
        try:
            if obj.breeding_request and obj.breeding_request.target_pet:
                return obj.breeding_request.target_pet.name
        except:
            pass
        return "حيوان غير محدد"
    
    def get_pet_image(self, obj):
        """صورة الحيوان"""
        try:
            if obj.breeding_request and obj.breeding_request.target_pet and obj.breeding_request.target_pet.main_image:
                return obj.breeding_request.target_pet.main_image.url
        except:
            pass
        return None


class ChatContextSerializer(serializers.ModelSerializer):
    """سيريلايزر للسياق الكامل للمحادثة (للـ Firebase)"""
    chat_context = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatRoom
        fields = ['id', 'firebase_chat_id', 'chat_context']
    
    def get_chat_context(self, obj):
        """الحصول على السياق الكامل للمحادثة"""
        return obj.get_chat_context()


class ChatStatusSerializer(serializers.ModelSerializer):
    """سيريلايزر لحالة المحادثة"""
    participants_count = serializers.SerializerMethodField()
    breeding_request_status = serializers.SerializerMethodField()
    pet_name = serializers.SerializerMethodField()
    other_participant_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatRoom
        fields = [
            'id', 'firebase_chat_id', 'is_active', 'created_at', 'updated_at',
            'participants_count', 'breeding_request_status', 'pet_name', 'other_participant_name'
        ]
    
    def get_participants_count(self, obj):
        """عدد المشاركين"""
        try:
            participants = []
            if obj.breeding_request and obj.breeding_request.requester:
                participants.append(obj.breeding_request.requester)
            if obj.breeding_request and obj.breeding_request.target_pet and obj.breeding_request.target_pet.owner:
                participants.append(obj.breeding_request.target_pet.owner)
            return len(participants)
        except:
            return 0
    
    def get_breeding_request_status(self, obj):
        """حالة طلب التزاوج"""
        try:
            if obj.breeding_request:
                return obj.breeding_request.status
        except:
            pass
        return "غير محدد"
    
    def get_pet_name(self, obj):
        """اسم الحيوان"""
        try:
            if obj.breeding_request and obj.breeding_request.target_pet:
                return obj.breeding_request.target_pet.name
        except:
            pass
        return "حيوان غير محدد"
    
    def get_other_participant_name(self, obj):
        """اسم المشارك الآخر"""
        try:
            request = self.context.get('request')
            if request and request.user.is_authenticated:
                # Get participants safely
                participants = []
                try:
                    if obj.breeding_request and obj.breeding_request.requester:
                        participants.append(obj.breeding_request.requester)
                    if obj.breeding_request and obj.breeding_request.target_pet and obj.breeding_request.target_pet.owner:
                        participants.append(obj.breeding_request.target_pet.owner)
                except:
                    pass
                
                # Find the other participant
                for participant in participants:
                    if participant.id != request.user.id:
                        return f"{participant.first_name} {participant.last_name}"
        except Exception:
            pass
        return "مستخدم آخر"


class ChatCreationSerializer(serializers.Serializer):
    """سيريلايزر لإنشاء محادثة جديدة"""
    breeding_request_id = serializers.IntegerField()
    
    def validate_breeding_request_id(self, value):
        """التحقق من صحة معرف طلب التزاوج"""
        try:
            breeding_request = BreedingRequest.objects.get(id=value)
        except BreedingRequest.DoesNotExist:
            raise serializers.ValidationError("طلب التزاوج غير موجود")
        
        # التحقق من أن الطلب مقبول
        if breeding_request.status != 'approved':
            raise serializers.ValidationError("لا يمكن إنشاء محادثة إلا للطلبات المقبولة")
        
        # التحقق من عدم وجود محادثة مسبقة
        if hasattr(breeding_request, 'chat_room'):
            raise serializers.ValidationError("توجد محادثة بالفعل لهذا الطلب")
        
        return value 


# Adoption Serializers
class AdoptionRequestSerializer(serializers.ModelSerializer):
    """سيريالايزر لطلبات التبني - مبسط"""
    
    adopter_name = serializers.CharField(source='adopter.get_full_name', read_only=True)
    adopter_email = serializers.CharField(source='adopter.email', read_only=True)
    pet_name = serializers.CharField(source='pet.name', read_only=True)
    pet_owner_name = serializers.CharField(source='pet.owner.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    can_be_approved = serializers.BooleanField(read_only=True)
    can_be_completed = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = AdoptionRequest
        fields = [
            'id', 'adopter', 'pet', 'adopter_name', 'adopter_email', 
            'pet_name', 'pet_owner_name',
            
            # معلومات أساسية
            'adopter_name', 'adopter_email', 'adopter_phone', 'adopter_age',
            'adopter_occupation', 'adopter_address', 'adopter_id_number',
            
            # معلومات السكن
            'housing_type', 'family_members',
            
            # الخبرة والوقت
            'experience_level', 'time_availability',
            
            # الموافقات
            'family_agreement', 'agrees_to_follow_up', 'agrees_to_vet_care',
            'agrees_to_training',
            
            # خطط الرعاية
            'feeding_plan', 'exercise_plan', 'vet_care_plan', 'emergency_plan',
            
            # معلومات إضافية
            'reason_for_adoption',
            
            # حالة الطلب
            'status', 'status_display', 'notes', 'admin_notes',
            'created_at', 'updated_at', 'approved_at', 'completed_at',
            'can_be_approved', 'can_be_completed',
        ]
        read_only_fields = ['adopter', 'created_at', 'updated_at', 'approved_at', 'completed_at']


class AdoptionRequestCreateSerializer(serializers.ModelSerializer):
    """سيريالايزر لإنشاء طلبات التبني - مبسط"""
    
    class Meta:
        model = AdoptionRequest
        fields = [
            'pet',
            # معلومات أساسية
            'adopter_name', 'adopter_email', 'adopter_phone', 'adopter_age',
            'adopter_occupation', 'adopter_address', 'adopter_id_number',
            
            # معلومات السكن
            'housing_type', 'family_members',
            
            # الخبرة والوقت
            'experience_level', 'time_availability',
            
            # الموافقات
            'family_agreement', 'agrees_to_follow_up', 'agrees_to_vet_care',
            'agrees_to_training',
            
            # خطط الرعاية
            'feeding_plan', 'exercise_plan', 'vet_care_plan', 'emergency_plan',
            
            # معلومات إضافية
            'reason_for_adoption',
        ]
    
    def validate_pet(self, value):
        """التحقق من أن الحيوان متاح للتبني"""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("يجب تسجيل الدخول أولاً")
        
        # التحقق من أن الحيوان متاح للتبني
        if value.status != 'available_for_adoption':
            raise serializers.ValidationError("هذا الحيوان غير متاح للتبني")
        
        # التحقق من أن المستخدم لا يطلب التبني على حيوانه الخاص
        if value.owner == request.user:
            raise serializers.ValidationError("لا يمكنك طلب التبني على حيوانك الخاص")
        
        return value
    
    def validate(self, data):
        """التحقق من الموافقة على الشروط"""
        # التحقق من الموافقات الأساسية
        if not data.get('family_agreement'):
            raise serializers.ValidationError("يجب الموافقة على أن جميع أفراد الأسرة موافقون على التبني")
        if not data.get('agrees_to_follow_up'):
            raise serializers.ValidationError("يجب الموافقة على المتابعة الدورية")
        if not data.get('agrees_to_vet_care'):
            raise serializers.ValidationError("يجب الموافقة على توفير الرعاية البيطرية")
        if not data.get('agrees_to_training'):
            raise serializers.ValidationError("يجب الموافقة على تدريب الحيوان إذا لزم الأمر")
        
        return data
    
    def create(self, validated_data):
        """إنشاء طلب تبني جديد"""
        validated_data['adopter'] = self.context['request'].user
        return super().create(validated_data)


class AdoptionRequestListSerializer(serializers.ModelSerializer):
    """سيريالايزر لقائمة طلبات التبني"""
    
    adopter_name = serializers.CharField(source='adopter.get_full_name', read_only=True)
    pet_name = serializers.CharField(source='pet.name', read_only=True)
    pet_image = serializers.ImageField(source='pet.main_image', read_only=True)
    pet_breed = serializers.CharField(source='pet.breed.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = AdoptionRequest
        fields = [
            'id', 'adopter_name', 'pet_name', 'pet_image', 'pet_breed',
            'adopter_phone', 'status', 'status_display',
            'created_at'
        ]


class AdoptionRequestResponseSerializer(serializers.Serializer):
    """سيريالايزر للرد على طلبات التبني"""
    
    action = serializers.ChoiceField(choices=['approve', 'reject', 'complete'])
    notes = serializers.CharField(required=False, allow_blank=True)
    admin_notes = serializers.CharField(required=False, allow_blank=True) 