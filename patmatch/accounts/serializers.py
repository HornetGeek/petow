from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
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
            'user_type', 'pets_count', 'date_joined', 'fcm_token'
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
            'phone': {'required': True, 'help_text': 'رقم الهاتف مطلوب'},
            'first_name': {'required': True},
            'last_name': {'required': True},
            'address': {'required': False},
        }
    
    def validate_phone(self, value):
        """التحقق من صحة رقم الهاتف"""
        if not value:
            raise serializers.ValidationError("رقم الهاتف مطلوب")
        
        # إزالة المسافات والرموز الإضافية
        clean_phone = re.sub(r'[\s\-\(\)]', '', value)
        
        # تحقق من الأرقام السعودية والمصرية والإماراتية
        saudi_pattern = r'^(\+966|966|0)?[5-9]\d{8}$'
        egyptian_pattern = r'^(\+20|20|0)?1[0-5]\d{8}$'
        uae_pattern = r'^(\+971|971|0)?[5-9]\d{8}$'
        
        if not (re.match(saudi_pattern, clean_phone) or 
                re.match(egyptian_pattern, clean_phone) or 
                re.match(uae_pattern, clean_phone)):
            raise serializers.ValidationError(
                "رقم الهاتف غير صحيح. يرجى إدخال رقم سعودي أو مصري أو إماراتي صحيح"
            )
        
        return value
    
    def validate_email(self, value):
        """التحقق من عدم تكرار البريد الإلكتروني"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل")
        return value
    
    def validate(self, attrs):
        """التحقق من تطابق كلمات المرور"""
        if attrs['password1'] != attrs['password2']:
            raise serializers.ValidationError("كلمات المرور غير متطابقة")
        
        # التحقق من قوة كلمة المرور
        try:
            validate_password(attrs['password1'])
        except Exception as e:
            raise serializers.ValidationError(f"كلمة المرور ضعيفة: {e}")
        
        return attrs
    
    def create(self, validated_data):
        """إنشاء مستخدم جديد"""
        # إزالة password2 لأنها للتأكيد فقط
        validated_data.pop('password2')
        password = validated_data.pop('password1')
        
        # إنشاء المستخدم
        user = User.objects.create_user(
            username=validated_data['email'],  # نستخدم البريد كـ username
            password=password,
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

