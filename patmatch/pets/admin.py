from django.contrib import admin
from django.utils import timezone
from django.utils.html import mark_safe
from .models import (
    Breed,
    Pet,
    PetImage,
    BreedingRequest,
    Favorite,
    VeterinaryClinic,
    Notification,
    NotificationOutbox,
    EmailReminderDispatch,
    ChatRoom,
    AdoptionRequest,
    Story,
    StoryView,
    StoryReport,
)

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
    list_filter = ['pet_type', 'gender', 'status', 'breed']
    search_fields = ['name', 'breed__name', 'location', 'owner__email']
    readonly_fields = ['age_display', 'price_display', 'has_health_certificates']
    inlines = [PetImageInline]
    
    fieldsets = (
        ('معلومات أساسية', {
            'fields': ('owner', 'name', 'pet_type', 'breed', 'age_months', 'gender')
        }),
        ('التزاوج', {
            'fields': ('breeding_history', 'last_breeding_date', 'number_of_offspring')
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
        ('معلومات إضافية', {
            'fields': ('description', 'hosting_preference')
        }),
    )


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'thumbnail', 'author_email', 'pet', 'caption_preview',
        'expires_at', 'is_hidden', 'reports_count', 'created_at',
    ]
    list_filter = ['is_hidden', 'deleted_at', 'created_at', 'expires_at']
    search_fields = ['caption', 'author__email', 'author__first_name', 'author__last_name', 'pet__name']
    raw_id_fields = ['author', 'pet', 'hidden_by']
    readonly_fields = [
        'thumbnail', 'views_count', 'reports_count', 'created_at',
        'updated_at', 'hidden_at', 'deleted_at',
    ]
    actions = ['hide_selected_stories', 'unhide_selected_stories']

    fieldsets = (
        ('القصة', {
            'fields': ('author', 'pet', 'image', 'thumbnail', 'caption', 'expires_at')
        }),
        ('المراجعة', {
            'fields': ('is_hidden', 'hidden_by', 'hidden_reason', 'hidden_at', 'deleted_at')
        }),
        ('الإحصائيات', {
            'fields': ('views_count', 'reports_count')
        }),
        ('التواريخ', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author', 'pet').prefetch_related('reports')

    def thumbnail(self, obj):
        if not obj or not obj.image:
            return '-'
        return mark_safe(
            f'<img src="{obj.image.url}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;" />'
        )
    thumbnail.short_description = 'الصورة'

    def author_email(self, obj):
        return obj.author.email
    author_email.short_description = 'المستخدم'
    author_email.admin_order_field = 'author__email'

    def caption_preview(self, obj):
        if not obj.caption:
            return '-'
        return obj.caption[:60] + ('…' if len(obj.caption) > 60 else '')
    caption_preview.short_description = 'النص'

    def views_count(self, obj):
        return obj.views.count()
    views_count.short_description = 'المشاهدات'

    def reports_count(self, obj):
        return obj.reports.count()
    reports_count.short_description = 'البلاغات'

    @admin.action(description='إخفاء القصص المحددة')
    def hide_selected_stories(self, request, queryset):
        now = timezone.now()
        updated = queryset.update(
            is_hidden=True,
            hidden_by_id=request.user.id,
            hidden_reason='Hidden from Django admin',
            hidden_at=now,
            updated_at=now,
        )
        self.message_user(request, f'تم إخفاء {updated} قصة.')

    @admin.action(description='إظهار القصص المحددة')
    def unhide_selected_stories(self, request, queryset):
        now = timezone.now()
        updated = queryset.update(
            is_hidden=False,
            hidden_by=None,
            hidden_reason='',
            hidden_at=None,
            updated_at=now,
        )
        self.message_user(request, f'تم إظهار {updated} قصة.')


@admin.register(StoryView)
class StoryViewAdmin(admin.ModelAdmin):
    list_display = ['id', 'story', 'user', 'viewed_at']
    list_filter = ['viewed_at']
    search_fields = ['story__caption', 'user__email']
    raw_id_fields = ['story', 'user']
    readonly_fields = ['viewed_at']


@admin.register(StoryReport)
class StoryReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'story', 'reporter', 'reason', 'status', 'created_at']
    list_filter = ['status', 'reason', 'created_at']
    search_fields = ['story__caption', 'reporter__email', 'details']
    raw_id_fields = ['story', 'reporter', 'reviewed_by']
    readonly_fields = ['created_at', 'updated_at', 'reviewed_at']
    actions = ['mark_reports_reviewed', 'dismiss_reports', 'hide_reported_stories']

    fieldsets = (
        ('البلاغ', {
            'fields': ('story', 'reporter', 'reason', 'details', 'status')
        }),
        ('المراجعة', {
            'fields': ('reviewed_by', 'reviewed_at')
        }),
        ('التواريخ', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    @admin.action(description='تحديد البلاغات كمراجعة')
    def mark_reports_reviewed(self, request, queryset):
        updated = queryset.update(
            status=StoryReport.STATUS_REVIEWED,
            reviewed_by_id=request.user.id,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f'تمت مراجعة {updated} بلاغ.')

    @admin.action(description='تجاهل البلاغات المحددة')
    def dismiss_reports(self, request, queryset):
        updated = queryset.update(
            status=StoryReport.STATUS_DISMISSED,
            reviewed_by_id=request.user.id,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f'تم تجاهل {updated} بلاغ.')

    @admin.action(description='إخفاء القصص المرتبطة بالبلاغات')
    def hide_reported_stories(self, request, queryset):
        story_ids = queryset.values_list('story_id', flat=True).distinct()
        now = timezone.now()
        updated = Story.objects.filter(id__in=story_ids).update(
            is_hidden=True,
            hidden_by_id=request.user.id,
            hidden_reason='Hidden after story report review',
            hidden_at=now,
            updated_at=now,
        )
        queryset.update(
            status=StoryReport.STATUS_REVIEWED,
            reviewed_by_id=request.user.id,
            reviewed_at=now,
        )
        self.message_user(request, f'تم إخفاء {updated} قصة مرتبطة بالبلاغات.')

@admin.register(BreedingRequest)
class BreedingRequestAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'status', 'requester', 'receiver', 'receiver_phone', 'meeting_date', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['target_pet__name', 'requester_pet__name', 'requester__email', 'receiver__email', 'receiver__phone']
    readonly_fields = ['created_at', 'updated_at', 'receiver_phone_display']
    
    fieldsets = (
        ('معلومات أساسية', {
            'fields': ('target_pet', 'requester_pet', 'requester', 'receiver', 'receiver_phone_display', 'status')
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
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('requester', 'receiver')

    def receiver_phone(self, obj):
        phone = getattr(obj.receiver, 'phone', None)
        return phone or '-'
    receiver_phone.short_description = 'هاتف المستلم'
    receiver_phone.admin_order_field = 'receiver__phone'

    def receiver_phone_display(self, obj):
        if not obj or not getattr(obj, 'receiver', None):
            return '-'
        return getattr(obj.receiver, 'phone', None) or '-'
    receiver_phone_display.short_description = 'هاتف المستلم'

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


@admin.register(NotificationOutbox)
class NotificationOutboxAdmin(admin.ModelAdmin):
    list_display = ['id', 'event_type', 'object_id', 'status', 'attempts', 'next_attempt_at', 'created_at']
    list_filter = ['status', 'event_type', 'created_at']
    search_fields = ['dedupe_key', 'last_error']
    readonly_fields = ['created_at', 'updated_at', 'processed_at']


@admin.register(EmailReminderDispatch)
class EmailReminderDispatchAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'reminder_key', 'target_date', 'status', 'attempts', 'sent_at', 'updated_at']
    list_filter = ['reminder_key', 'status', 'target_date']
    search_fields = ['user__email', 'recipient_email', 'last_error']
    readonly_fields = ['created_at', 'updated_at', 'sent_at']


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
