from django.db import models
from django.conf import settings
from django.utils import timezone
from accounts.models import User

class Breed(models.Model):
    """نموذج السلالات"""
    PET_TYPE_CHOICES = [
        ('cats', 'قطط'),
        ('dogs', 'كلاب'),
    ]
    
    name = models.CharField(max_length=100)
    pet_type = models.CharField(
        max_length=20, 
        choices=PET_TYPE_CHOICES, 
        default='cats',
        help_text="نوع الحيوان الذي تنتمي إليه هذه السلالة"
    )
    description = models.TextField(blank=True, null=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "سلالة"
        verbose_name_plural = "السلالات"
        unique_together = [['name', 'pet_type']]

class Pet(models.Model):
    """نموذج الحيوانات الأليفة للتزاوج"""
    
    GENDER_CHOICES = [
        ('M', 'ذكر'),
        ('F', 'أنثى'),
    ]
    
    STATUS_CHOICES = [
        ('available', 'متاح للتزاوج'),
        ('mating', 'في عملية التزاوج'),
        ('pregnant', 'حامل'),
        ('unavailable', 'غير متاح'),
        ('available_for_adoption', 'متاح للتبني'),
        ('adoption_pending', 'التبني قيد المراجعة'),
        ('adopted', 'تم تبنيه'),
    ]
    
    PET_TYPE_CHOICES = [
        ('cats', 'قطط'),
        ('dogs', 'كلاب'),
    ]
    
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE,
        related_name='pets'
    )
    name = models.CharField(max_length=100)
    pet_type = models.CharField(max_length=20, choices=PET_TYPE_CHOICES, default='cats')
    breed = models.ForeignKey(Breed, on_delete=models.CASCADE)
    age_months = models.PositiveIntegerField(help_text="العمر بالشهور")
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    description = models.TextField()
    
    # معلومات التزاوج
    breeding_history = models.TextField(blank=True, null=True, help_text="تاريخ التزاوج السابق")
    last_breeding_date = models.DateField(blank=True, null=True, help_text="تاريخ آخر تزاوج")
    number_of_offspring = models.PositiveIntegerField(default=0, help_text="عدد النتاج السابق")
    
    # خصائص سلوكية
    is_trained = models.BooleanField(default=False, help_text="مدرب أم لا")
    good_with_kids = models.BooleanField(default=True, help_text="مناسب للأطفال")
    good_with_pets = models.BooleanField(default=True, help_text="مناسب مع الحيوانات الأخرى")
    
    # تفضيلات الأليف
    HOSTING_PREFERENCE_CHOICES = [
        ('my_place', 'عندي (في منزلي/حديقتي)'),
        ('other_place', 'عند صاحب الحيوان الآخر'),
        ('both', 'كلاهما مناسب'),
        ('flexible', 'مرن'),
    ]
    hosting_preference = models.CharField(
        max_length=20, 
        choices=HOSTING_PREFERENCE_CHOICES, 
        default='flexible',
        help_text="تفضيل الأليف"
    )
    
    # صور الحيوان
    main_image = models.ImageField(upload_to='pets/main/')
    image_2 = models.ImageField(upload_to='pets/', blank=True, null=True)
    image_3 = models.ImageField(upload_to='pets/', blank=True, null=True)
    image_4 = models.ImageField(upload_to='pets/', blank=True, null=True)
    
    # الشهادات الصحية
    vaccination_certificate = models.FileField(
        upload_to='pets/certificates/vaccination/', 
        blank=True, 
        null=True,
        help_text="شهادة التطعيمات (PDF, JPG, PNG)"
    )
    health_certificate = models.FileField(
        upload_to='pets/certificates/health/', 
        blank=True, 
        null=True,
        help_text="الشهادة الصحية البيطرية (PDF, JPG, PNG)"
    )
    disease_free_certificate = models.FileField(
        upload_to='pets/certificates/disease_free/', 
        blank=True, 
        null=True,
        help_text="شهادة خلو من الأمراض (PDF, JPG, PNG)"
    )
    additional_certificate = models.FileField(
        upload_to='pets/certificates/additional/', 
        blank=True, 
        null=True,
        help_text="شهادة إضافية (PDF, JPG, PNG)"
    )
    
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='available')
    location = models.CharField(max_length=200, help_text="الموقع (المدينة/الحي)")
    latitude = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    
    # معلومات التبني
    is_free = models.BooleanField(default=True, help_text="هل التبني مجاني؟")
    
    # معلومات التزاوج
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} ({self.get_pet_type_display()})"
    
    @property
    def age_display(self):
        """عرض العمر بتنسيق مقروء"""
        if self.age_months < 12:
            return f"{self.age_months} شهر"
        else:
            years = self.age_months // 12
            months = self.age_months % 12
            if months == 0:
                return f"{years} سنة"
            else:
                return f"{years} سنة و {months} شهر"
    
    @property
    def pet_type_display(self):
        """عرض نوع الحيوان بشكل مفهوم"""
        pet_type_choices = dict(self.PET_TYPE_CHOICES)
        return pet_type_choices.get(self.pet_type, self.pet_type)
    
    @property
    def gender_display(self):
        """عرض الجنس بشكل مفهوم"""
        gender_choices = dict(self.GENDER_CHOICES)
        return gender_choices.get(self.gender, self.gender)
    
    @property
    def status_display(self):
        """عرض الحالة بشكل مفهوم"""
        status_choices = dict(self.STATUS_CHOICES)
        return status_choices.get(self.status, self.status)
    
    @property
    def price_display(self):
        """عرض السعر بتنسيق مقروء"""
        if self.is_free:
            return "مجاني"
        elif self.adoption_fee:
            return f"{self.adoption_fee} ريال"
        else:
            return "غير محدد"
    
    @property
    def has_health_certificates(self):
        """التحقق من وجود شهادات صحية"""
        return bool(
            self.vaccination_certificate or 
            self.health_certificate or 
            self.disease_free_certificate or 
            self.additional_certificate
        )
    
    def calculate_distance(self, user_lat, user_lng):
        """حساب المسافة بين الحيوان والمستخدم بالكيلومتر"""
        if not self.latitude or not self.longitude:
            return None
            
        import math
        
        # تحويل إلى راديان
        lat1 = math.radians(float(self.latitude))
        lon1 = math.radians(float(self.longitude))
        lat2 = math.radians(float(user_lat))
        lon2 = math.radians(float(user_lng))
        
        # فرق الإحداثيات
        dLat = lat2 - lat1
        dLon = lon2 - lon1
        
        # معادلة هافرسين لحساب المسافة
        a = (math.sin(dLat/2) * math.sin(dLat/2) + 
             math.cos(lat1) * math.cos(lat2) * 
             math.sin(dLon/2) * math.sin(dLon/2))
        
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        # نصف قطر الأرض بالكيلومتر
        R = 6371
        
        # المسافة بالكيلومتر
        distance = R * c
        
        return round(distance, 2)
    
    def get_distance_display(self, user_lat, user_lng):
        """عرض المسافة بشكل مفهوم"""
        # التحقق من وجود إحداثيات للحيوان
        if not self.latitude or not self.longitude:
            return "إحداثيات الموقع غير متوفرة"
        
        distance = self.calculate_distance(user_lat, user_lng)
        
        if distance is None:
            return "خطأ في حساب المسافة"
        
        if distance < 1:
            return f"{int(distance * 1000)} متر"
        elif distance < 100:
            return f"{distance:.1f} كم"
        else:
            return f"{int(distance)} كم"
    
    class Meta:
        verbose_name = "حيوان أليف"
        verbose_name_plural = "الحيوانات الأليفة"
        ordering = ['-created_at']

