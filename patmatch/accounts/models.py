from django.contrib.auth.models import AbstractUser
from django.db import models
import logging
import random
import string
from datetime import datetime, timedelta
from django.utils import timezone

from .email_notifications import send_account_verification_approved_email
from .firebase_service import firebase_service

logger = logging.getLogger(__name__)

class User(AbstractUser):
    """نموذج المستخدم المخصص للمالكين والعيادات"""
    
    USER_TYPE_CHOICES = [
        ('pet_owner', 'مالك حيوان أليف'),
        ('clinic_staff', 'طاقم عيادة'),
    ]

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, help_text="رقم الهاتف مطلوب")
    is_phone_verified = models.BooleanField(default=False)
    address = models.TextField(blank=True, null=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    profile_picture = models.ImageField(upload_to='profiles/', blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    fcm_token = models.TextField(blank=True, null=True, help_text="FCM token للإشعارات")
    user_type = models.CharField(max_length=30, choices=USER_TYPE_CHOICES, default='pet_owner')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['phone', 'first_name', 'last_name']

    def __str__(self):
        return f"User-{self.id} ({self.get_user_type_display()})"

    class Meta:
        verbose_name = "مستخدم"
        verbose_name_plural = "المستخدمون"


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


class AccountVerification(models.Model):
    """نموذج التحقق من الحساب بالهوية"""
    
    STATUS_CHOICES = [
        ('pending', 'قيد المراجعة'),
        ('approved', 'موافق عليه'),
        ('rejected', 'مرفوض'),
    ]
    
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='verification_requests',
        verbose_name="المستخدم"
    )
    id_photo = models.ImageField(
        upload_to='verification_documents/id_photos/',
        help_text="صورة بطاقة الهوية",
        verbose_name="صورة الهوية"
    )
    selfie_video = models.FileField(
        upload_to='verification_documents/selfie_videos/',
        help_text="فيديو سيلفي مع الهوية (10-15 ثانية)",
        verbose_name="فيديو السيلفي",
        null=True,
        blank=True
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        verbose_name="حالة الطلب"
    )
    admin_notes = models.TextField(
        blank=True,
        null=True,
        help_text="ملاحظات المشرف",
        verbose_name="ملاحظات الإدارة"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاريخ الإنشاء")
    reviewed_at = models.DateTimeField(blank=True, null=True, verbose_name="تاريخ المراجعة")
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_verifications',
        verbose_name="تمت المراجعة بواسطة"
    )
    
    class Meta:
        verbose_name = "طلب التحقق من الحساب"
        verbose_name_plural = "طلبات التحقق من الحسابات"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"طلب تحقق {self.user.get_full_name()} - {self.get_status_display()}"

    def save(self, *args, **kwargs):
        """Ensure user verification flag stays in sync with request status."""
        previous_status = None
        if self.pk:
            previous_status = type(self).objects.filter(pk=self.pk).values_list('status', flat=True).first()

        super().save(*args, **kwargs)

        if self.status == 'approved':
            if not self.user.is_verified:
                self.user.is_verified = True
                self.user.save(update_fields=['is_verified'])
        elif previous_status == 'approved' and self.status != 'approved':
            # Only unset verification if there are no other approved requests
            has_other_approved = type(self).objects.filter(
                user=self.user,
                status='approved'
            ).exclude(pk=self.pk).exists()
            if not has_other_approved and self.user.is_verified:
                self.user.is_verified = False
                self.user.save(update_fields=['is_verified'])
    
    def approve(self, admin_user=None, notes=None):
        """قبول طلب التحقق"""
        status_changed = self.status != 'approved'
        self.status = 'approved'
        self.reviewed_at = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()
        if status_changed:
            self._send_approval_notifications()
    
    def reject(self, admin_user=None, notes=None):
        """رفض طلب التحقق"""
        self.status = 'rejected'
        self.reviewed_at = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()

    def _send_approval_notifications(self):
        """Send email and push notification when verification is approved."""
        user = self.user
        if not user:
            logger.warning("AccountVerification %s has no user attached; skipping notifications", self.pk)
            return

        try:
            send_account_verification_approved_email(user)
        except Exception as exc:
            logger.error(
                "Failed to send verification approval email for user %s: %s",
                user.id,
                exc,
            )

        if not user.fcm_token:
            logger.debug(
                "User %s has no FCM token; skipping verification approval push notification",
                user.id,
            )
            return

        if not firebase_service.is_initialized:
            logger.warning("Firebase not initialised; cannot send verification approval push for user %s", user.id)
            return

        push_data = {
            'type': 'account_verification_approved',
            'verification_id': str(self.id),
            'user_id': str(user.id),
        }

        ok = firebase_service.send_notification(
            fcm_token=user.fcm_token,
            title="تم اعتماد حسابك في Petow",
            body="تهانينا! تم اعتماد التحقق من حسابك ويمكنك الآن الاستفادة من جميع المزايا.",
            data=push_data,
        )
        if not ok:
            logger.warning("Verification approval push notification to user %s failed to send", user.id)
