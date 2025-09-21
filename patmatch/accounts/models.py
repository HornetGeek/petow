from django.contrib.auth.models import AbstractUser
from django.db import models
import random
import string
from datetime import datetime, timedelta
from django.utils import timezone

class User(AbstractUser):
    """نموذج المستخدم المخصص للمالكين"""
    
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, help_text="رقم الهاتف مطلوب")
    is_phone_verified = models.BooleanField(default=False)
    address = models.TextField(blank=True, null=True)
    profile_picture = models.ImageField(upload_to='profiles/', blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    fcm_token = models.TextField(blank=True, null=True, help_text="FCM token للإشعارات")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['phone', 'first_name', 'last_name']

    def __str__(self):
        return f"User-{self.id}"

    class Meta:
        verbose_name = "مالك حيوان أليف"
        verbose_name_plural = "مالكي الحيوانات الأليفة"


class PhoneOTP(models.Model):
    """نموذج OTP للتحقق من رقم الهاتف"""
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='phone_otps')
    phone_number = models.CharField(max_length=20)
    otp_code = models.CharField(max_length=6)
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "كود التحقق من الهاتف"
        verbose_name_plural = "أكواد التحقق من الهاتف"
    
    def __str__(self):
        return f"{self.phone_number} - {self.otp_code}"
    
    @classmethod
    def generate_otp(cls, user, phone_number):
        """إنشاء كود OTP جديد"""
        # إلغاء جميع الأكواد السابقة لهذا المستخدم
        cls.objects.filter(user=user, phone_number=phone_number, is_used=False).update(is_used=True)
        
        # إنشاء كود جديد
        otp_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=5)  # ينتهي خلال 5 دقائق
        
        return cls.objects.create(
            user=user,
            phone_number=phone_number,
            otp_code=otp_code,
            expires_at=expires_at
        )
    
    def is_expired(self):
        """فحص إذا كان الكود منتهي الصلاحية"""
        return timezone.now() > self.expires_at
    
    def is_valid(self):
        """فحص إذا كان الكود صالح للاستخدام"""
        return not self.is_used and not self.is_expired()


class PasswordResetOTP(models.Model):
    """نموذج OTP لإعادة تعيين كلمة المرور"""
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_otps')
    email = models.EmailField()
    otp_code = models.CharField(max_length=6)
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "كود إعادة تعيين كلمة المرور"
        verbose_name_plural = "أكواد إعادة تعيين كلمة المرور"
    
    def __str__(self):
        return f"{self.email} - {self.otp_code}"
    
    @classmethod
    def generate_otp(cls, user):
        """إنشاء كود OTP جديد لإعادة تعيين كلمة المرور"""
        # إلغاء جميع الأكواد السابقة لهذا المستخدم
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        
        # إنشاء كود جديد
        otp_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=15)  # ينتهي خلال 15 دقيقة
        
        return cls.objects.create(
            user=user,
            email=user.email,
            otp_code=otp_code,
            expires_at=expires_at
        )
    
    def is_expired(self):
        """فحص إذا كان الكود منتهي الصلاحية"""
        return timezone.now() > self.expires_at
    
    def is_valid(self):
        """فحص إذا كان الكود صالح للاستخدام"""
        return not self.is_used and not self.is_expired()