class PetImage(models.Model):
    """صور إضافية للحيوانات"""
    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='additional_images')
    image = models.ImageField(upload_to='pets/additional/')
    caption = models.CharField(max_length=200, blank=True, null=True)
    
    def __str__(self):
        return f"صورة {self.pet.name}"

class VeterinaryClinic(models.Model):
    """نموذج العيادات البيطرية"""
    
    name = models.CharField(max_length=200, help_text="اسم العيادة")
    code = models.CharField(max_length=50, unique=True, help_text="رمز العيادة")
    address = models.TextField(help_text="العنوان الكامل")
    city = models.CharField(max_length=100, help_text="المدينة")
    phone = models.CharField(max_length=20, help_text="رقم الهاتف")
    email = models.EmailField(blank=True, null=True, help_text="البريد الإلكتروني")
    working_hours = models.CharField(max_length=100, help_text="ساعات العمل")
    is_active = models.BooleanField(default=True, help_text="نشط")
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.name} - {self.city}"
    
    class Meta:
        verbose_name = "عيادة بيطرية"
        verbose_name_plural = "العيادات البيطرية"
        ordering = ['city', 'name']

class BreedingRequest(models.Model):
    """نموذج طلبات المقابلة للتزاوج"""
    
    STATUS_CHOICES = [
        ('pending', 'في انتظار المراجعة'),
        ('approved', 'تم الموافقة'),
        ('rejected', 'تم الرفض'),
        ('completed', 'تمت المقابلة'),
        ('cancelled', 'ملغي'),
    ]
    
    # الحيوانات المطلوب للمقابلة
    target_pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='received_breeding_requests', help_text="الحيوان المطلوب للمقابلة")
    requester_pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='sent_breeding_requests', help_text="حيوان المرسل")
    
    # المالكين
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_breeding_requests')
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='received_breeding_requests')
    
    # تفاصيل المقابلة
    message = models.TextField(blank=True, null=True, help_text="رسالة من الطالب")
    meeting_date = models.DateField(blank=True, null=True, help_text="تاريخ المقابلة المقترح (اختياري)")
    veterinary_clinic = models.ForeignKey(VeterinaryClinic, on_delete=models.CASCADE, blank=True, null=True, help_text="العيادة البيطرية للمقابلة (اختياري)")
    contact_phone = models.CharField(max_length=20, help_text="رقم الهاتف للتواصل")
    
    # الاتفاق المالي
    agreed_fee = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    fee_paid_by = models.CharField(max_length=50, choices=[
        ('requester', 'الطالب'),
        ('receiver', 'المالك الآخر'),
        ('split', 'مناصفة'),
    ], default='requester')
    
    # حالة الطلب
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    response_message = models.TextField(blank=True, null=True, help_text="رد المالك الآخر")
    
    # التواريخ
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    
    def __str__(self):
        return f"طلب مقابلة: {self.requester_pet.name} مع {self.target_pet.name}"
    
    class Meta:
        verbose_name = "طلب مقابلة"
        verbose_name_plural = "طلبات المقابلة"
        ordering = ['-created_at']

    def create_chat_room(self):
        """إنشاء غرفة محادثة عند قبول الطلب"""
        if self.status == 'accepted' and not hasattr(self, 'chat_room'):
            chat_room = ChatRoom.objects.create(breeding_request=self)
            return chat_room
        return getattr(self, 'chat_room', None)

