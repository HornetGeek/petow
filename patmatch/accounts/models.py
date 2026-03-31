from django.contrib.auth.models import AbstractUser
from django.db import models
from django.contrib.gis.db import models as gis_models
import logging
import random
import string
from datetime import datetime, timedelta, time as dt_time
from django.utils import timezone

from .email_notifications import send_account_verification_approved_email
from pets.push_targets import attach_push_targets

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
    location_point = gis_models.PointField(geography=True, srid=4326, null=True, blank=True, spatial_index=True)
    profile_picture = models.ImageField(upload_to='profiles/', blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    fcm_token = models.TextField(blank=True, null=True, help_text="FCM token للإشعارات")
    user_type = models.CharField(max_length=30, choices=USER_TYPE_CHOICES, default='pet_owner')
    
    # Notification preferences
    notify_breeding_requests = models.BooleanField(default=True, help_text="إرسال إشعارات طلبات التزاوج")
    notify_adoption_pets = models.BooleanField(default=True, help_text="إرسال إشعارات الحيوانات المتاحة للتبني")
    first_pet_created_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="تاريخ إنشاء أول حيوان للمستخدم (لاستخدامه في حملات onboarding)",
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['phone', 'first_name', 'last_name']

    def __str__(self):
        return f"User-{self.id} ({self.get_user_type_display()})"

    class Meta:
        verbose_name = "مستخدم"
        verbose_name_plural = "المستخدمون"

    def get_or_create_notification_settings(self):
        settings_obj, _ = UserNotificationSettings.objects.get_or_create(user=self)
        return settings_obj


class UserNotificationSettings(models.Model):
    """Granular notification settings used by policy engine and client preferences."""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='notification_settings',
    )

    enabled_global = models.BooleanField(default=True)

    allow_transactional = models.BooleanField(default=True)
    allow_chat = models.BooleanField(default=True)
    allow_breeding = models.BooleanField(default=True)
    allow_adoption = models.BooleanField(default=True)
    allow_clinic = models.BooleanField(default=True)
    allow_discovery = models.BooleanField(default=True)
    allow_reminders = models.BooleanField(default=True)
    allow_reminder_email = models.BooleanField(default=True)

    quiet_hours_start = models.TimeField(default=dt_time(22, 0))
    quiet_hours_end = models.TimeField(default=dt_time(8, 0))
    timezone = models.CharField(max_length=64, default='UTC')

    max_push_per_day = models.PositiveSmallIntegerField(default=6)
    max_discovery_per_day = models.PositiveSmallIntegerField(default=2)
    min_minutes_between_non_transactional = models.PositiveSmallIntegerField(default=120)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "إعدادات الإشعارات"
        verbose_name_plural = "إعدادات الإشعارات"

    def __str__(self):
        return f"NotificationSettings(user={self.user_id})"

    def sync_to_legacy_user_fields(self):
        """Keep legacy user-level booleans aligned for backwards compatibility."""
        user = self.user
        updated = False

        if user.notify_breeding_requests != self.allow_breeding:
            user.notify_breeding_requests = self.allow_breeding
            updated = True

        if user.notify_adoption_pets != self.allow_adoption:
            user.notify_adoption_pets = self.allow_adoption
            updated = True

        if updated:
            user.save(update_fields=['notify_breeding_requests', 'notify_adoption_pets', 'updated_at'])

    def sync_from_legacy_user_fields(self):
        """Copy legacy booleans into granular settings when needed."""
        dirty = False
        if self.allow_breeding != self.user.notify_breeding_requests:
            self.allow_breeding = self.user.notify_breeding_requests
            dirty = True
        if self.allow_adoption != self.user.notify_adoption_pets:
            self.allow_adoption = self.user.notify_adoption_pets
            dirty = True
        if dirty:
            self.save(update_fields=['allow_breeding', 'allow_adoption', 'updated_at'])


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
            if previous_status != 'approved':
                self.send_approval_notifications()
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
        self.status = 'approved'
        self.reviewed_at = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()
    
    def reject(self, admin_user=None, notes=None):
        """رفض طلب التحقق"""
        self.status = 'rejected'
        self.reviewed_at = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()

    def send_approval_notifications(self):
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

        title = "تم اعتماد حسابك في Petow"
        body = "تهانينا! تم اعتماد التحقق من حسابك ويمكنك الآن الاستفادة من جميع المزايا."
        push_data = attach_push_targets({
            'type': 'account_verification_approved',
            'verification_id': str(self.id),
            'user_id': str(user.id),
        }, 'account_verification_approved')

        try:
            from pets.models import NotificationOutbox
            from pets.notifications import create_notification
            from pets.notification_events import enqueue_notification_event

            notification = create_notification(
                user=user,
                notification_type='account_verification_approved',
                title=title,
                message=body,
                extra_data={
                    'verification_id': self.id,
                    'user_id': user.id,
                    'campaign_key': 'account_verification_approved',
                },
            )

            enqueue_notification_event(
                event_type=NotificationOutbox.EVENT_ACCOUNT_VERIFICATION_APPROVED_PUSH,
                object_id=notification.id,
                dedupe_key=f"account_verification_approved:{self.id}:{user.id}",
                payload={
                    'title': title,
                    'message': body,
                    'push_payload': push_data,
                },
            )
        except Exception as exc:
            logger.error(
                "Failed to schedule verification approval notification for user %s: %s",
                user.id,
                exc,
            )


class MobileAppConfig(models.Model):
    """Singleton-style config for mobile feature flags."""
    key = models.CharField(max_length=32, unique=True, default='default')
    clinic_home_enabled = models.BooleanField(default=True)
    clinic_map_enabled = models.BooleanField(default=True)
    server_map_clustering_enabled = models.BooleanField(default=True)
    android_min_supported_version = models.CharField(max_length=32, blank=True, default='')
    ios_min_supported_version = models.CharField(max_length=32, blank=True, default='')
    android_recommended_version = models.CharField(max_length=32, blank=True, default='')
    ios_recommended_version = models.CharField(max_length=32, blank=True, default='')
    android_store_url = models.URLField(blank=True, default='')
    ios_store_url = models.URLField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "إعدادات تطبيق الموبايل"
        verbose_name_plural = "إعدادات تطبيق الموبايل"

    def __str__(self):
        return "Mobile App Config"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(key='default')
        return obj
