from rest_framework import serializers
from django.contrib.auth import get_user_model
import re
from .models import AccountVerification

User = get_user_model()

class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    pets_count = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'phone', 'is_phone_verified', 'address', 'latitude', 'longitude', 'profile_picture', 'is_verified',
            'user_type', 'pets_count', 'date_joined', 'fcm_token',
            'notify_breeding_requests', 'notify_adoption_pets'
        ]
        read_only_fields = ['id', 'email', 'is_verified', 'is_phone_verified', 'date_joined', 'fcm_token', 'user_type']
    
    def get_pets_count(self, obj):
        return obj.pets.count()

class UserSerializer(serializers.ModelSerializer):
    """مُسلسل مبسط للمستخدم"""
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'profile_picture', 'phone', 'is_phone_verified', 'fcm_token', 'user_type'
        ]

class CustomRegisterSerializer(serializers.ModelSerializer):
    """مُسلسل مخصص للتسجيل مع جعل رقم الهاتف مطلوب"""
    password1 = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)
    
    class Meta:
        model = User
        fields = [
            'email', 'first_name', 'last_name', 'phone', 
            'address', 'password1', 'password2'
        ]
        extra_kwargs = {
            'phone': {'required': False, 'allow_blank': True, 'help_text': 'رقم الهاتف (اختياري)'},
            'first_name': {'required': True},
            'last_name': {'required': True},
            'address': {'required': False},
        }
    
    def validate_phone(self, value):
        """التحقق من صحة رقم الهاتف وتطبيعه إلى E.164"""
        if not value:
            return ''

        # إزالة المسافات والرموز الإضافية الشائعة
        raw = re.sub(r'[\s\-\(\)]', '', str(value).strip())

        # احتفاظ فقط بالأرقام مع السماح بإشارة + في البداية
        if raw.startswith('+'):
            digits_only = re.sub(r'[^0-9]', '', raw)
            normalized = f'+{digits_only}' if digits_only else ''
        else:
            digits_only = re.sub(r'[^0-9]', '', raw)
            normalized = digits_only

        if not normalized:
            raise serializers.ValidationError("رقم الهاتف غير صالح")

        # إصلاح الأخطاء الشائعة: إضافة 0 محلي بعد كود الدولة
        if normalized.startswith('+200') and len(normalized) >= 5 and normalized[4] == '1':
            # +2001XXXXXXXXX -> +201XXXXXXXXX
            normalized = '+201' + normalized[5:]
        if normalized.startswith('+9660') and len(normalized) >= 6:
            normalized = '+966' + normalized[5:]
        if normalized.startswith('+9710') and len(normalized) >= 6:
            normalized = '+971' + normalized[5:]

        # تطبيع الأشكال المحلية إلى E.164
        if not normalized.startswith('+'):
            # مصر: 01XXXXXXXXX أو 1XXXXXXXXX
            if normalized.startswith('01') and len(normalized) in (10, 11):
                normalized = '+20' + normalized[1:]
            elif normalized.startswith('1') and len(normalized) == 10:
                normalized = '+20' + normalized
            # مصر بشكل دولي بدون +
            elif normalized.startswith('20') and len(normalized) >= 11:
                normalized = '+' + normalized
            # السعودية والإمارات
            elif normalized.startswith('966') and len(normalized) >= 12:
                normalized = '+' + normalized
            elif normalized.startswith('971') and len(normalized) >= 12:
                normalized = '+' + normalized

        # تحقق نهائي بنمط E.164 للدول المدعومة
        egypt_e164 = r'^\+201[0-5]\d{8}$'
        saudi_e164 = r'^\+966[5-9]\d{8}$'
        uae_e164   = r'^\+971[5-9]\d{8}$'

        if not (
            re.match(egypt_e164, normalized) or
            re.match(saudi_e164, normalized) or
            re.match(uae_e164, normalized)
        ):
            raise serializers.ValidationError(
                "رقم الهاتف غير صحيح. يرجى إدخال رقم سعودي أو مصري أو إماراتي صحيح بصيغة دولية"
            )

        return normalized
    
    def validate_email(self, value):
        """التحقق من عدم تكرار البريد الإلكتروني"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل")
        return value
    
    def validate(self, attrs):
        """التحقق من تطابق كلمات المرور"""
        if attrs['password1'] != attrs['password2']:
            raise serializers.ValidationError("كلمات المرور غير متطابقة")
        
        password = attrs['password1']
        if len(password) < 4:
            raise serializers.ValidationError("كلمة المرور يجب أن تتكون من 4 أحرف على الأقل")
        
        return attrs
    
    def create(self, validated_data):
        """إنشاء مستخدم جديد"""
        # إزالة password2 لأنها للتأكيد فقط
        validated_data.pop('password2')
        password = validated_data.pop('password1')
        phone = validated_data.pop('phone', '')
        
        # إنشاء المستخدم
        user = User.objects.create_user(
            username=validated_data['email'],  # نستخدم البريد كـ username
            password=password,
            phone=phone or '',
            **validated_data
        )
        
        return user


class AccountVerificationSerializer(serializers.ModelSerializer):
    """مُسلسل التحقق من الحساب"""
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = AccountVerification
        fields = [
            'id', 'user', 'user_name', 'user_email', 
            'id_photo', 'selfie_video', 'status', 'status_display',
            'admin_notes', 'created_at', 'reviewed_at'
        ]
        read_only_fields = ['id', 'user', 'status', 'admin_notes', 'reviewed_at', 'created_at']
    
    def validate_selfie_video(self, value):
        """التحقق من صحة الفيديو"""
        # التحقق من نوع الملف
        allowed_types = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
        if hasattr(value, 'content_type'):
            if value.content_type not in allowed_types:
                raise serializers.ValidationError(
                    "نوع الفيديو غير مدعوم. يرجى استخدام MP4, MOV, AVI, أو WEBM"
                )
        
        # التحقق من حجم الملف (20 MB كحد أقصى)
        max_size = 20 * 1024 * 1024  # 20 MB
        if hasattr(value, 'size'):
            if value.size > max_size:
                raise serializers.ValidationError(
                    f"حجم الفيديو كبير جداً. الحد الأقصى 20 ميجابايت. حجم الملف: {value.size / (1024*1024):.1f} ميجابايت"
                )
        
        return value
    
    def validate(self, attrs):
        """التحقق من البيانات"""
        # التحقق من عدم وجود طلب قيد المراجعة
        user = self.context['request'].user
        pending_verification = AccountVerification.objects.filter(
            user=user,
            status='pending'
        ).exists()
        
        if pending_verification:
            raise serializers.ValidationError(
                "لديك طلب تحقق قيد المراجعة بالفعل. يرجى الانتظار حتى تتم مراجعته."
            )
        
        return attrs
    
    def create(self, validated_data):
        """إنشاء طلب تحقق جديد"""
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class AccountVerificationStatusSerializer(serializers.ModelSerializer):
    """مُسلسل حالة التحقق من الحساب"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = AccountVerification
        fields = ['id', 'status', 'status_display', 'admin_notes', 'created_at', 'reviewed_at']
