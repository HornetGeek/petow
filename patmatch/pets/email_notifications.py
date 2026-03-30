"""
نظام الإشعارات المحسن عبر الإيميل.
"""
from datetime import timedelta
import logging

from django.db import transaction
from django.utils import timezone

from accounts.email_delivery import (
    EMAIL_CATEGORY_REMINDER,
    EMAIL_CATEGORY_TRANSACTIONAL,
    build_rtl_email_html,
    send_email_payload,
)
from accounts.models import User, UserNotificationSettings
from .models import EmailReminderDispatch, Notification

logger = logging.getLogger(__name__)


def _display_name(user):
    return user.get_full_name() or user.first_name or "صديقنا"


def send_breeding_request_email(breeding_request):
    """إرسال إيميل عند إنشاء طلب تزاوج جديد."""
    try:
        receiver = breeding_request.receiver
        requester = breeding_request.requester
        target_pet = breeding_request.target_pet
        requester_pet = breeding_request.requester_pet

        if not receiver.email:
            logger.warning("No email found for user %s", receiver.id)
            return

        subject = f"طلب تزاوج جديد لحيوانك {target_pet.name}"
        app_link = f"petow://breeding-request/{breeding_request.id}"
        fallback_link = f"https://petow.app/requests/breeding/{breeding_request.id}"

        text_body = (
            f"مرحباً {_display_name(receiver)},\n\n"
            f"لديك طلب تزاوج جديد لحيوانك {target_pet.name}.\n\n"
            "تفاصيل الطلب:\n"
            f"- المرسل: {_display_name(requester)}\n"
            f"- حيوان المرسل: {requester_pet.name} ({requester_pet.get_pet_type_display()})\n"
            f"- تاريخ المقابلة المقترح: {breeding_request.meeting_date or 'غير محدد'}\n"
            f"- رقم التواصل: {breeding_request.contact_phone}\n"
        )
        if breeding_request.message:
            text_body += f"- رسالة من المرسل: {breeding_request.message}\n"
        if breeding_request.veterinary_clinic:
            text_body += f"- العيادة البيطرية المقترحة: {breeding_request.veterinary_clinic.name}\n"
        text_body += (
            "\n"
            f"فتح الطلب داخل التطبيق: {app_link}\n"
            f"رابط بديل عبر الويب: {fallback_link}\n\n"
            "سبب استلامك لهذا البريد: حدث جديد متعلق بطلب تزاوج لحيوانك.\n\n"
            "فريق Petow"
        )

        html_body = build_rtl_email_html(
            title=f"طلب تزاوج جديد لحيوانك {target_pet.name}",
            body_html=(
                f"<p style=\"margin:0 0 12px;\">مرحباً {_display_name(receiver)}، لديك طلب تزاوج جديد.</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>المرسل:</strong> {_display_name(requester)}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>حيوان المرسل:</strong> {requester_pet.name}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>تاريخ المقابلة:</strong> {breeding_request.meeting_date or 'غير محدد'}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>رقم التواصل:</strong> {breeding_request.contact_phone}</p>"
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>رسالة المرسل:</strong> {breeding_request.message}</p>"
                    if breeding_request.message else ""
                )
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>العيادة المقترحة:</strong> {breeding_request.veterinary_clinic.name}</p>"
                    if breeding_request.veterinary_clinic else ""
                )
            ),
            primary_label="فتح الطلب داخل التطبيق",
            primary_url=app_link,
            secondary_label="رابط بديل عبر الويب",
            secondary_url=fallback_link,
            why_you_received="سبب استلامك لهذا البريد: حدث جديد متعلق بطلب تزاوج لحيوانك.",
        )

        send_email_payload(
            to_email=receiver.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                'email_type': 'breeding_request_received',
                'breeding_request_id': breeding_request.id,
                'receiver_id': receiver.id,
            },
        )
        logger.info("Breeding request email sent to %s", receiver.email)
    except Exception as exc:
        logger.error("Error sending breeding request email: %s", exc)


