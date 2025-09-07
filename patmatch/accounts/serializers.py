from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
import re

User = get_user_model()

class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    pets_count = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'phone', 'is_phone_verified', 'address', 'profile_picture', 'is_verified',
            'pets_count', 'date_joined'
        ]
        read_only_fields = ['id', 'email', 'is_verified', 'is_phone_verified', 'date_joined']
    
    def get_pets_count(self, obj):
        return obj.pets.count()

class UserSerializer(serializers.ModelSerializer):
    """مُسلسل مبسط للمستخدم"""
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'profile_picture', 'phone', 'is_phone_verified']

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