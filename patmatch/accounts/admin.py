from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from .models import User, PhoneOTP, AccountVerification, MobileAppConfig

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'first_name', 'last_name', 'phone', 'latitude', 'longitude', 'is_phone_verified', 'is_verified', 'is_active', 'has_fcm_token', 'date_joined')
    list_filter = ('is_phone_verified', 'is_verified', 'is_active', 'is_staff', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name', 'phone', 'fcm_token')
    ordering = ('-date_joined',)
    
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('المعلومات الشخصية', {'fields': ('first_name', 'last_name', 'phone', 'is_phone_verified', 'address', 'latitude', 'longitude', 'profile_picture')}),
        ('الإشعارات', {'fields': ('fcm_token',)}),
        ('الصلاحيات', {'fields': ('is_active', 'is_staff', 'is_superuser', 'is_verified', 'groups', 'user_permissions')}),
        ('التواريخ المهمة', {'fields': ('last_login', 'date_joined')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'password1', 'password2'),
        }),
    )
    
    def has_fcm_token(self, obj):
        """Check if user has FCM token registered"""
        return bool(obj.fcm_token)
    has_fcm_token.boolean = True
    has_fcm_token.short_description = 'Has FCM Token'
    has_fcm_token.admin_order_field = 'fcm_token'


@admin.register(PhoneOTP)
class PhoneOTPAdmin(admin.ModelAdmin):
    list_display = ('user', 'phone_number', 'otp_code', 'is_used', 'expires_at', 'created_at')
    list_filter = ('is_used', 'created_at', 'expires_at')
    search_fields = ('user__email', 'phone_number', 'otp_code')
    readonly_fields = ('created_at',)
    ordering = ('-created_at',)
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')


@admin.register(AccountVerification)
class AccountVerificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'user_email', 'status', 'created_at', 'reviewed_at', 'id_photo_preview', 'has_video')
    list_filter = ('status', 'created_at', 'reviewed_at')
    search_fields = ('user__email', 'user__first_name', 'user__last_name')
    readonly_fields = ('created_at', 'reviewed_at', 'reviewed_by', 'id_photo_display', 'selfie_video_display')
    ordering = ('-created_at',)
    actions = ['approve_verification', 'reject_verification']
    
    fieldsets = (
        ('معلومات المستخدم', {
            'fields': ('user',)
        }),
        ('وثائق التحقق', {
            'fields': ('id_photo_display', 'selfie_video_display')
        }),
        ('حالة التحقق', {
            'fields': ('status', 'admin_notes', 'reviewed_at', 'reviewed_by')
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'reviewed_by')
    
    def user_email(self, obj):
        """عرض البريد الإلكتروني للمستخدم"""
        return obj.user.email
    user_email.short_description = 'البريد الإلكتروني'
    user_email.admin_order_field = 'user__email'
    
    def id_photo_preview(self, obj):
        """معاينة صورة الهوية في القائمة"""
        if obj.id_photo:
            return format_html('<img src="{}" width="50" height="50" style="object-fit: cover;" />', obj.id_photo.url)
        return '-'
    id_photo_preview.short_description = 'صورة الهوية'
    
    def has_video(self, obj):
        """عرض ما إذا كان هناك فيديو"""
        if obj.selfie_video:
            return format_html('✅ يوجد فيديو')
        return '❌'
    has_video.short_description = 'فيديو السيلفي'
    
    def id_photo_display(self, obj):
        """عرض صورة الهوية بالحجم الكامل"""
        if obj.id_photo:
            return format_html('<img src="{}" width="400" />', obj.id_photo.url)
        return '-'
    id_photo_display.short_description = 'صورة الهوية'
    
    def selfie_video_display(self, obj):
        """عرض فيديو السيلفي"""
        if obj.selfie_video:
            return format_html(
                '''
                <video width="600" controls>
                    <source src="{}" type="video/mp4">
                    المتصفح لا يدعم عرض الفيديو
                </video>
                <br>
                <a href="{}" target="_blank" style="display: inline-block; margin-top: 10px; padding: 8px 16px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">
                    📥 تحميل الفيديو
                </a>
                ''',
                obj.selfie_video.url,
                obj.selfie_video.url
            )
        return '-'
    selfie_video_display.short_description = 'فيديو السيلفي'
    
    def approve_verification(self, request, queryset):
        """قبول طلبات التحقق المحددة"""
        count = 0
        for verification in queryset.filter(status='pending'):
            verification.approve(admin_user=request.user, notes="تمت الموافقة من قبل المشرف")
            count += 1
        
        self.message_user(request, f'تم قبول {count} طلب تحقق بنجاح')
    approve_verification.short_description = 'قبول الطلبات المحددة'
    
    def reject_verification(self, request, queryset):
        """رفض طلبات التحقق المحددة"""
        count = 0
        for verification in queryset.filter(status='pending'):
            verification.reject(admin_user=request.user, notes="تم الرفض من قبل المشرف")
            count += 1
        
        self.message_user(request, f'تم رفض {count} طلب تحقق')
    reject_verification.short_description = 'رفض الطلبات المحددة'


@admin.register(MobileAppConfig)
class MobileAppConfigAdmin(admin.ModelAdmin):
    list_display = ('key', 'clinic_home_enabled', 'clinic_map_enabled', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')
