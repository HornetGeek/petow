from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core import signing
from django.core.paginator import Paginator
from django.http import Http404, HttpResponseForbidden, JsonResponse
from django.shortcuts import render, get_object_or_404
from django.urls import path, reverse
from django.utils.html import format_html
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.utils.dateparse import parse_date
from . import chat_admin_service as chat_admin
from .models import DailyChallenge, ChallengeEntry, ChallengeReaction, ChallengeReport


@admin.register(DailyChallenge)
class DailyChallengeAdmin(admin.ModelAdmin):
    list_display = ('title', 'starts_at', 'ends_at', 'is_published', 'is_disabled', 'participants')
    list_filter = ('is_published', 'is_disabled', 'category')
    search_fields = ('title', 'slug')
    def participants(self, obj):
        return obj.entries.filter(deleted_at__isnull=True, is_hidden=False).count()


@admin.register(ChallengeEntry)
class ChallengeEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'challenge', 'user', 'pet', 'is_hidden', 'created_at')
    list_filter = ('is_hidden', 'challenge')
    raw_id_fields = ('user', 'pet', 'challenge')
    actions = ('hide_entries',)
    def hide_entries(self, request, queryset):
        queryset.update(is_hidden=True)


@admin.register(ChallengeReport)
class ChallengeReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'entry', 'reason', 'status', 'created_at')
    list_filter = ('status', 'reason')
    raw_id_fields = ('entry', 'reporter')
    actions = ('hide_reported_entries',)
    def hide_reported_entries(self, request, queryset):
        ChallengeEntry.objects.filter(id__in=queryset.values('entry_id')).update(is_hidden=True)
        queryset.update(status='reviewed')


@admin.register(ChallengeReaction)
class ChallengeReactionAdmin(admin.ModelAdmin):
    list_display = ('entry', 'user', 'created_at')


class ChatTypeFilter(admin.SimpleListFilter):
    title = 'conversation type'
    parameter_name = 'chat_type'
    def lookups(self, request, model_admin):
        return [('adoption', 'Adoption'), ('breeding', 'Breeding'), ('story', 'Story reply'), ('clinic', 'Clinic')]
    def queryset(self, request, queryset):
        field = {'adoption': 'adoption_request', 'breeding': 'breeding_request', 'story': 'story_reply_request', 'clinic': 'clinic_patient'}.get(self.value())
        return queryset.filter(**{f'{field}__isnull': False}) if field else queryset


class ChatStatusFilter(admin.SimpleListFilter):
    title = 'conversation status'
    parameter_name = 'chat_status'
    def lookups(self, request, model_admin):
        return [('active', 'Active'), ('archived', 'Archived')]
    def queryset(self, request, queryset):
        if self.value() in ('active', 'archived'):
            return queryset.filter(is_active=self.value() == 'active')
        return queryset


class ChatDateRangeFilter(admin.SimpleListFilter):
    title = 'last message date'
    parameter_name = 'date_range'
    def lookups(self, request, model_admin):
        return [('custom', 'Custom range')]
    def expected_parameters(self):
        return ['date_range', 'from', 'to']
    def queryset(self, request, queryset):
        start = parse_date(request.GET.get('from', ''))
        end = parse_date(request.GET.get('to', ''))
        if start:
            queryset = queryset.filter(admin_last_message_at__date__gte=start)
        if end:
            queryset = queryset.filter(admin_last_message_at__date__lte=end)
        return queryset
from django.utils import timezone
from django.utils.html import mark_safe
from .models import (
    Breed,
    Pet,
    PetImage,
    BreedingRequest,
    Favorite,
    PetLike,
    VeterinaryClinic,
    Notification,
    NotificationOutbox,
    EmailReminderDispatch,
    ChatRoom,
    AdoptionRequest,
    Story,
    StoryView,
    StoryReport,
    StoryReaction,
    EngagementEvent,
    SavedSearch,
    SavedSearchMatch,
    ReferralAttribution,
    PetShareVisit,
    PointsWallet,
    PointsTransaction,
)