def send_breeding_request_approved_email(breeding_request):
    """إرسال إيميل عند قبول طلب التزاوج."""
    try:
        requester = breeding_request.requester
        receiver = breeding_request.receiver
        target_pet = breeding_request.target_pet

        if not requester.email:
            logger.warning("No email found for user %s", requester.id)
            return

        subject = f"تم قبول طلب التزاوج مع {target_pet.name}!"
        app_link = f"petow://breeding-request/{breeding_request.id}"
        fallback_link = f"https://petow.app/requests/breeding/{breeding_request.id}"

        text_body = (
            f"مرحباً {_display_name(requester)},\n\n"
            "تم قبول طلب التزاوج الخاص بك.\n\n"
            "تفاصيل المقابلة:\n"
            f"- الحيوان: {target_pet.name}\n"
            f"- مالك الحيوان: {_display_name(receiver)}\n"
            f"- تاريخ المقابلة: {breeding_request.meeting_date or 'غير محدد'}\n"
        )
        if breeding_request.veterinary_clinic:
            text_body += (
                f"- العيادة البيطرية: {breeding_request.veterinary_clinic.name}\n"
                f"- هاتف العيادة: {breeding_request.veterinary_clinic.phone or 'غير متوفر'}\n"
            )
        if breeding_request.response_message:
            text_body += f"- رسالة من المالك: {breeding_request.response_message}\n"
        text_body += (
            "\n"
            f"فتح الطلب داخل التطبيق: {app_link}\n"
            f"رابط بديل عبر الويب: {fallback_link}\n\n"
            "سبب استلامك لهذا البريد: تم قبول طلب التزاوج الذي أرسلته.\n\n"
            "فريق Petow"
        )

        html_body = build_rtl_email_html(
            title=f"تم قبول طلب التزاوج مع {target_pet.name} ✅",
            body_html=(
                f"<p style=\"margin:0 0 12px;\">مرحباً {_display_name(requester)}، تم قبول طلبك.</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>الحيوان:</strong> {target_pet.name}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>مالك الحيوان:</strong> {_display_name(receiver)}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>تاريخ المقابلة:</strong> {breeding_request.meeting_date or 'غير محدد'}</p>"
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>العيادة:</strong> {breeding_request.veterinary_clinic.name}</p>"
                    if breeding_request.veterinary_clinic else ""
                )
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>هاتف العيادة:</strong> {breeding_request.veterinary_clinic.phone or 'غير متوفر'}</p>"
                    if breeding_request.veterinary_clinic else ""
                )
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>رسالة من المالك:</strong> {breeding_request.response_message}</p>"
                    if breeding_request.response_message else ""
                )
            ),
            primary_label="فتح الطلب داخل التطبيق",
            primary_url=app_link,
            secondary_label="رابط بديل عبر الويب",
            secondary_url=fallback_link,
            why_you_received="سبب استلامك لهذا البريد: تم قبول طلب التزاوج الذي أرسلته.",
        )

        send_email_payload(
            to_email=requester.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                'email_type': 'breeding_request_approved',
                'breeding_request_id': breeding_request.id,
                'requester_id': requester.id,
            },
        )
        logger.info("Breeding request approved email sent to %s", requester.email)
    except Exception as exc:
        logger.error("Error sending breeding request approved email: %s", exc)