class Favorite(models.Model):
    """المفضلات"""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='favorites')
    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='favorited_by')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'pet')
        verbose_name = "مفضلة"
        verbose_name_plural = "المفضلات"
    
    def __str__(self):
        return f"{self.user.email} - {self.pet.name}"

class Notification(models.Model):
    """نموذج الإشعارات"""
    NOTIFICATION_TYPES = [
        ('breeding_request_received', 'تم استلام طلب مقابلة جديد'),
        ('breeding_request_approved', 'تم قبول طلب المقابلة'),
        ('breeding_request_rejected', 'تم رفض طلب المقابلة'),
        ('breeding_request_completed', 'تم إكمال المقابلة'),
        ('favorite_added', 'تم إضافة حيوانك إلى المفضلة'),
        ('pet_status_changed', 'تم تغيير حالة حيوانك'),
        ('system_message', 'رسالة من النظام'),
        ('chat_message_received', 'تم استلام رسالة جديدة'),
        ('pet_nearby', 'حيوان جديد بالقرب منك'),
        ('clinic_broadcast', 'إشعار من العيادة'),
        ('clinic_invite', 'دعوة ربط عيادة'),
        ('breeding_request_pending_reminder', 'تذكير بطلب مقابلة معلق'),
    ]
    
    user = models.ForeignKey(
        'accounts.User', 
        on_delete=models.CASCADE, 
        related_name='notifications',
        help_text="المستخدم المرسل إليه الإشعار"
    )
    type = models.CharField(
        max_length=30, 
        choices=NOTIFICATION_TYPES,
        help_text="نوع الإشعار"
    )
    title = models.CharField(max_length=200, help_text="عنوان الإشعار")
    message = models.TextField(help_text="محتوى الإشعار")
    
    # معلومات إضافية
    related_pet = models.ForeignKey(
        Pet, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True,
        help_text="الحيوان المرتبط بالإشعار"
    )
    related_breeding_request = models.ForeignKey(
        BreedingRequest, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True,
        help_text="طلب المقابلة المرتبط بالإشعار"
    )
    related_chat_room = models.ForeignKey(
        'ChatRoom', 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True,
        help_text="المحادثة المرتبطة بالإشعار"
    )
    
    # حالة الإشعار
    is_read = models.BooleanField(default=False, help_text="تم قراءة الإشعار")
    read_at = models.DateTimeField(null=True, blank=True, help_text="تاريخ القراءة")
    
    # JSON data for additional context
    extra_data = models.JSONField(
        default=dict, 
        blank=True,
        help_text="بيانات إضافية للإشعار"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "إشعار"
        verbose_name_plural = "الإشعارات"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'is_read']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.user.get_full_name()}"
    
    def mark_as_read(self):
        """تعيين الإشعار كمقروء"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
    
    @classmethod
    def create_chat_message_notification(cls, recipient_user, sender_user, chat_room, message_content):
        """إنشاء إشعار رسالة جديدة مع إرسال إشعار دفع."""
        # لا نرسل إشعار للمرسل نفسه
        if recipient_user.id == sender_user.id:
            return None
            
        notification = cls.objects.create(
            user=recipient_user,
            type='chat_message_received',
            title=f'رسالة جديدة من {sender_user.get_full_name()}',
            message=f'{message_content[:100]}...' if len(message_content) > 100 else message_content,
            related_chat_room=chat_room,
            extra_data={
                'sender_name': sender_user.get_full_name(),
                'sender_id': sender_user.id,
                'chat_id': chat_room.firebase_chat_id,
                'message_preview': message_content[:50]
            }
        )

        from .notifications import _send_push_notification  # local import to avoid circular dependency

        push_payload = {
            'type': 'chat_message_received',
            'chat_id': chat_room.firebase_chat_id,
            'sender_id': str(sender_user.id),
            'sender_name': sender_user.get_full_name(),
        }
        _send_push_notification(recipient_user, notification.title, notification.message, push_payload)

        return notification

class ChatRoom(models.Model):
    """غرفة محادثة بين مالكين حيوانات - metadata فقط، الرسائل في Firebase"""
    breeding_request = models.OneToOneField(
        BreedingRequest, 
        on_delete=models.CASCADE,
        related_name='chat_room',
        null=True,
        blank=True,
        help_text="طلب التزاوج المرتبط بالمحادثة"
    )
    
    adoption_request = models.OneToOneField(
        'AdoptionRequest',
        on_delete=models.CASCADE,
        related_name='chat_room',
        null=True,
        blank=True,
        help_text="طلب التبني المرتبط بالمحادثة"
    )
    
    clinic_patient = models.ForeignKey(
        'clinics.ClinicPatientRecord',
        on_delete=models.CASCADE,
        related_name='chat_rooms',
        null=True,
        blank=True,
        help_text='مريض العيادة المرتبط بالمحادثة'
    )
    clinic_message = models.OneToOneField(
        'clinics.ClinicMessage',
        on_delete=models.SET_NULL,
        related_name='chat_room',
        null=True,
        blank=True,
        help_text='رسالة العيادة المرتبطة بالمحادثة'
    )
    clinic_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='clinic_chat_rooms',
        null=True,
        blank=True,
        help_text='عضو العيادة الذي أنشأ المحادثة'
    )
    
    # معرف Firebase للمحادثة
    firebase_chat_id = models.CharField(
        max_length=100,
        unique=True,
        help_text="معرف المحادثة في Firebase"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True, help_text="هل المحادثة نشطة")

    def __str__(self):
        return f"ChatRoom-{self.id}"

    def get_participants(self):
        """الحصول على المشاركين في المحادثة"""
        participants = []
        seen_ids = set()

        def add_participant(candidate):
            if candidate and getattr(candidate, 'id', None) and candidate.id not in seen_ids:
                participants.append(candidate)
                seen_ids.add(candidate.id)

        try:
            if self.breeding_request:
                # محادثة تزاوج
                add_participant(getattr(self.breeding_request, 'requester', None))
                target_owner = None
                if getattr(self.breeding_request, 'target_pet', None):
                    target_owner = getattr(self.breeding_request.target_pet, 'owner', None)
                add_participant(target_owner)
            elif self.adoption_request:
                # محادثة تبني
                add_participant(getattr(self.adoption_request, 'adopter', None))
                pet_owner = None
                if getattr(self.adoption_request, 'pet', None):
                    pet_owner = getattr(self.adoption_request.pet, 'owner', None)
                add_participant(pet_owner)
            elif self.clinic_patient:
                # محادثة عيادة
                add_participant(self.clinic_staff)
                add_participant(getattr(self.clinic_patient, 'linked_user', None))
        except Exception:
            pass

        return participants

    def get_other_participant(self, user):
        """الحصول على المشارك الآخر في المحادثة"""
        try:
            participants = self.get_participants()
            if len(participants) >= 2:
                if participants[0].id == user.id:
                    return participants[1]
                else:
                    return participants[0]
        except:
            pass
        return None

    def get_participants_data(self):
        """بيانات المشاركين للـ Firebase"""
        try:
            participants = self.get_participants()
            data = {}
            for participant in participants:
                if getattr(participant, 'id', None):
                    data[str(participant.id)] = {
                        'id': participant.id,
                        'name': f"{participant.first_name} {participant.last_name}".strip(),
                        'email': participant.email,
                        'phone': participant.phone,
                    }
            return data
        except Exception:
            return {}

    def clean(self):
        """التحقق من صحة البيانات"""
        from django.core.exceptions import ValidationError
        
        links = [
            bool(self.breeding_request),
            bool(self.adoption_request),
            bool(self.clinic_patient),
        ]

        if not any(links):
            raise ValidationError("يجب ربط غرفة المحادثة بطلب تزاوج أو تبني أو مريض عيادة")

        if sum(links) > 1:
            raise ValidationError("لا يمكن ربط غرفة المحادثة بأكثر من نوع واحد في آنٍ واحد")
    
    def save(self, *args, **kwargs):
        """إنشاء معرف Firebase تلقائياً"""
        if not self.firebase_chat_id:
            import uuid
            self.firebase_chat_id = f"chat_{uuid.uuid4().hex[:16]}"
        super().save(*args, **kwargs)

    def archive(self):
        """أرشفة المحادثة"""
        self.is_active = False
        self.save(update_fields=['is_active', 'updated_at'])

    def reactivate(self):
        """إعادة تفعيل المحادثة"""
        self.is_active = True
        self.save(update_fields=['is_active', 'updated_at'])

    def can_user_access(self, user):
        """التحقق من إمكانية وصول المستخدم للمحادثة"""
        try:
            participants = self.get_participants()
            return any(p.id == user.id for p in participants)
        except:
            return False

    def get_chat_context(self):
        """الحصول على السياق الكامل للمحادثة للـ Firebase"""
        try:
            if self.breeding_request:
                # محادثة تزاوج
                breeding_request = self.breeding_request
                pet = breeding_request.target_pet
                if not pet:
                    return {}
                
                return {
                    'chat_id': self.firebase_chat_id,
                    'type': 'breeding',
                    'breeding_request': {
                        'id': breeding_request.id,
                        'status': breeding_request.status,
                        'created_at': breeding_request.created_at.isoformat(),
                        'message': breeding_request.message,
                    },
                    'pet': {
                        'id': pet.id,
                        'name': pet.name,
                        'breed_name': pet.breed.name,
                        'pet_type_display': pet.pet_type_display,
                        'main_image': pet.main_image.url if pet.main_image else None,
                        'owner_name': f"{pet.owner.first_name} {pet.owner.last_name}",
                    },
                    'participants': self.get_participants_data(),
                    'metadata': {
                        'created_at': self.created_at.isoformat(),
                        'updated_at': self.updated_at.isoformat(),
                        'is_active': self.is_active,
                    }
                }
            elif self.adoption_request:
                # محادثة تبني
                adoption_request = self.adoption_request
                pet = adoption_request.pet
                if not pet:
                    return {}
                
                return {
                    'chat_id': self.firebase_chat_id,
                    'type': 'adoption',
                    'adoption_request': {
                        'id': adoption_request.id,
                        'status': adoption_request.status,
                        'created_at': adoption_request.created_at.isoformat(),
                        'adopter_name': adoption_request.adopter_name,
                    },
                    'pet': {
                        'id': pet.id,
                        'name': pet.name,
                        'breed_name': pet.breed.name,
                        'pet_type_display': pet.pet_type_display,
                        'main_image': pet.main_image.url if pet.main_image else None,
                        'owner_name': f"{pet.owner.first_name} {pet.owner.last_name}",
                    },
                    'participants': self.get_participants_data(),
                    'metadata': {
                        'created_at': self.created_at.isoformat(),
                        'updated_at': self.updated_at.isoformat(),
                        'is_active': self.is_active,
                    }
                }
            elif self.clinic_patient:
                # محادثة عيادة
                patient = self.clinic_patient
                clinic = getattr(patient, 'clinic', None)
                owner = getattr(patient, 'owner', None)
                linked_user = getattr(patient, 'linked_user', None)

                if not linked_user:
                    return {}

                owner_name = getattr(owner, 'full_name', None) if owner else None
                owner_email = getattr(owner, 'email', None) if owner else None
                owner_phone = getattr(owner, 'phone', None) if owner else None

                return {
                    'chat_id': self.firebase_chat_id,
                    'type': 'clinic',
                    'clinic': {
                        'id': clinic.id if clinic else None,
                        'name': clinic.name if clinic else None,
                    },
                    'pet': {
                        'id': patient.id,
                        'name': patient.name,
                        'breed_name': patient.breed,
                        'pet_type_display': patient.species,
                        'main_image': None,
                        'owner_name': owner_name,
                    },
                    'patient': {
                        'id': patient.id,
                        'name': patient.name,
                        'species': patient.species,
                        'breed': patient.breed,
                        'owner_name': owner_name,
                        'owner_email': owner_email,
                        'owner_phone': owner_phone,
                    },
                    'participants': self.get_participants_data(),
                    'metadata': {
                        'created_at': self.created_at.isoformat(),
                        'updated_at': self.updated_at.isoformat(),
                        'is_active': self.is_active,
                    }
                }
        except Exception:
            return {}
        return {}

    @classmethod
    def get_user_active_chats(cls, user):
        """الحصول على المحادثات النشطة للمستخدم"""
        return cls.objects.filter(
            models.Q(breeding_request__requester=user) |
            models.Q(breeding_request__target_pet__owner=user) |
            models.Q(adoption_request__adopter=user) |
            models.Q(adoption_request__pet__owner=user) |
            models.Q(clinic_patient__linked_user=user),
            is_active=True
        ).select_related(
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'adoption_request__pet',
            'clinic_patient__clinic',
            'clinic_patient__owner',
            'clinic_patient__linked_user'
        ).order_by('-updated_at')

    @classmethod
    def get_user_archived_chats(cls, user):
        """الحصول على المحادثات المؤرشفة للمستخدم"""
        return cls.objects.filter(
            models.Q(breeding_request__requester=user) |
            models.Q(breeding_request__target_pet__owner=user) |
            models.Q(adoption_request__adopter=user) |
            models.Q(adoption_request__pet__owner=user) |
            models.Q(clinic_patient__linked_user=user),
            is_active=False
        ).select_related(
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'breeding_request__target_pet',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'adoption_request__pet',
            'clinic_patient__clinic',
            'clinic_patient__owner',
            'clinic_patient__linked_user'
        ).order_by('-updated_at')

    class Meta:
        verbose_name = "غرفة محادثة"
        verbose_name_plural = "غرف المحادثة"
        ordering = ['-updated_at']


class AdoptionRequest(models.Model):
    """نموذج طلبات التبني"""
    
    STATUS_CHOICES = [
        ('pending', 'قيد المراجعة'),
        ('approved', 'مقبول'),
        ('rejected', 'مرفوض'),
        ('completed', 'مكتمل'),
    ]
    

    
    # المعلومات الأساسية
    adopter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='adoption_requests',
        verbose_name="طالب التبني"
    )
    pet = models.ForeignKey(
        Pet,
        on_delete=models.CASCADE,
        related_name='adoption_requests',
        verbose_name="الحيوان المطلوب تبنيه"
    )
    
    # معلومات طالب التبني
    adopter_name = models.CharField(max_length=100, verbose_name="الاسم الكامل")
    adopter_email = models.EmailField(verbose_name="البريد الإلكتروني")
    adopter_phone = models.CharField(max_length=20, verbose_name="رقم الهاتف")
    adopter_age = models.PositiveIntegerField(verbose_name="العمر")
    adopter_occupation = models.CharField(max_length=100, verbose_name="المهنة")
    adopter_address = models.TextField(verbose_name="العنوان التفصيلي")
    # تم إزالة حقل رقم الهوية
    
    # إحداثيات الموقع
    adopter_latitude = models.DecimalField(
        max_digits=10, 
        decimal_places=8, 
        blank=True, 
        null=True, 
        verbose_name="خط العرض"
    )
    adopter_longitude = models.DecimalField(
        max_digits=11, 
        decimal_places=8, 
        blank=True, 
        null=True, 
        verbose_name="خط الطول"
    )
    
    # معلومات السكن المبسطة
    housing_type = models.CharField(max_length=50, default='apartment', verbose_name="نوع السكن")
    family_members = models.PositiveIntegerField(default=1, verbose_name="عدد أفراد العائلة")
    
    # الخبرة والوقت المبسطة
    experience_level = models.CharField(max_length=50, default='basic', verbose_name="مستوى الخبرة")
    time_availability = models.CharField(max_length=50, default='high', verbose_name="الوقت المتاح")
    reason_for_adoption = models.TextField(default="الرغبة في تربية حيوان أليف", verbose_name="سبب التبني")
    
    # الموافقات الأساسية
    family_agreement = models.BooleanField(default=True, verbose_name="موافقة العائلة")
    agrees_to_follow_up = models.BooleanField(default=True, verbose_name="موافقة على المتابعة")
    agrees_to_vet_care = models.BooleanField(default=True, verbose_name="موافقة على الرعاية البيطرية")
    agrees_to_training = models.BooleanField(default=True, verbose_name="موافقة على التدريب")
    
    # خطط الرعاية
    feeding_plan = models.TextField(default="ستتم العناية بالتغذية بانتظام", verbose_name="خطة التغذية")
    exercise_plan = models.TextField(default="ستتم ممارسة التمارين يومياً", verbose_name="خطة التمارين")
    vet_care_plan = models.TextField(default="ستتم المتابعة البيطرية المنتظمة", verbose_name="خطة الرعاية البيطرية")
    emergency_plan = models.TextField(default="سيتم التعامل مع الطوارئ فوراً", verbose_name="خطة الطوارئ")
    

    
    # حالة الطلب
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True, null=True, verbose_name="ملاحظات المالك")
    admin_notes = models.TextField(blank=True, null=True, verbose_name="ملاحظات الإدارة")
    
    # التواريخ
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    
    def __str__(self):
        return f"طلب تبني {self.pet.name} - {self.adopter_name}"
    
    def approve(self):
        """قبول طلب التبني"""
        self.status = 'approved'
        self.approved_at = timezone.now()
        self.pet.status = 'adoption_pending'
        self.pet.save()
        self.save()
    
    def reject(self):
        """رفض طلب التبني"""
        self.status = 'rejected'
        self.save()
    
    def complete(self):
        """إكمال عملية التبني"""
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.pet.status = 'adopted'
        self.pet.save()
        self.save()
        
        # رفض جميع الطلبات الأخرى للحيوان نفسه
        AdoptionRequest.objects.filter(
            pet=self.pet,
            status='pending'
        ).exclude(id=self.id).update(status='rejected')
    
    @property
    def can_be_approved(self):
        """هل يمكن قبول الطلب"""
        return (
            self.status == 'pending' and 
            self.pet.status in ['available_for_adoption', 'adoption_pending']
        )
    
    @property
    def can_be_completed(self):
        """هل يمكن إكمال التبني"""
        return self.status == 'approved'
    
    class Meta:
        verbose_name = "طلب تبني"
        verbose_name_plural = "طلبات التبني"
        ordering = ['-created_at']
        unique_together = ['adopter', 'pet', 'status']  # منع الطلبات المكررة
