"""
Utilities for creating and managing notifications
"""
from .models import Notification, Pet, BreedingRequest
from accounts.models import User

def create_notification(
    user,
    notification_type,
    title,
    message,
    related_pet=None,
    related_breeding_request=None,
    extra_data=None
):
    """
    إنشاء إشعار جديد
    
    Args:
        user: المستخدم المرسل إليه الإشعار
        notification_type: نوع الإشعار
        title: عنوان الإشعار
        message: محتوى الإشعار
        related_pet: الحيوان المرتبط (اختياري)
        related_breeding_request: طلب المقابلة المرتبط (اختياري)
        extra_data: بيانات إضافية (اختياري)
    
    Returns:
        Notification: الإشعار المُنشأ
    """
    return Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        related_pet=related_pet,
        related_breeding_request=related_breeding_request,
        extra_data=extra_data or {}
    )

def notify_breeding_request_received(breeding_request):
    """إشعار باستلام طلب مقابلة جديد"""
    receiver = breeding_request.receiver
    target_pet = breeding_request.target_pet
    requester_pet = breeding_request.requester_pet
    
    title = f"طلب مقابلة جديد من {breeding_request.requester.get_full_name()}"
    message = f"يريد {breeding_request.requester.get_full_name()} ترتيب مقابلة بين {requester_pet.name} و {target_pet.name}"
    
    # إضافة معلومات العيادة البيطرية إذا كانت متوفرة
    extra_data = {
        'requester_name': breeding_request.requester.get_full_name(),
        'requester_pet_name': requester_pet.name,
        'meeting_date': breeding_request.meeting_date.isoformat(),
    }
    
    # إضافة معلومات العيادة البيطرية فقط إذا كانت متوفرة
    if breeding_request.veterinary_clinic:
        extra_data['clinic_name'] = breeding_request.veterinary_clinic.name
        message += f" في {breeding_request.veterinary_clinic.name}"
    else:
        message += " (مكان المقابلة سيتم تحديده لاحقاً)"
    
    return create_notification(
        user=receiver,
        notification_type='breeding_request_received',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data=extra_data
    )

def notify_breeding_request_approved(breeding_request):
    """إشعار بقبول طلب المقابلة"""
    requester = breeding_request.requester
    target_pet = breeding_request.target_pet
    
    # تخصيص الرسالة بناءً على وجود العيادة البيطرية
    if breeding_request.veterinary_clinic:
        title = f"تم قبول طلب مقابلتك مع {target_pet.name}"
        message = f"تم قبول طلب المقابلة الخاص بك! يمكنك الآن ترتيب المقابلة في {breeding_request.veterinary_clinic.name}"
        
        extra_data = {
            'clinic_name': breeding_request.veterinary_clinic.name,
            'clinic_phone': breeding_request.veterinary_clinic.phone,
            'meeting_date': breeding_request.meeting_date.isoformat()
        }
    else:
        title = f"تم قبول طلب مقابلتك مع {target_pet.name}"
        message = f"تم قبول طلب المقابلة الخاص بك! يمكنك الآن ترتيب المقابلة في المكان المناسب لكما."
        
        extra_data = {
            'meeting_date': breeding_request.meeting_date.isoformat()
        }
    
    return create_notification(
        user=requester,
        notification_type='breeding_request_approved',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data=extra_data
    )

def notify_breeding_request_rejected(breeding_request):
    """إشعار برفض طلب المقابلة"""
    requester = breeding_request.requester
    target_pet = breeding_request.target_pet
    
    title = f"تم رفض طلب مقابلتك مع {target_pet.name}"
    message = f"نأسف، تم رفض طلب المقابلة الخاص بك. يمكنك البحث عن حيوانات أخرى للتزاوج."
    
    return create_notification(
        user=requester,
        notification_type='breeding_request_rejected',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data={
            'rejection_reason': breeding_request.response_message or ''
        }
    )

def notify_breeding_request_completed(breeding_request):
    """إشعار بإكمال المقابلة"""
    # إشعار لكلا الطرفين
    notifications = []
    
    for user in [breeding_request.requester, breeding_request.receiver]:
        title = "تم إكمال المقابلة بنجاح"
        message = f"تم إكمال مقابلة التزاوج بنجاح! نتمنى لكم التوفيق."
        
        notification = create_notification(
            user=user,
            notification_type='breeding_request_completed',
            title=title,
            message=message,
            related_breeding_request=breeding_request,
            extra_data={
                'completed_date': breeding_request.completed_at.isoformat() if breeding_request.completed_at else None
            }
        )
        notifications.append(notification)
    
    return notifications

def notify_favorite_added(pet, user_who_favorited):
    """إشعار بإضافة الحيوان إلى المفضلة"""
    pet_owner = pet.owner
    
    if pet_owner == user_who_favorited:
        return None  # لا نرسل إشعار إذا أضاف المالك حيوانه إلى المفضلة
    
    title = f"تم إضافة {pet.name} إلى المفضلة"
    message = f"قام {user_who_favorited.get_full_name()} بإضافة حيوانك {pet.name} إلى قائمة المفضلة!"
    
    return create_notification(
        user=pet_owner,
        notification_type='favorite_added',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'user_name': user_who_favorited.get_full_name()
        }
    )

def notify_pet_status_changed(pet, old_status, new_status):
    """إشعار بتغيير حالة الحيوان"""
    pet_owner = pet.owner
    
    title = f"تم تغيير حالة {pet.name}"
    message = f"تم تغيير حالة حيوانك {pet.name} من {old_status} إلى {new_status}"
    
    return create_notification(
        user=pet_owner,
        notification_type='pet_status_changed',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'old_status': old_status,
            'new_status': new_status
        }
    )

def send_system_message(user, title, message, extra_data=None):
    """إرسال رسالة نظام"""
    return create_notification(
        user=user,
        notification_type='system_message',
        title=title,
        message=message,
        extra_data=extra_data or {}
    ) 