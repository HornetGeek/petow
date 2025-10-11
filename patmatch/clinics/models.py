import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Clinic(models.Model):
    """نموذج العيادات البيطرية"""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='owned_clinics',
        blank=True,
        null=True,
        help_text="صاحب الحساب الرئيسي للعيادة"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True, help_text="نبذة عن العيادة")
    address = models.TextField()
    phone = models.CharField(max_length=20)
    emergency_phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    logo = models.ImageField(upload_to='clinics/logos/', blank=True, null=True)

    # ساعات العمل
    opening_hours = models.TextField(help_text="ساعات العمل")

    # الخدمات المتاحة (وصف عام)
    services = models.TextField(help_text="الخدمات المتاحة")

    # معلومات إضافية
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "عيادة بيطرية"
        verbose_name_plural = "العيادات البيطرية"
        ordering = ['name']


class ClinicStaff(models.Model):
    """فريق عمل العيادة"""

    ROLE_CHOICES = [
        ('owner', 'مالك العيادة'),
        ('veterinarian', 'طبيب بيطري'),
        ('assistant', 'مساعد طبي'),
        ('reception', 'استقبال'),
        ('admin', 'إداري'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='clinic_memberships'
    )
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name='staff_members'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='owner')
    is_primary = models.BooleanField(default=False, help_text="هل هو صاحب الحساب الرئيسي؟")
    invitation_email = models.EmailField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "عضو فريق العيادة"
        verbose_name_plural = "أعضاء فريق العيادة"
        unique_together = [['user', 'clinic', 'role']]

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.email} - {self.clinic.name}"


class ClinicService(models.Model):
    """الخدمات الطبية للعيادة"""

    CATEGORY_CHOICES = [
        ('general', 'فحص عام'),
        ('vaccination', 'تطعيم'),
        ('surgery', 'جراحة'),
        ('grooming', 'تنظيف وتجميل'),
        ('breeding', 'استشارات تزاوج'),
        ('boarding', 'إقامة ورعاية'),
        ('emergency', 'طوارئ'),
        ('other', 'خدمات أخرى'),
    ]

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='services_list')
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='general')
    price = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    duration_minutes = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    highlight = models.BooleanField(default=False, help_text="إبراز الخدمة في الواجهة")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "خدمة طبية"
        verbose_name_plural = "الخدمات الطبية"
        ordering = ['clinic', 'name']

    def __str__(self):
        return f"{self.name} - {self.clinic.name}"


class ClinicPromotion(models.Model):
    """العروض الموسمية وباقات الخدمات"""

    PROMOTION_TYPE_CHOICES = [
        ('discount', 'خصم مباشر'),
        ('bundle', 'باقة مركبة'),
        ('event', 'فعالية خاصة'),
        ('other', 'عروض أخرى'),
    ]

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='promotions')
    title = models.CharField(max_length=150)
    description = models.TextField()
    promotion_type = models.CharField(max_length=20, choices=PROMOTION_TYPE_CHOICES, default='discount')
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    price_after_discount = models.DecimalField(max_digits=9, decimal_places=2, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "عرض عيادة"
        verbose_name_plural = "عروض العيادات"
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.title} - {self.clinic.name}"




class ClinicClientRecord(models.Model):
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='client_records')
    full_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "عميل عيادة"
        verbose_name_plural = "عملاء العيادة"
        ordering = ['full_name']

    def __str__(self):
        return f"{self.full_name} ({self.clinic.name})"


