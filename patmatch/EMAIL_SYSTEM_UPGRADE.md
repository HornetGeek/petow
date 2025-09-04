# نظام الإشعارات عبر الإيميل المحسن

## التحديثات الجديدة

### 1. إيميلات الشات (تم التحسين)

**قبل التحديث:**
- كان يتم إرسال إيميل فوري مع كل رسالة في الشات

**بعد التحديث:**
- تم إزالة الإيميل الفوري
- يتم إرسال تذكرة يومية واحدة فقط للمستخدمين الذين لديهم رسائل غير مقروءة

### 2. إيميلات طلبات التزاوج (جديد)

**عند إرسال طلب تزاوج:**
- يتم إرسال إيميل لصاحب الحيوان المطلوب للتزاوج
- يحتوي على تفاصيل الطلب ومعلومات المرسل

**عند قبول طلب التزاوج:**
- يتم إرسال إيميل لمرسل الطلب
- يحتوي على تفاصيل الموافقة ومعلومات التواصل

### 3. إيميلات طلبات التبني (جديد)

**عند إرسال طلب تبني:**
- يتم إرسال إيميل لصاحب الحيوان المطلوب تبنيه
- يحتوي على تفاصيل طالب التبني ومعلوماته

**عند قبول طلب التبني:**
- يتم إرسال إيميل لطالب التبني
- يحتوي على تفاصيل الموافقة ومعلومات التواصل

## الملفات الجديدة

### 1. `pets/email_notifications.py`
يحتوي على جميع دوال إرسال الإيميلات:
- `send_breeding_request_email()`
- `send_breeding_request_approved_email()`
- `send_adoption_request_email()`
- `send_adoption_request_approved_email()`
- `send_daily_unread_messages_reminder()`

### 2. `pets/management/commands/send_daily_reminders.py`
Django management command لإرسال التذكرة اليومية:
```bash
python manage.py send_daily_reminders
python manage.py send_daily_reminders --dry-run  # تشغيل تجريبي
```

### 3. `daily_email_reminder.py`
Script مستقل يمكن تشغيله من cron job:
```bash
python daily_email_reminder.py
```

## إعداد Cron Job

لإرسال التذكرة اليومية في نهاية كل يوم (11:30 مساءً):

```bash
# تحرير crontab
crontab -e

# إضافة السطر التالي
30 23 * * * cd /media/hornet/84ACF2FAACF2E5981/petWebsite/patmatch && /usr/bin/python3 daily_email_reminder.py
```

أو باستخدام Django management command:
```bash
30 23 * * * cd /media/hornet/84ACF2FAACF2E5981/petWebsite/patmatch && /usr/bin/python3 manage.py send_daily_reminders
```

## التحديثات على الملفات الموجودة

### 1. `pets/models.py`
- تم إزالة الإيميل الفوري من `create_chat_message_notification()`

### 2. `pets/notifications.py`
- تم إضافة استيراد دوال الإيميل الجديدة
- تم تحديث `notify_breeding_request_received()` و `notify_breeding_request_approved()`
- تم إضافة `notify_adoption_request_received()` و `notify_adoption_request_approved()`

### 3. `pets/views.py`
- تم إضافة استيراد الدوال الجديدة
- تم تحديث `AdoptionRequestListCreateView` لإرسال إشعار عند الإنشاء
- تم تحديث `respond_to_adoption_request()` لإرسال إشعار عند القبول

## إعدادات الإيميل المطلوبة

تأكد من أن إعدادات الإيميل في `settings.py` مضبوطة بشكل صحيح:

```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.your-email-provider.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your-email@example.com'
EMAIL_HOST_PASSWORD = 'your-password'
DEFAULT_FROM_EMAIL = 'Peto <noreply@petow.app>'
```

## اختبار النظام

### اختبار التذكرة اليومية:
```bash
python manage.py send_daily_reminders --dry-run
```

### اختبار إيميلات طلبات التزاوج:
1. إنشاء طلب تزاوج جديد من التطبيق
2. التحقق من وصول الإيميل لصاحب الحيوان
3. قبول الطلب والتحقق من وصول إيميل القبول

### اختبار إيميلات طلبات التبني:
1. إنشاء طلب تبني جديد من التطبيق
2. التحقق من وصول الإيميل لصاحب الحيوان
3. قبول الطلب والتحقق من وصول إيميل القبول

## المميزات الجديدة

1. **تقليل spam الإيميلات**: لا مزيد من الإيميلات الفورية مع كل رسالة شات
2. **إشعارات هامة**: إيميلات فورية للأحداث المهمة (طلبات التزاوج والتبني)
3. **تذكرة يومية**: إيميل واحد فقط يومياً للرسائل غير المقروءة
4. **تحسين تجربة المستخدم**: إيميلات منظمة ومفيدة
5. **سهولة الصيانة**: كود منظم ومنفصل لإدارة الإيميلات

## Log Files

سيتم تسجيل جميع عمليات إرسال الإيميلات في:
- `logs/daily_reminder.log` للتذكرة اليومية
- Django logs للإيميلات الأخرى

## الدعم والصيانة

- تحقق من log files بانتظام للتأكد من عمل النظام
- راقب معدلات فتح الإيميلات وتفاعل المستخدمين
- اضبط توقيت التذكرة اليومية حسب الحاجة 