@admin.register(ReferralAttribution)
class ReferralAttributionAdmin(admin.ModelAdmin):
    list_display = ('id', 'referrer', 'referred_user_id_at_capture', 'source', 'original_pet_id', 'status', 'rejection_reason', 'captured_at', 'qualified_at')
    list_filter = ('status', 'source', 'rejection_reason', 'captured_at')
    search_fields = ('referrer__email', 'referred_user__email', '=referred_user_id_at_capture')
    readonly_fields = ('referred_user', 'referred_user_id_at_capture', 'referrer', 'share',
                       'original_pet_id', 'source', 'email_digest', 'device_digest', 'status', 'captured_at',
                       'qualified_at', 'rejected_at', 'rejection_reason')
    actions = ['reject_for_fraud']

    @admin.action(permissions=['view'], description='Reject selected referrals for confirmed fraud')
    def reject_for_fraud(self, request, queryset):
        from .points import PointsLedgerError, reject_referral
        changed = 0
        for attribution_id in queryset.values_list('pk', flat=True):
            try:
                changed += int(reject_referral(attribution_id, 'fraud_review'))
            except PointsLedgerError:
                self.message_user(request, f'Could not reverse referral {attribution_id}; inspect its wallet.', level='error')
        self.message_user(request, f'Processed {changed} referrals.')
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PetShareVisit)
class PetShareVisitAdmin(admin.ModelAdmin):
    list_display = ('id', 'share', 'created_at')
    readonly_fields = ('share', 'visitor_digest', 'created_at')
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PointsWallet)
class PointsWalletAdmin(admin.ModelAdmin):
    list_display = ('user', 'balance')
    search_fields = ('user__email',)
    readonly_fields = ('user', 'balance')
    def has_add_permission(self, request):
        return False
    def has_change_permission(self, request, obj=None):
        return False
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PointsTransaction)
class PointsTransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'wallet', 'amount', 'reason', 'referral_attribution', 'created_at')
    list_filter = ('reason', 'created_at')
    search_fields = ('wallet__user__email', 'idempotency_key')
    readonly_fields = ('wallet', 'referral_attribution', 'amount', 'reason', 'idempotency_key', 'created_at')
    def has_add_permission(self, request):
        return False
    def has_change_permission(self, request, obj=None):
        return False
    def has_delete_permission(self, request, obj=None):
        return False

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


@admin.register(StoryReaction)
class StoryReactionAdmin(admin.ModelAdmin):
    list_display = ['id', 'story', 'user', 'reaction', 'updated_at', 'created_at']
    list_filter = ['reaction', 'created_at', 'updated_at']
    search_fields = ['story__caption', 'user__email', 'user__first_name', 'user__last_name']
    raw_id_fields = ['story', 'user']
    readonly_fields = ['created_at', 'updated_at']


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


@admin.register(PetLike)
class PetLikeAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'pet', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'pet__name']
    raw_id_fields = ['user', 'pet']


@admin.register(EngagementEvent)
class EngagementEventAdmin(admin.ModelAdmin):
    list_display = ['id', 'event_type', 'source', 'target_type', 'user', 'pet', 'story', 'created_at']
    list_filter = ['event_type', 'source', 'target_type', 'created_at']
    search_fields = [
        'user__email', 'user__first_name', 'user__last_name',
        'pet__name', 'story__caption',
    ]
    raw_id_fields = ['user', 'pet', 'story']
    readonly_fields = ['created_at']


@admin.register(SavedSearch)
class SavedSearchAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'user', 'target_type', 'city', 'alerts_enabled', 'is_active', 'last_notified_at', 'updated_at']
    list_filter = ['target_type', 'alerts_enabled', 'is_active', 'created_at', 'last_notified_at']
    search_fields = ['name', 'user__email', 'user__first_name', 'user__last_name', 'city']
    raw_id_fields = ['user']
    readonly_fields = ['last_checked_at', 'last_notified_at', 'created_at', 'updated_at']