class ClinicPatientRecord(models.Model):
    STATUS_CHOICES = [
        ('active', 'نشط'),
        ('inactive', 'غير نشط'),
        ('boarding', 'إقامة/ملاحظة'),
    ]

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='patient_records')
    owner = models.ForeignKey(ClinicClientRecord, on_delete=models.CASCADE, related_name='pets')
    name = models.CharField(max_length=150)
    species = models.CharField(max_length=60)
    breed = models.CharField(max_length=120, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    age_text = models.CharField(max_length=80, blank=True, null=True)
    gender = models.CharField(max_length=10, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    notes = models.TextField(blank=True, null=True)
    last_visit = models.DateField(blank=True, null=True)
    next_appointment = models.DateField(blank=True, null=True)
    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='clinic_patient_records',
        blank=True,
        null=True,
        help_text='المستخدم المرتبط بالحيوان في التطبيق'
    )
    linked_pet = models.ForeignKey(
        'pets.Pet',
        on_delete=models.SET_NULL,
        related_name='clinic_patient_records',
        blank=True,
        null=True,
        help_text='الحيوان المرتبط في التطبيق الرئيسي'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "مريض عيادة"
        verbose_name_plural = "مرضى العيادة"
        ordering = ['name']
        constraints = [
            # Prevent multiple records in the same clinic linking to the same app pet
            models.UniqueConstraint(
                fields=['clinic', 'linked_pet'],
                condition=models.Q(linked_pet__isnull=False),
                name='uniq_clinic_linked_pet'
            )
        ]

    def __str__(self):
        return f"{self.name} - {self.owner.full_name}"


class ClinicMessage(models.Model):
    """رسائل واستفسارات العملاء"""

    STATUS_CHOICES = [
        ('new', 'جديدة'),
        ('in_progress', 'قيد المتابعة'),
        ('resolved', 'تم الحل'),
        ('archived', 'مؤرشف'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'منخفض'),
        ('normal', 'عادي'),
        ('high', 'عالي'),
        ('urgent', 'طارئ'),
    ]

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='messages')
    clinic_patient = models.ForeignKey(
        ClinicPatientRecord,
        on_delete=models.SET_NULL,
        related_name='messages',
        null=True,
        blank=True,
        help_text='المريض المرتبط بالمحادثة (إن وُجد)'
    )
    sender_name = models.CharField(max_length=150)
    sender_email = models.EmailField(blank=True, null=True)
    sender_phone = models.CharField(max_length=30, blank=True, null=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    is_internal = models.BooleanField(default=False, help_text="رسالة داخلية لفريق العيادة")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "رسالة عيادة"
        verbose_name_plural = "رسائل العيادات"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.subject} - {self.clinic.name}"


class ClinicInvite(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_ACCEPTED = 'accepted'
    STATUS_DECLINED = 'declined'
    STATUS_EXPIRED = 'expired'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'قيد الانتظار'),
        (STATUS_ACCEPTED, 'تم القبول'),
        (STATUS_DECLINED, 'تم الرفض'),
        (STATUS_EXPIRED, 'منتهي الصلاحية'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='invites')
    patient = models.ForeignKey(ClinicPatientRecord, on_delete=models.CASCADE, related_name='invites')
    owner_record = models.ForeignKey(ClinicClientRecord, on_delete=models.CASCADE, related_name='invites')
    token = models.CharField(max_length=32, unique=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='clinic_invites',
        blank=True,
        null=True,
        help_text='المستخدم الذي استلم الدعوة بعد التسجيل'
    )
    intended_pet = models.ForeignKey(
        'pets.Pet',
        on_delete=models.SET_NULL,
        related_name='intended_clinic_invites',
        blank=True,
        null=True,
        help_text='الحيوان المقصود ربطه عند قبول الدعوة (اختياري)'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    sms_send_count = models.PositiveIntegerField(default=0)
    last_sms_sent_at = models.DateTimeField(blank=True, null=True)
    claimed_at = models.DateTimeField(blank=True, null=True)
    accepted_at = models.DateTimeField(blank=True, null=True)
    declined_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'دعوة عيادة'
        verbose_name_plural = 'دعوات العيادات'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['status', 'phone']),
            models.Index(fields=['status', 'email']),
        ]

    def __str__(self):
        return f"دعوة {self.clinic.name} لـ {self.patient.name}"

    def mark_accepted(self, user=None):
        self.status = self.STATUS_ACCEPTED
        self.accepted_at = timezone.now()
        if user:
            self.recipient = user
            fields_to_update = []
            
            # Link user if not already linked
            if self.patient.linked_user != user:
                self.patient.linked_user = user
                fields_to_update.append('linked_user')
            
            # Create or link pet when invitation is accepted
            if not self.patient.linked_pet:
                from pets.models import Pet, Breed
                
                # 1) If invite carries an intended pet, and it belongs to this user, use it
                matching_pet = None
                if getattr(self, 'intended_pet_id', None):
                    try:
                        intended = self.intended_pet
                        if intended and intended.owner_id == user.id:
                            matching_pet = intended
                    except Exception:
                        matching_pet = None
                
                # 2) Otherwise, try exact match by name AND species
                if not matching_pet:
                    matching_pet = Pet.objects.filter(
                        owner=user,
                        name__iexact=self.patient.name,
                        pet_type=self.patient.species
                    ).first()
                
                # If no matching pet found, CREATE a new one
                if not matching_pet:
                    # Map species to pet_type
                    species_map = {
                        'dog': 'dogs',
                        'dogs': 'dogs',
                        'cat': 'cats',
                        'cats': 'cats',
                        'bird': 'birds',
                        'birds': 'birds',
                    }
                    pet_type = species_map.get(self.patient.species.lower(), 'dogs')
                    
                    # Get or create breed
                    breed = Breed.objects.filter(pet_type=pet_type).first()
                    if not breed:
                        breed = Breed.objects.create(
                            name=f"{pet_type.title()} - Generic",
                            pet_type=pet_type,
                            description="Generic breed"
                        )
                    
                    # Calculate age
                    age_months = 12
                    if self.patient.date_of_birth:
                        from datetime import date
                        today = date.today()
                        dob = self.patient.date_of_birth
                        age_months = max(1, (today.year - dob.year) * 12 + (today.month - dob.month))
                    
                    # Parse gender
                    gender = 'M'
                    if self.patient.gender:
                        if str(self.patient.gender).upper() in ['F', 'FEMALE', 'أنثى']:
                            gender = 'F'
                    
                    # Create the pet
                    matching_pet = Pet.objects.create(
                        owner=user,
                        name=self.patient.name,
                        pet_type=pet_type,
                        breed=breed,
                        age_months=age_months,
                        gender=gender,
                        description=f"Added by {self.clinic.name} clinic",
                        status='unavailable',  # Not available for breeding by default
                        location=self.clinic.address or 'غير محدد',
                        latitude=self.clinic.latitude,
                        longitude=self.clinic.longitude,
                        is_free=True,
                    )
                
                # Link the pet
                self.patient.linked_pet = matching_pet
                fields_to_update.append('linked_pet')
            
            if fields_to_update:
                fields_to_update.append('updated_at')
                self.patient.save(update_fields=fields_to_update)
                
        self.save(update_fields=['status', 'accepted_at', 'recipient', 'updated_at'])

    def mark_declined(self, user=None):
        self.status = self.STATUS_DECLINED
        self.declined_at = timezone.now()
        if user and not self.recipient:
            self.recipient = user
        self.save(update_fields=['status', 'declined_at', 'recipient', 'updated_at'])