def send_adoption_request_email(adoption_request):
    """إرسال إيميل عند إنشاء طلب تبني جديد."""
    try:
        pet_owner = adoption_request.pet.owner
        pet = adoption_request.pet

        if not pet_owner.email:
            logger.warning("No email found for pet owner %s", pet_owner.id)
            return

        subject = f"طلب تبني جديد لحيوانك {pet.name}"
        app_link = f"petow://adoption-request/{adoption_request.id}"
        fallback_link = f"https://petow.app/requests/adoption/{adoption_request.id}"

        text_body = (
            f"مرحباً {_display_name(pet_owner)},\n\n"
            f"لديك طلب تبني جديد لحيوانك {pet.name}.\n\n"
            "معلومات طالب التبني:\n"
            f"- الاسم: {adoption_request.adopter_name}\n"
            f"- البريد الإلكتروني: {adoption_request.adopter_email}\n"
            f"- رقم الهاتف: {adoption_request.adopter_phone}\n"
            f"- العمر: {adoption_request.adopter_age}\n"
            f"- المهنة: {adoption_request.adopter_occupation}\n"
            f"- العنوان: {adoption_request.adopter_address}\n\n"
            "معلومات السكن:\n"
            f"- نوع السكن: {adoption_request.housing_type}\n"
            f"- عدد أفراد العائلة: {adoption_request.family_members}\n\n"
            "الخبرة والاستعداد:\n"
            f"- مستوى الخبرة: {adoption_request.experience_level}\n"
            f"- الوقت المتاح: {adoption_request.time_availability}\n\n"
            f"سبب التبني:\n{adoption_request.reason_for_adoption}\n\n"
            f"فتح الطلب داخل التطبيق: {app_link}\n"
            f"رابط بديل عبر الويب: {fallback_link}\n\n"
            "سبب استلامك لهذا البريد: حدث جديد متعلق بطلب تبني لحيوانك.\n\n"
            "فريق Petow"
        )

        html_body = build_rtl_email_html(
            title=f"طلب تبني جديد لحيوانك {pet.name}",
            body_html=(
                f"<p style=\"margin:0 0 12px;\">مرحباً {_display_name(pet_owner)}، وصل طلب تبني جديد.</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>الاسم:</strong> {adoption_request.adopter_name}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>البريد الإلكتروني:</strong> {adoption_request.adopter_email}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>الهاتف:</strong> {adoption_request.adopter_phone}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>العمر:</strong> {adoption_request.adopter_age}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>المهنة:</strong> {adoption_request.adopter_occupation}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>العنوان:</strong> {adoption_request.adopter_address}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>سبب التبني:</strong> {adoption_request.reason_for_adoption}</p>"
            ),
            primary_label="مراجعة الطلب داخل التطبيق",
            primary_url=app_link,
            secondary_label="رابط بديل عبر الويب",
            secondary_url=fallback_link,
            why_you_received="سبب استلامك لهذا البريد: حدث جديد متعلق بطلب تبني لحيوانك.",
        )

        send_email_payload(
            to_email=pet_owner.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                'email_type': 'adoption_request_received',
                'adoption_request_id': adoption_request.id,
                'owner_id': pet_owner.id,
            },
        )
        logger.info("Adoption request email sent to %s", pet_owner.email)
    except Exception as exc:
        logger.error("Error sending adoption request email: %s", exc)


def send_adoption_request_approved_email(adoption_request):
    """إرسال إيميل عند قبول طلب التبني."""
    try:
        adopter = adoption_request.adopter
        pet_owner = adoption_request.pet.owner
        pet = adoption_request.pet

        if not adopter.email:
            logger.warning("No email found for adopter %s", adopter.id)
            return

        subject = f"تم قبول طلب تبني {pet.name}!"
        app_link = f"petow://adoption-request/{adoption_request.id}"
        fallback_link = f"https://petow.app/requests/adoption/{adoption_request.id}"

        text_body = (
            f"مرحباً {_display_name(adopter)},\n\n"
            "مبروك! تم قبول طلب التبني الخاص بك.\n\n"
            "تفاصيل الحيوان:\n"
            f"- الاسم: {pet.name}\n"
            f"- النوع: {pet.get_pet_type_display()}\n"
            f"- السلالة: {pet.breed.name}\n"
            f"- العمر: {pet.age_display}\n\n"
            "معلومات المالك:\n"
            f"- الاسم: {_display_name(pet_owner)}\n"
            f"- رقم الهاتف: {pet_owner.phone}\n"
        )
        if adoption_request.notes:
            text_body += f"- ملاحظات من المالك: {adoption_request.notes}\n"
        text_body += (
            "\n"
            f"فتح الطلب داخل التطبيق: {app_link}\n"
            f"رابط بديل عبر الويب: {fallback_link}\n\n"
            "سبب استلامك لهذا البريد: تم قبول طلب التبني الذي أرسلته.\n\n"
            "فريق Petow"
        )

        html_body = build_rtl_email_html(
            title=f"تم قبول طلب تبني {pet.name} ✅",
            body_html=(
                f"<p style=\"margin:0 0 12px;\">مرحباً {_display_name(adopter)}، مبروك تم قبول طلبك.</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>الحيوان:</strong> {pet.name}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>النوع:</strong> {pet.get_pet_type_display()}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>السلالة:</strong> {pet.breed.name}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>العمر:</strong> {pet.age_display}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>اسم المالك:</strong> {_display_name(pet_owner)}</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>هاتف المالك:</strong> {pet_owner.phone}</p>"
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>ملاحظات المالك:</strong> {adoption_request.notes}</p>"
                    if adoption_request.notes else ""
                )
            ),
            primary_label="فتح الطلب داخل التطبيق",
            primary_url=app_link,
            secondary_label="رابط بديل عبر الويب",
            secondary_url=fallback_link,
            why_you_received="سبب استلامك لهذا البريد: تم قبول طلب التبني الذي أرسلته.",
        )

        send_email_payload(
            to_email=adopter.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                'email_type': 'adoption_request_approved',
                'adoption_request_id': adoption_request.id,
                'adopter_id': adopter.id,
            },
        )
        logger.info("Adoption request approved email sent to %s", adopter.email)
    except Exception as exc:
        logger.error("Error sending adoption request approved email: %s", exc)


