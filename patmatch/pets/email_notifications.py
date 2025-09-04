"""
نظام الإشعارات المحسن عبر الإيميل
"""
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from .models import Notification, BreedingRequest, AdoptionRequest, ChatRoom
from accounts.models import User
import logging

logger = logging.getLogger(__name__)

def send_breeding_request_email(breeding_request):
    """إرسال إيميل عند إنشاء طلب تزاوج جديد"""
    try:
        receiver = breeding_request.receiver
        requester = breeding_request.requester
        target_pet = breeding_request.target_pet
        requester_pet = breeding_request.requester_pet
        
        if not receiver.email:
            logger.warning(f"No email found for user {receiver.id}")
            return
        
        subject = f"طلب تزاوج جديد لحيوانك {target_pet.name}"
        
        message = f"""
مرحباً {receiver.get_full_name()},

لديك طلب تزاوج جديد لحيوانك {target_pet.name}.

تفاصيل الطلب:
- المرسل: {requester.get_full_name()}
- حيوان المرسل: {requester_pet.name} ({requester_pet.get_pet_type_display()})
- تاريخ المقابلة المقترح: {breeding_request.meeting_date}
- رقم التواصل: {breeding_request.contact_phone}

"""
        
        if breeding_request.message:
            message += f"رسالة من المرسل:\n{breeding_request.message}\n\n"
        
        if breeding_request.veterinary_clinic:
            message += f"العيادة البيطرية المقترحة: {breeding_request.veterinary_clinic.name}\n\n"
        
        message += """
يمكنك مراجعة الطلب والرد عليه من خلال موقع Peto.

مع تحيات فريق Peto
"""
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[receiver.email],
            fail_silently=False
        )
        
        logger.info(f"Breeding request email sent to {receiver.email}")
        
    except Exception as e:
        logger.error(f"Error sending breeding request email: {str(e)}")

def send_breeding_request_approved_email(breeding_request):
    """إرسال إيميل عند قبول طلب التزاوج"""
    try:
        requester = breeding_request.requester
        receiver = breeding_request.receiver
        target_pet = breeding_request.target_pet
        
        if not requester.email:
            logger.warning(f"No email found for user {requester.id}")
            return
        
        subject = f"تم قبول طلب التزاوج مع {target_pet.name}!"
        
        message = f"""
مرحباً {requester.get_full_name()},

تم قبول طلب التزاوج الخاص بك!

تفاصيل المقابلة:
- الحيوان: {target_pet.name}
- مالك الحيوان: {receiver.get_full_name()}
- تاريخ المقابلة: {breeding_request.meeting_date}

"""
        
        if breeding_request.veterinary_clinic:
            message += f"العيادة البيطرية: {breeding_request.veterinary_clinic.name}\n"
            message += f"هاتف العيادة: {breeding_request.veterinary_clinic.phone}\n\n"
        
        if breeding_request.response_message:
            message += f"رسالة من المالك:\n{breeding_request.response_message}\n\n"
        
        message += """
يمكنك الآن التواصل مع المالك الآخر لترتيب تفاصيل المقابلة.

مع تحيات فريق Peto
"""
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[requester.email],
            fail_silently=False
        )
        
        logger.info(f"Breeding request approved email sent to {requester.email}")
        
    except Exception as e:
        logger.error(f"Error sending breeding request approved email: {str(e)}")

def send_adoption_request_email(adoption_request):
    """إرسال إيميل عند إنشاء طلب تبني جديد"""
    try:
        pet_owner = adoption_request.pet.owner
        adopter = adoption_request.adopter
        pet = adoption_request.pet
        
        if not pet_owner.email:
            logger.warning(f"No email found for pet owner {pet_owner.id}")
            return
        
        subject = f"طلب تبني جديد لحيوانك {pet.name}"
        
        message = f"""
مرحباً {pet_owner.get_full_name()},

لديك طلب تبني جديد لحيوانك {pet.name}.

معلومات طالب التبني:
- الاسم: {adoption_request.adopter_name}
- البريد الإلكتروني: {adoption_request.adopter_email}
- رقم الهاتف: {adoption_request.adopter_phone}
- العمر: {adoption_request.adopter_age}
- المهنة: {adoption_request.adopter_occupation}
- العنوان: {adoption_request.adopter_address}

معلومات السكن:
- نوع السكن: {adoption_request.housing_type}
- عدد أفراد العائلة: {adoption_request.family_members}

الخبرة والاستعداد:
- مستوى الخبرة: {adoption_request.experience_level}
- الوقت المتاح: {adoption_request.time_availability}

سبب التبني:
{adoption_request.reason_for_adoption}

يمكنك مراجعة الطلب والرد عليه من خلال تطبيق Peto.

مع تحيات فريق Peto
"""
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[pet_owner.email],
            fail_silently=False
        )
        
        logger.info(f"Adoption request email sent to {pet_owner.email}")
        
    except Exception as e:
        logger.error(f"Error sending adoption request email: {str(e)}")