class VeterinaryAppointment(models.Model):
    """نموذج مواعيد بيطرية"""

    STATUS_CHOICES = [
        ('scheduled', 'مجدول'),
        ('completed', 'تم'),
        ('cancelled', 'ملغي'),
        ('rescheduled', 'تم إعادة الجدولة'),
    ]

    APPOINTMENT_TYPE_CHOICES = [
        ('checkup', 'فحص دوري'),
        ('vaccination', 'تطعيم'),
        ('breeding_consultation', 'استشارة تزاوج'),
        ('pregnancy_check', 'فحص حمل'),
        ('emergency', 'طوارئ'),
        ('grooming', 'تنظيف وتجميل'),
        ('surgery', 'جراحة'),
        ('other', 'أخرى'),
    ]

    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'غير مدفوع'),
        ('pending', 'قيد المعالجة'),
        ('paid', 'مدفوع'),
        ('refunded', 'مسترد'),
    ]

    pet = models.ForeignKey('pets.Pet', on_delete=models.CASCADE, related_name='vet_appointments')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vet_appointments')
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='appointments')

    appointment_type = models.CharField(max_length=30, choices=APPOINTMENT_TYPE_CHOICES, default='checkup')
    scheduled_date = models.DateField()
    scheduled_time = models.TimeField()
    duration_minutes = models.PositiveIntegerField(default=30)

    # تفاصيل الموعد
    reason = models.TextField(help_text="سبب الزيارة")
    notes = models.TextField(blank=True, null=True, help_text="ملاحظات إضافية")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='unpaid')
    service_fee = models.DecimalField(max_digits=9, decimal_places=2, default=0)

    # نتائج الفحص
    diagnosis = models.TextField(blank=True, null=True, help_text="التشخيص")
    treatment = models.TextField(blank=True, null=True, help_text="العلاج الموصى به")
    next_appointment = models.DateField(blank=True, null=True, help_text="الموعد القادم")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"موعد {self.pet.name} - {self.scheduled_date}"

    class Meta:
        verbose_name = "موعد بيطري"
        verbose_name_plural = "المواعيد البيطرية"
        ordering = ['scheduled_date', 'scheduled_time']


class VeterinaryCertificate(models.Model):
    """شهادات بيطرية"""

    CERTIFICATE_TYPE_CHOICES = [
        ('health', 'شهادة صحية'),
        ('vaccination', 'شهادة تطعيم'),
        ('breeding', 'شهادة صالح للتزاوج'),
        ('sterilization', 'شهادة تعقيم'),
    ]

    pet = models.ForeignKey('pets.Pet', on_delete=models.CASCADE, related_name='certificates')
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='issued_certificates')

    certificate_type = models.CharField(max_length=20, choices=CERTIFICATE_TYPE_CHOICES)
    certificate_number = models.CharField(max_length=100, unique=True)
    issued_date = models.DateField()
    expiry_date = models.DateField(blank=True, null=True)

    details = models.TextField(help_text="تفاصيل الشهادة")
    veterinarian_name = models.CharField(max_length=200, help_text="اسم الطبيب البيطري")

    # ملف الشهادة
    certificate_file = models.FileField(upload_to='certificates/', blank=True, null=True)

    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_certificate_type_display()} - {self.pet.name}"

    class Meta:
        verbose_name = "شهادة بيطرية"
        verbose_name_plural = "الشهادات البيطرية"
        ordering = ['-issued_date']