def get_daily_unread_reminder_candidates(target_date=None, sample_limit=10):
    """Return exact eligible candidates for daily unread reminder emails."""
    target_date = target_date or timezone.localdate()
    users_with_unread = User.objects.filter(
        notifications__type='chat_message_received',
        notifications__is_read=False,
        notifications__created_at__date=target_date,
    ).distinct()

    eligible_users = []
    skipped_missing_email = 0
    skipped_opt_out = 0
    skipped_deduped = 0

    for user in users_with_unread:
        if not user.email:
            skipped_missing_email += 1
            continue

        settings_obj = UserNotificationSettings.objects.filter(user=user).first()
        allow_reminders = True
        allow_reminder_email = True
        if settings_obj:
            allow_reminders = bool(settings_obj.allow_reminders)
            allow_reminder_email = bool(getattr(settings_obj, 'allow_reminder_email', True))

        if not allow_reminders or not allow_reminder_email:
            skipped_opt_out += 1
            continue

        already_sent = EmailReminderDispatch.objects.filter(
            user=user,
            reminder_key=EmailReminderDispatch.REMINDER_DAILY_UNREAD_MESSAGES,
            target_date=target_date,
            status=EmailReminderDispatch.STATUS_SENT,
        ).exists()
        if already_sent:
            skipped_deduped += 1
            continue

        eligible_users.append(user)

    sample_recipients = [user.email for user in eligible_users[:max(sample_limit, 0)]]
    return {
        'target_date': target_date.isoformat(),
        'users_with_unread': users_with_unread.count(),
        'eligible_users': eligible_users,
        'eligible_count': len(eligible_users),
        'sample_recipients': sample_recipients,
        'skipped_missing_email': skipped_missing_email,
        'skipped_opt_out': skipped_opt_out,
        'skipped_deduped': skipped_deduped,
    }


def _reserve_dispatch(user, target_date, unread_count):
    """Reserve one reminder dispatch row to dedupe reruns."""
    in_flight_window = timezone.now() - timedelta(minutes=15)
    with transaction.atomic():
        dispatch, _ = EmailReminderDispatch.objects.select_for_update().get_or_create(
            user=user,
            reminder_key=EmailReminderDispatch.REMINDER_DAILY_UNREAD_MESSAGES,
            target_date=target_date,
            defaults={
                'recipient_email': user.email or '',
                'status': EmailReminderDispatch.STATUS_PENDING,
                'metadata': {},
            },
        )

        if dispatch.status == EmailReminderDispatch.STATUS_SENT:
            return None, 'already_sent'
        if (
            dispatch.status == EmailReminderDispatch.STATUS_PROCESSING
            and dispatch.updated_at >= in_flight_window
        ):
            return None, 'already_processing'

        metadata = dict(dispatch.metadata or {})
        metadata['unread_count'] = unread_count
        dispatch.status = EmailReminderDispatch.STATUS_PROCESSING
        dispatch.attempts = int(dispatch.attempts or 0) + 1
        dispatch.recipient_email = user.email or ''
        dispatch.last_error = ''
        dispatch.metadata = metadata
        dispatch.save(update_fields=['status', 'attempts', 'recipient_email', 'last_error', 'metadata', 'updated_at'])
        return dispatch, None


def _mark_dispatch_success(dispatch, senders):
    metadata = dict(dispatch.metadata or {})
    metadata['senders'] = list(senders)
    dispatch.status = EmailReminderDispatch.STATUS_SENT
    dispatch.sent_at = timezone.now()
    dispatch.last_error = ''
    dispatch.metadata = metadata
    dispatch.save(update_fields=['status', 'sent_at', 'last_error', 'metadata', 'updated_at'])


def _mark_dispatch_failed(dispatch, error_text):
    dispatch.status = EmailReminderDispatch.STATUS_FAILED
    dispatch.last_error = (error_text or '')[:500]
    dispatch.save(update_fields=['status', 'last_error', 'updated_at'])