@admin.register(SavedSearchMatch)
class SavedSearchMatchAdmin(admin.ModelAdmin):
    list_display = ['id', 'saved_search', 'target_type', 'target_id', 'matched_at', 'notified_at']
    list_filter = ['target_type', 'matched_at', 'notified_at']
    search_fields = ['saved_search__name', 'saved_search__user__email', 'target_id']
    raw_id_fields = ['saved_search']
    readonly_fields = ['matched_at', 'notified_at']


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ['conversation_link', 'people', 'kind', 'pet', 'status', 'admin_last_message_preview', 'admin_last_message_at', 'admin_message_count']
    list_filter = [ChatTypeFilter, ChatStatusFilter, ChatDateRangeFilter, 'created_at']
    search_fields = ['=id', '=firebase_chat_id', '=breeding_request__requester__id', '=breeding_request__target_pet__owner__id', '=adoption_request__adopter__id', '=adoption_request__pet__owner__id', '=story_reply_request__sender__id', '=story_reply_request__owner__id', '=clinic_staff__id', '=clinic_patient__linked_user__id', 'breeding_request__requester__first_name', 'breeding_request__requester__last_name', 'breeding_request__requester__email', 'breeding_request__requester__phone', 'breeding_request__target_pet__owner__first_name', 'breeding_request__target_pet__owner__email', 'adoption_request__adopter__first_name', 'adoption_request__adopter__email', 'adoption_request__adopter__phone', 'adoption_request__pet__owner__first_name', 'adoption_request__pet__owner__email', 'story_reply_request__sender__email', 'story_reply_request__owner__email', 'clinic_staff__email', 'clinic_patient__linked_user__email', 'breeding_request__target_pet__name', 'adoption_request__pet__name']
    ordering = ['-admin_last_message_at', '-pk']
    list_per_page = 25
    show_full_result_count = False
    change_list_template = 'admin/pets/chatroom/change_list.html'

    def has_view_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_staff and (request.user.is_superuser or request.user.has_perm('pets.view_chat_conversation'))

    def has_module_permission(self, request):
        return self.has_view_permission(request)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(*chat_admin.ROOM_RELATIONS)

    def get_search_fields(self, request):
        fields = [field for field in self.search_fields if not (field == '=id' or field.endswith('__id'))]
        for relation in ('breeding_request__target_pet__owner', 'adoption_request__adopter',
                         'adoption_request__pet__owner', 'story_reply_request__sender',
                         'story_reply_request__owner', 'clinic_staff', 'clinic_patient__linked_user'):
            fields.extend(f'{relation}__{name}' for name in ('first_name', 'last_name', 'phone'))
        return fields

    def get_search_results(self, request, queryset, search_term):
        base = queryset
        found, duplicates = super().get_search_results(request, queryset, search_term)
        if search_term.strip().isdecimal():
            user_id = int(search_term.strip())
            id_paths = [field[1:] for field in self.search_fields if field == '=id' or field.endswith('__id')]
            numeric = Q()
            for path in id_paths:
                numeric |= Q(**{path: user_id})
            found = found | base.filter(numeric)
        return found, duplicates

    def get_model_perms(self, request):
        return {'view': self.has_view_permission(request)}

    def get_urls(self):
        custom = [
            path('user-search/', self.admin_site.admin_view(self.user_search), name='pets_chatroom_user_search'),
            path('<int:room_id>/viewer/', self.admin_site.admin_view(self.viewer), name='pets_chatroom_viewer'),
            path('find-between-users/', self.admin_site.admin_view(self.find_pair), name='pets_chatroom_find_pair'),
        ]
        return custom + super().get_urls()

    def user_search(self, request):
        denied = self._allowed(request)
        if denied:
            return denied
        term = request.GET.get('q', '').strip()[:100]
        if len(term) < 2:
            return JsonResponse({'results': []})
        q = Q(email__icontains=term) | Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(phone__icontains=term)
        if term.isdecimal():
            q |= Q(pk=int(term))
        users = get_user_model().objects.filter(q).order_by('pk')[:20]
        return JsonResponse({'results': [{'id': u.pk, 'label': f'{u.get_full_name() or u.email} · {u.email} (#{u.pk})'} for u in users]})

    @admin.display(description='Conversation')
    def conversation_link(self, obj):
        return format_html('<a href="{}">Room #{}</a>', reverse('admin:pets_chatroom_viewer', args=[obj.pk]), obj.pk)

    @admin.display(description='Participants')
    def people(self, obj):
        people = chat_admin.participants(obj)
        if not people:
            return '—'
        links = []
        for person in people:
            avatar = format_html('<img src="{}" alt="" width="24" height="24" style="border-radius:50%;object-fit:cover;vertical-align:middle"> ', person.profile_picture.url) if person.profile_picture else ''
            link = format_html('<a href="{}">{} ({})</a>', reverse('admin:accounts_user_change', args=[person.pk]), person.get_full_name() or person.email, person.pk)
            links.append(format_html('{}{}', avatar, link))
        return format_html('{} · {}', *links)

    @admin.display(description='Type')
    def kind(self, obj):
        return chat_admin.context(obj)[0]

    @admin.display(description='Pet')
    def pet(self, obj):
        pet = chat_admin.context(obj)[2]
        return pet.name if pet else '—'

    @admin.display(description='Status')
    def status(self, obj):
        return chat_admin.context(obj)[1]

    def _allowed(self, request):
        if not self.has_view_permission(request):
            return HttpResponseForbidden('Chat conversation permission required')
        return None

    def viewer(self, request, room_id):
        denied = self._allowed(request)
        if denied:
            return denied
        room = get_object_or_404(chat_admin.rooms(), pk=room_id)
        people = chat_admin.participants(room)
        if not people:
            raise Http404
        try:
            exact_pair = chat_admin.room_is_exact_pair(room, {people[0].pk, people[1].pk})
        except Exception:
            return render(request, 'admin/pets/chatroom/viewer.html', {**self.admin_site.each_context(request), 'title': 'Conversation unavailable', 'room': room, 'people': people, 'messages': [], 'error': 'Chat storage is unavailable.', 'context_info': chat_admin.context(room)})
        if not exact_pair:
            raise Http404
        LogEntry.objects.log_action(user_id=request.user.pk, content_type_id=ContentType.objects.get_for_model(ChatRoom).pk, object_id=room.pk, object_repr=str(room), action_flag=4, change_message='Viewed private chat conversation')
        before = None
        if request.GET.get('cursor'):
            try:
                before = signing.loads(request.GET['cursor'], salt='chat-admin-cursor', max_age=86400)
                if before['room'] != room.pk:
                    raise ValueError
                from datetime import datetime
                before = datetime.fromisoformat(before['time']), before['id']
            except (signing.BadSignature, KeyError, ValueError):
                raise Http404
        try:
            messages, next_cursor = chat_admin.message_page(room, before)
            error = None
        except Exception:
            messages, next_cursor, error = [], None, 'Chat storage is unavailable.'
        cursor = signing.dumps({'room': room.pk, 'time': next_cursor[0].isoformat(), 'id': next_cursor[1]}, salt='chat-admin-cursor') if next_cursor else None
        return render(request, 'admin/pets/chatroom/viewer.html', {**self.admin_site.each_context(request), 'title': f'Conversation #{room.pk}', 'room': room, 'people': people, 'messages': messages, 'cursor': cursor, 'error': error, 'context_info': chat_admin.context(room)})

    def find_pair(self, request):
        denied = self._allowed(request)
        if denied:
            return denied
        a = request.GET.get('a', '').strip()
        b = request.GET.get('b', '').strip()
        matched = []
        combined = []
        combined_cursor = None
        error = None
        if a.isdecimal() and b.isdecimal() and a != b:
            LogEntry.objects.log_action(user_id=request.user.pk, content_type_id=ContentType.objects.get_for_model(ChatRoom).pk, object_id=f'{a}:{b}', object_repr=f'User pair {a}, {b}', action_flag=4, change_message='Viewed private chat pair')
            try:
                matched = [r for r in chat_admin.pair_rooms(int(a), int(b)) if {p.pk for p in chat_admin.participants(r)} == {int(a), int(b)} and chat_admin.room_is_exact_pair(r, {int(a), int(b)})]
            except Exception:
                error = 'Chat storage is unavailable.'
            cursors = {}
            if request.GET.get('cursor'):
                try:
                    cursors = signing.loads(request.GET['cursor'], salt='chat-admin-pair', max_age=86400)
                    if cursors.get('a') != int(a) or cursors.get('b') != int(b):
                        raise ValueError
                except (signing.BadSignature, ValueError):
                    raise Http404
            pool = []
            try:
                from datetime import datetime
                for room in matched:
                    value = cursors.get(str(room.pk))
                    before = (datetime.fromisoformat(value[0]), value[1]) if value else None
                    page, _ = chat_admin.message_page(room, before)
                    pool.extend(page)
                selected = sorted(pool, key=lambda m: (m['timestamp'], m['room'].pk, m['id']), reverse=True)[:50]
                combined = list(reversed(selected))
                if len(pool) >= 50:
                    for message in selected:
                        cursors[str(message['room'].pk)] = (message['timestamp'].isoformat(), message['id'])
                    cursors.update({'a': int(a), 'b': int(b)})
                    combined_cursor = signing.dumps(cursors, salt='chat-admin-pair')
            except Exception:
                error = 'Chat storage is unavailable.'
        return render(request, 'admin/pets/chatroom/pair.html', {**self.admin_site.each_context(request), 'title': 'Find Chats Between Users', 'a': a, 'b': b, 'matched': matched, 'combined': combined, 'combined_cursor': combined_cursor, 'error': error})


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
