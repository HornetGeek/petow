from django.db import models
from django.conf import settings

class Clinic(models.Model):
    """نموذج العيادات البيطرية"""
    
    name = models.CharField(max_length=200)
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    
    # ساعات العمل
    opening_hours = models.TextField(help_text="ساعات العمل")
    
    # الخدمات المتاحة
    services = models.TextField(help_text="الخدمات المتاحة")
    
    # معلومات إضافية
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "عيادة بيطرية"
        verbose_name_plural = "العيادات البيطرية"

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
        ('other', 'أخرى'),
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