def send_daily_unread_messages_reminder(target_date=None):
    """إرسال تذكير يومي بالرسائل غير المقروءة."""
    target_date = target_date or timezone.localdate()
    summary = get_daily_unread_reminder_candidates(target_date=target_date)
    eligible_users = summary.pop('eligible_users')

    attempted = 0
    sent = 0
    failed = 0
    skipped_zero_unread = 0
    skipped_deduped_runtime = 0
    failure_reasons = {}

    for user in eligible_users:
        unread_notifications = Notification.objects.filter(
            user=user,
            type='chat_message_received',
            is_read=False,
            created_at__date=target_date,
        )
        unread_count = unread_notifications.count()
        if unread_count == 0:
            skipped_zero_unread += 1
            continue

        dispatch, reserve_reason = _reserve_dispatch(user, target_date, unread_count)
        if dispatch is None:
            skipped_deduped_runtime += 1
            logger.info(
                "daily_reminder_email_suppressed user_id=%s reason=%s target_date=%s",
                user.id,
                reserve_reason,
                target_date.isoformat(),
            )
            continue

        attempted += 1
        senders = {
            (notification.extra_data or {}).get('sender_name')
            for notification in unread_notifications
            if (notification.extra_data or {}).get('sender_name')
        }
        senders.discard(None)

        subject = f"لديك {unread_count} رسالة غير مقروءة في Petow"
        app_link = "petow://chat"
        fallback_link = "https://petow.app/chat"

        text_body = (
            f"مرحباً {_display_name(user)},\n\n"
            f"لديك {unread_count} رسالة غير مقروءة في محادثات التزاوج والتبني.\n"
            + (f"الرسائل من: {', '.join(sorted(senders))}\n" if senders else "")
            + "\n"
            "يرجى مراجعة الرسائل والرد في أقرب وقت.\n"
            f"فتح المحادثات داخل التطبيق: {app_link}\n"
            f"رابط بديل عبر الويب: {fallback_link}\n\n"
            "سبب استلامك لهذا البريد: تنبيه يومي بوجود رسائل غير مقروءة.\n"
            "إذا لم ترغب بهذه التذكيرات يمكنك تعطيلها من إعدادات الإشعارات.\n\n"
            "فريق Petow"
        )

        html_body = build_rtl_email_html(
            title=f"لديك {unread_count} رسالة غير مقروءة",
            body_html=(
                f"<p style=\"margin:0 0 12px;\">مرحباً {_display_name(user)}، لديك رسائل تنتظر ردك.</p>"
                f"<p style=\"margin:0 0 10px;\"><strong>عدد الرسائل غير المقروءة:</strong> {unread_count}</p>"
                + (
                    f"<p style=\"margin:0 0 10px;\"><strong>المرسلون:</strong> {', '.join(sorted(senders))}</p>"
                    if senders else ""
                )
                + "<p style=\"margin:0 0 10px;\">راجع المحادثات الآن للحفاظ على فرص التبني/التزاوج نشطة.</p>"
            ),
            primary_label="فتح المحادثات داخل التطبيق",
            primary_url=app_link,
            secondary_label="رابط بديل عبر الويب",
            secondary_url=fallback_link,
            why_you_received="سبب استلامك لهذا البريد: تنبيه يومي بوجود رسائل غير مقروءة.",
        )

        try:
            send_email_payload(
                to_email=user.email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                category=EMAIL_CATEGORY_REMINDER,
                metadata={
                    'email_type': 'daily_unread_messages',
                    'user_id': user.id,
                    'unread_count': unread_count,
                    'target_date': target_date.isoformat(),
                },
            )
            _mark_dispatch_success(dispatch, senders)
            sent += 1
        except Exception as exc:
            _mark_dispatch_failed(dispatch, str(exc))
            failed += 1
            reason = str(getattr(exc, 'classification', exc.__class__.__name__))
            failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
            logger.error(
                "daily_reminder_email_failed user_id=%s target_date=%s error=%s",
                user.id,
                target_date.isoformat(),
                exc,
            )

    result = {
        **summary,
        'target_date': target_date.isoformat(),
        'attempted': attempted,
        'sent': sent,
        'failed': failed,
        'failure_reasons': failure_reasons,
        'skipped_zero_unread': skipped_zero_unread,
        'skipped_deduped_runtime': skipped_deduped_runtime,
    }
    logger.info("daily_reminder_email_summary=%s", result)
    return result