def send_adoption_request_approved_email(adoption_request):
    """إرسال إيميل عند قبول طلب التبني"""
    try:
        adopter = adoption_request.adopter
        pet_owner = adoption_request.pet.owner
        pet = adoption_request.pet
        
        if not adopter.email:
            logger.warning(f"No email found for adopter {adopter.id}")
            return
        
        subject = f"تم قبول طلب تبني {pet.name}!"
        
        message = f"""
مرحباً {adoption_request.adopter_name},

مبروك! تم قبول طلب التبني الخاص بك.

تفاصيل الحيوان:
- الاسم: {pet.name}
- النوع: {pet.get_pet_type_display()}
- السلالة: {pet.breed.name}
- العمر: {pet.age_display}

معلومات المالك:
- الاسم: {pet_owner.get_full_name()}
- رقم الهاتف: {pet_owner.phone}

"""
        
        if adoption_request.notes:
            message += f"ملاحظات من المالك:\n{adoption_request.notes}\n\n"
        
        message += """
يمكنك الآن التواصل مع المالك لترتيب عملية التسليم.

مع تحيات فريق Peto
"""
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[adopter.email],
            fail_silently=False
        )
        
        logger.info(f"Adoption request approved email sent to {adopter.email}")
        
    except Exception as e:
        logger.error(f"Error sending adoption request approved email: {str(e)}")

def send_daily_unread_messages_reminder():
    """إرسال تذكرة يومية للرسائل غير المقروءة في نهاية اليوم"""
    try:
        # البحث عن المستخدمين الذين لديهم رسائل غير مقروءة
        users_with_unread = User.objects.filter(
            notifications__type='chat_message_received',
            notifications__is_read=False,
            notifications__created_at__date=timezone.now().date()
        ).distinct()
        
        for user in users_with_unread:
            if not user.email:
                continue
                
            # عد الرسائل غير المقروءة لهذا المستخدم
            unread_count = Notification.objects.filter(
                user=user,
                type='chat_message_received',
                is_read=False,
                created_at__date=timezone.now().date()
            ).count()
            
            if unread_count == 0:
                continue
            
            # الحصول على أسماء المرسلين
            unread_notifications = Notification.objects.filter(
                user=user,
                type='chat_message_received',
                is_read=False,
                created_at__date=timezone.now().date()
            ).select_related('related_chat_room')
            
            senders = set()
            for notification in unread_notifications:
                if 'sender_name' in notification.extra_data:
                    senders.add(notification.extra_data['sender_name'])
            
            subject = f"لديك {unread_count} رسالة غير مقروءة في Peto"
            
            message = f"""
مرحباً {user.get_full_name()},

لديك {unread_count} رسالة غير مقروءة في محادثات التزاوج والتبني.

"""
            
            if senders:
                message += f"الرسائل من: {', '.join(senders)}\n\n"
            
            message += """
يرجى مراجعة رسائلك والرد عليها في أقرب وقت ممكن للحفاظ على تجربة جيدة لجميع المستخدمين.

يمكنك مراجعة رسائلك من خلال تطبيق Peto.

مع تحيات فريق Peto
"""
            
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False
            )
            
            logger.info(f"Daily reminder email sent to {user.email} for {unread_count} unread messages")
        
        logger.info(f"Daily reminder emails sent to {len(users_with_unread)} users")
        return len(users_with_unread)
        
    except Exception as e:
        logger.error(f"Error sending daily reminder emails: {str(e)}")
        return 0 