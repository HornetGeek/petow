from django.contrib import admin
from .models import Breed, Pet, PetImage, BreedingRequest, Favorite, VeterinaryClinic, Notification, ChatRoom, AdoptionRequest

@admin.register(Breed)
class BreedAdmin(admin.ModelAdmin):
    list_display = ['name', 'description']
    search_fields = ['name']

class PetImageInline(admin.TabularInline):
    model = PetImage
    extra = 1

@admin.register(Pet)
class PetAdmin(admin.ModelAdmin):
    list_display = ['name', 'breed', 'pet_type', 'gender', 'age_display', 'status', 'location', 'has_health_certificates', 'owner']
    list_filter = ['pet_type', 'gender', 'status', 'is_fertile', 'breed']
    search_fields = ['name', 'breed__name', 'location', 'owner__email']
    readonly_fields = ['age_display', 'price_display', 'has_health_certificates']
    inlines = [PetImageInline]
    
    fieldsets = (
        ('معلومات أساسية', {
            'fields': ('owner', 'name', 'pet_type', 'breed', 'age_months', 'gender', 'color', 'weight')
        }),
        ('التزاوج', {
            'fields': ('is_fertile', 'breeding_history', 'last_breeding_date', 'number_of_offspring', 'temperament')
        }),
        ('السلوك', {
            'fields': ('is_trained', 'good_with_kids', 'good_with_pets')
        }),
        ('الصور', {
            'fields': ('main_image', 'image_2', 'image_3', 'image_4')
        }),
        ('الشهادات الصحية', {
            'fields': ('vaccination_certificate', 'health_certificate', 'disease_free_certificate', 'additional_certificate', 'has_health_certificates'),
            'description': 'رفع الشهادات الصحية اختياري ولكنه يزيد من مصداقية الحيوان'
        }),
        ('الموقع والحالة', {
            'fields': ('location', 'status', 'is_free')
        }),
        ('الصحة', {
            'fields': ('description', 'health_status')
        }),
    )

@admin.register(BreedingRequest)
class BreedingRequestAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'status', 'requester', 'receiver', 'meeting_date', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['target_pet__name', 'requester_pet__name', 'requester__email', 'receiver__email']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('معلومات أساسية', {
            'fields': ('target_pet', 'requester_pet', 'requester', 'receiver', 'status')
        }),
        ('تفاصيل المقابلة', {
            'fields': ('meeting_date', 'contact_phone', 'veterinary_clinic', 'message')
        }),
        ('الرد والملاحظات', {
            'fields': ('response_message',)
        }),
        ('التواريخ', {
            'fields': ('created_at', 'updated_at', 'completed_at')
        }),
    )

@admin.register(VeterinaryClinic)
class VeterinaryClinicAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'phone', 'is_active', 'created_at']
    list_filter = ['city', 'is_active', 'created_at']
    search_fields = ['name', 'city', 'address']
    readonly_fields = ['created_at']

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'type', 'is_read', 'created_at']
    list_filter = ['type', 'is_read', 'created_at']
    search_fields = ['title', 'message', 'user__email', 'user__first_name', 'user__last_name']
    readonly_fields = ['created_at', 'updated_at', 'read_at']
    raw_id_fields = ['user', 'related_pet', 'related_breeding_request']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'related_pet', 'related_breeding_request')

@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ['user', 'pet', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__email', 'pet__name']

@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'firebase_chat_id', 'created_at', 'updated_at', 'is_active']
    list_filter = ['is_active', 'created_at', 'updated_at']
    search_fields = ['breeding_request__requester__first_name', 'breeding_request__target_pet__owner__first_name', 'firebase_chat_id']
    readonly_fields = ['created_at', 'updated_at', 'firebase_chat_id']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'breeding_request__requester',
            'breeding_request__target_pet__owner'
        )


@admin.register(AdoptionRequest)
class AdoptionRequestAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'adopter_name', 'pet_name', 'adopter_phone', 
        'status', 'created_at'
    ]
    list_filter = ['status', 'housing_type', 'experience_level', 'created_at']
    search_fields = [
        'adopter_name', 'adopter_phone', 'adopter_address',
        'pet__name', 'adopter__email'
    ]
    readonly_fields = ['created_at', 'updated_at', 'approved_at', 'completed_at']
    
    fieldsets = (
        ('معلومات أساسية', {
            'fields': ('adopter', 'pet', 'status')
        }),
        ('معلومات طالب التبني', {
            'fields': ('adopter_name', 'adopter_email', 'adopter_phone', 'adopter_age', 'adopter_occupation', 'adopter_address', 'adopter_latitude', 'adopter_longitude')
        }),
        ('معلومات السكن', {
            'fields': ('housing_type', 'family_members')
        }),
        ('الخبرة والأسباب', {
            'fields': ('experience_level', 'time_availability', 'reason_for_adoption')
        }),
        ('الموافقات', {
            'fields': ('family_agreement', 'agrees_to_follow_up', 'agrees_to_vet_care', 'agrees_to_training')
        }),
        ('خطط الرعاية', {
            'fields': ('feeding_plan', 'exercise_plan', 'vet_care_plan', 'emergency_plan')
        }),
        ('الملاحظات', {
            'fields': ('notes', 'admin_notes')
        }),
        ('التواريخ', {
            'fields': ('created_at', 'updated_at', 'approved_at', 'completed_at')
        }),
    )
    
    def pet_name(self, obj):
        return obj.pet.name
    pet_name.short_description = 'اسم الحيوان'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('adopter', 'pet')
