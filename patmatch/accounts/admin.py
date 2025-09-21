from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, PhoneOTP

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'first_name', 'last_name', 'phone', 'is_phone_verified', 'is_verified', 'is_active', 'has_fcm_token', 'date_joined')
    list_filter = ('is_phone_verified', 'is_verified', 'is_active', 'is_staff', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name', 'phone', 'fcm_token')
    ordering = ('-date_joined',)
    
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('المعلومات الشخصية', {'fields': ('first_name', 'last_name', 'phone', 'is_phone_verified', 'address', 'profile_picture')}),
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
