from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from accounts.models import User
from pets.models import Notification
from pets.notifications import create_notification_once, _send_push_if_allowed
from pets.push_targets import attach_push_targets


ONBOARDING_REMINDER_DELAY_HOURS = 24
ONBOARDING_MAX_REMINDERS = 3


class Command(BaseCommand):
    help = "Send lifecycle engagement reminders (profile/pet setup + chat inactivity nudge)."

    def handle(self, *args, **options):
        now = timezone.now()
        today_key = now.date().isoformat()
        onboarding_cutoff = now - timedelta(hours=ONBOARDING_REMINDER_DELAY_HOURS)
        stale_chat_cutoff = now - timedelta(hours=24)

        users_qs = (
            User.objects.filter(is_active=True, user_type='pet_owner')
            .annotate(pets_count=Count('pets'))
            .only('id', 'first_name', 'last_name', 'address', 'phone', 'fcm_token', 'date_joined', 'first_pet_created_at')
        )

        profile_reminders = 0
        inactivity_reminders = 0

        for user in users_qs:
            no_pets = getattr(user, 'pets_count', 0) == 0
            onboarding_delay_elapsed = bool(user.date_joined and user.date_joined <= onboarding_cutoff)
            eligible_for_onboarding = (
                no_pets
                and user.first_pet_created_at is None
                and onboarding_delay_elapsed
            )

            if eligible_for_onboarding:
                title = "أكمل إعداد حسابك في Petow"
                message = "أضف بياناتك وحيوانك الأليف لتحصل على أفضل تطابقات وفرص التواصل."
                event_key = f"lifecycle_profile_setup:{today_key}:{user.id}"
                campaign_key = 'lifecycle_profile_setup'
                onboarding_reminders_sent = Notification.objects.filter(
                    user=user,
                    type='system_message',
                    extra_data__campaign_key=campaign_key,
                ).count()

                if onboarding_reminders_sent < ONBOARDING_MAX_REMINDERS:
                    notification, created = create_notification_once(
                        user=user,
                        notification_type='system_message',
                        title=title,
                        message=message,
                        extra_data={
                            'campaign_key': campaign_key,
                            'target_type': 'profile',
                            'target_id': user.id,
                            'reminder_number': onboarding_reminders_sent + 1,
                        },
                        event_key=event_key,
                    )
                    if created:
                        push_payload = attach_push_targets(
                            {
                                'type': 'system_message',
                                'campaign_key': campaign_key,
                            },
                            'system_message',
                        )
                        _send_push_if_allowed(
                            user,
                            title,
                            message,
                            push_payload,
                            category='system',
                            notification=notification,
                            notification_type='system_message',
                        )
                        profile_reminders += 1

            has_stale_unread_chat = Notification.objects.filter(
                user=user,
                type='chat_message_received',
                is_read=False,
                created_at__lte=stale_chat_cutoff,
            ).exists()
            if not has_stale_unread_chat:
                continue

            title = "لديك رسائل تنتظر ردك"
            message = "ارجع إلى المحادثات الآن للحفاظ على فرص التبني/التزاوج نشطة."
            event_key = f"chat_inactivity_nudge:{today_key}:{user.id}"
            campaign_key = 'chat_inactivity_nudge'

            notification, created = create_notification_once(
                user=user,
                notification_type='system_message',
                title=title,
                message=message,
                extra_data={
                    'campaign_key': campaign_key,
                    'target_type': 'chat',
                },
                event_key=event_key,
            )
            if not created:
                continue

            push_payload = attach_push_targets(
                {
                    'type': 'system_message',
                    'campaign_key': campaign_key,
                },
                'system_message',
            )
            _send_push_if_allowed(
                user,
                title,
                message,
                push_payload,
                category='system',
                notification=notification,
                notification_type='system_message',
            )
            inactivity_reminders += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Lifecycle reminders done: profile_setup={profile_reminders}, chat_inactivity={inactivity_reminders}"
            )
        )
