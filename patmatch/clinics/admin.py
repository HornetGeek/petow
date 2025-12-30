from django.contrib import admin

from .models import (
    Clinic,
    ClinicStaff,
    ClinicService,
    ClinicProduct,
    ServicePricingTier,
    ServicePackage,
    ClinicPromotion,
    ClinicMessage,
    ClinicClientRecord,
    ClinicPatientRecord,
    ClinicInvite,
    VeterinaryAppointment,
    VeterinaryCertificate,
)


class ClinicStaffInline(admin.TabularInline):
    model = ClinicStaff
    extra = 1
    autocomplete_fields = ['user']


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'email', 'is_active', 'created_at')
    search_fields = ('name', 'email', 'phone', 'address')
    list_filter = ('is_active',)
    inlines = [ClinicStaffInline]


class ServicePricingTierInline(admin.TabularInline):
    model = ServicePricingTier
    extra = 0
    fields = ('tier_size', 'tier_name', 'price', 'weight_range', 'is_active')


@admin.register(ClinicService)
class ClinicServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'clinic', 'category', 'base_price', 'has_tiered_pricing', 'is_active', 'is_featured')
    list_filter = ('clinic', 'category', 'is_active', 'is_featured', 'has_tiered_pricing')
    search_fields = ('name', 'clinic__name')
    inlines = [ServicePricingTierInline]
    fieldsets = (
        ('Basic Information', {
            'fields': ('clinic', 'name', 'description', 'category', 'service_icon')
        }),
        ('Pet Types', {
            'fields': ('applicable_pet_types',)
        }),
        ('Pricing', {
            'fields': ('base_price', 'has_tiered_pricing')
        }),
        ('Details', {
            'fields': ('duration_minutes', 'requires_appointment')
        }),
        ('Visibility', {
            'fields': ('is_active', 'is_featured', 'display_order')
        }),
    )


@admin.register(ClinicProduct)
class ClinicProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'clinic', 'category', 'price', 'stock_quantity', 'is_active', 'updated_at')
    list_filter = ('clinic', 'category', 'is_active')
    search_fields = ('name', 'sku', 'clinic__name')


@admin.register(ServicePricingTier)
class ServicePricingTierAdmin(admin.ModelAdmin):
    list_display = ('service', 'tier_size', 'price', 'weight_range', 'is_active')
    list_filter = ('tier_size', 'is_active')
    search_fields = ('service__name',)


@admin.register(ServicePackage)
class ServicePackageAdmin(admin.ModelAdmin):
    list_display = ('name', 'clinic', 'package_price', 'regular_price', 'savings_amount', 'is_active', 'is_featured')
    list_filter = ('clinic', 'is_active', 'is_featured')
    search_fields = ('name', 'clinic__name')
    filter_horizontal = ('services',)
    fieldsets = (
        ('Basic Information', {
            'fields': ('clinic', 'name', 'description')
        }),
        ('Services', {
            'fields': ('services',)
        }),
        ('Pricing', {
            'fields': ('regular_price', 'package_price', 'savings_amount')
        }),
        ('Validity', {
            'fields': ('valid_from', 'valid_until')
        }),
        ('Status', {
            'fields': ('is_active', 'is_featured')
        }),
    )


@admin.register(ClinicPromotion)
class ClinicPromotionAdmin(admin.ModelAdmin):
    list_display = ('title', 'clinic', 'promotion_type', 'start_date', 'end_date', 'is_active')
    list_filter = ('clinic', 'promotion_type', 'is_active')
    search_fields = ('title', 'clinic__name')


@admin.register(ClinicMessage)
class ClinicMessageAdmin(admin.ModelAdmin):
    list_display = ('subject', 'clinic', 'sender_name', 'status', 'priority', 'created_at')
    list_filter = ('clinic', 'status', 'priority')
    search_fields = ('subject', 'sender_name', 'clinic__name')


@admin.register(ClinicClientRecord)
class ClinicClientRecordAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'clinic', 'email', 'phone', 'created_at')
    search_fields = ('full_name', 'email', 'phone', 'clinic__name')
    list_filter = ('clinic',)


@admin.register(ClinicPatientRecord)
class ClinicPatientRecordAdmin(admin.ModelAdmin):
    list_display = ('name', 'clinic', 'owner', 'species', 'status', 'linked_user', 'linked_pet', 'created_at')
    search_fields = ('name', 'owner__full_name', 'species', 'breed', 'clinic__name')
    list_filter = ('clinic', 'status', 'species')
    autocomplete_fields = ['linked_user', 'linked_pet']
    readonly_fields = ('created_at', 'updated_at')


@admin.register(VeterinaryAppointment)
class VeterinaryAppointmentAdmin(admin.ModelAdmin):
    list_display = (
        'pet', 'owner', 'clinic', 'appointment_type', 'scheduled_date',
        'scheduled_time', 'status', 'payment_status', 'service_fee'
    )
    list_filter = ('clinic', 'appointment_type', 'status', 'payment_status')
    search_fields = ('pet__name', 'owner__email', 'clinic__name')
    autocomplete_fields = ['pet', 'owner', 'clinic']


@admin.register(ClinicInvite)
class ClinicInviteAdmin(admin.ModelAdmin):
    list_display = ('patient', 'clinic', 'status', 'recipient', 'claimed_at', 'accepted_at', 'created_at')
    search_fields = ('patient__name', 'clinic__name', 'token', 'recipient__email')
    list_filter = ('clinic', 'status', 'claimed_at', 'accepted_at')
    autocomplete_fields = ['recipient']
    readonly_fields = ('token', 'created_at', 'updated_at', 'claimed_at', 'accepted_at', 'declined_at')
    
    fieldsets = (
        ('Invitation Info', {
            'fields': ('clinic', 'patient', 'owner_record', 'token', 'status')
        }),
        ('Recipient', {
            'fields': ('recipient', 'claimed_at', 'accepted_at', 'declined_at')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(VeterinaryCertificate)
class VeterinaryCertificateAdmin(admin.ModelAdmin):
    list_display = ('certificate_number', 'pet', 'clinic', 'certificate_type', 'issued_date', 'is_valid')
    list_filter = ('clinic', 'certificate_type', 'is_valid')
    search_fields = ('certificate_number', 'pet__name', 'clinic__name')
    autocomplete_fields = ['pet', 'clinic']
