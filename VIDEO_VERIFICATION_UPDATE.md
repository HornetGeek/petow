# تحديث نظام التحقق: من صورة إلى فيديو سيلفي 🎥

## نظرة عامة
تم تحديث نظام التحقق من الحساب ليستخدم **فيديو سيلفي** بدلاً من صورة سيلفي لتوفير مستوى أمان أعلى ومنع التزوير.

## التغييرات

### 1. Backend (Django) ✅

#### Model Changes
**File**: `patmatch/accounts/models.py`
- تم تغيير `selfie_photo` (ImageField) إلى `selfie_video` (FileField)
- الفيديو يتم حفظه في: `verification_documents/selfie_videos/`
- الحقل nullable لدعم البيانات الموجودة

#### Serializer Updates
**File**: `patmatch/accounts/serializers.py`
- تم تحديث `AccountVerificationSerializer` لدعم `selfie_video`
- إضافة validation للفيديو:
  - أنواع مدعومة: MP4, MOV, AVI, WEBM
  - الحد الأقصى للحجم: 20 ميجابايت
  - رسائل خطأ واضحة بالعربية

#### API Endpoints
**File**: `patmatch/accounts/views.py`
- تحديث endpoint `/api/accounts/verification/request/`
- يقبل `selfie_video` بدلاً من `selfie_photo`
- التحقق من وجود الفيديو قبل الحفظ

#### Django Admin
**File**: `patmatch/accounts/admin.py`
- تحديث واجهة الإدارة لعرض الفيديو
- معاينة الفيديو مباشرة في المتصفح
- زر تحميل الفيديو
- عرض "✅ يوجد فيديو" في قائمة الطلبات

#### Migration
**File**: `accounts/migrations/0009_change_selfie_to_video.py`
- إزالة `selfie_photo`
- إضافة `selfie_video`
- تم تطبيق الـ migration بنجاح

### 2. Mobile App (React Native) ✅

#### API Service
**File**: `PetMatchMobile/src/services/api.ts`
- تحديث `submitVerification()` لإرسال فيديو
- تغيير parameter من `selfiePhoto` إلى `selfieVideo`
- تحديث FormData لدعم رفع الفيديو

#### New Component: VideoPicker
**File**: `PetMatchMobile/src/components/VideoPicker.tsx`
- مكون جديد لتصوير/اختيار فيديو
- خيارات:
  - 📹 تصوير فيديو مباشر
  - 📁 اختيار من المعرض
- تحديد المدة القصوى (15 ثانية)
- فحص حجم الملف (20 MB)
- استخدام `react-native-image-picker` الموجود مسبقاً

#### Updated: VerificationScreen
**File**: `PetMatchMobile/src/screens/profile/VerificationScreen.tsx`
- استبدال ImagePicker بـ VideoPicker للسيلفي
- إضافة معاينة الفيديو باستخدام `react-native-video`
- تحديث التعليمات:
  ```
  • صور فيديو قصير (10-15 ثانية)
  • احمل الهوية بجانب وجهك
  • قل اسمك
  • حرك رأسك قليلاً لليمين واليسار
  ```
- عرض حجم الفيديو بعد الاختيار

#### Dependencies
**File**: `PetMatchMobile/package.json`
- إضافة `react-native-video: ^6.0.0`
- `react-native-image-picker` موجود مسبقاً ويدعم الفيديو

## المميزات الجديدة 🌟

### 1. أمان أعلى 🔒
- **Liveness Detection**: الفيديو يثبت أن الشخص حقيقي وليس صورة
- **صعوبة التزوير**: تزوير فيديو أصعب بكثير من تزوير صورة
- **تفاصيل أكثر**: المشرف يرى الشخص يتحرك ويتكلم

### 2. توثيق أقوى 📹
- سجل فيديو كامل للتحقق
- يمكن الرجوع إليه في حالة النزاع
- مصداقية قانونية أعلى

### 3. تجربة مستخدم محسّنة 💫
- تعليمات واضحة خطوة بخطوة
- معاينة الفيديو قبل الإرسال
- عرض حجم الفيديو
- رسائل خطأ واضحة

### 4. واجهة إدارة احترافية 💼
- معاينة الفيديو مباشرة في Django Admin
- controls للتحكم في التشغيل
- زر تحميل للمراجعة التفصيلية

## المواصفات التقنية 📋

### متطلبات الفيديو
- **المدة**: 10-15 ثانية (قابلة للتعديل)
- **الحجم الأقصى**: 20 ميجابايت
- **الأنواع المدعومة**: 
  - MP4 (video/mp4)
  - MOV (video/quicktime)
  - AVI (video/x-msvideo)
  - WEBM (video/webm)
- **الجودة**: متوسطة (medium) لتقليل الحجم

### API Endpoint
```http
POST /api/accounts/verification/request/
Content-Type: multipart/form-data

Parameters:
- id_photo: Image file (required)
- selfie_video: Video file (required)

Response:
{
  "success": true,
  "message": "تم إرسال طلب التحقق بنجاح",
  "verification": {
    "id": 1,
    "status": "pending",
    ...
  }
}

Error Responses:
- 400: حجم الفيديو كبير جداً
- 400: نوع الفيديو غير مدعوم
- 400: لديك طلب قيد المراجعة
```

### Django Admin Interface
```
القائمة:
┌─────────────────────────────────────────┐
│ User | Email | Status | Video          │
├─────────────────────────────────────────┤
│ أحمد  | a@... | pending | ✅ يوجد فيديو │
└─────────────────────────────────────────┘

التفاصيل:
- صورة الهوية (معاينة كاملة)
- فيديو السيلفي (مشغل فيديو + زر تحميل)
- الحالة وملاحظات المشرف
```

## تعليمات التثبيت 🚀

### Backend
```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite/patmatch
python3 manage.py makemigrations accounts
python3 manage.py migrate accounts
```

### Mobile App
```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite/PetMatchMobile
npm install react-native-video
# or
yarn add react-native-video

# iOS only:
cd ios && pod install && cd ..

# Rebuild the app
npm run android
# or
npm run ios
```

## تعليمات الاستخدام 📱

### للمستخدمين
1. افتح الملف الشخصي → اضغط "التحقق من الحساب"
2. ارفع صورة واضحة لبطاقة الهوية
3. صور فيديو قصير (10-15 ثانية):
   - امسك الهوية بجانب وجهك
   - قل: "أنا [اسمك] أريد التحقق من حسابي"
   - حرك رأسك قليلاً لليمين واليسار
4. تأكد من الفيديو بالمعاينة
5. اضغط "إرسال طلب التحقق"
6. انتظر المراجعة (24-48 ساعة)

### للمشرفين
1. افتح Django Admin: `/admin/accounts/accountverification/`
2. اختر الطلبات الـ "pending"
3. شاهد فيديو السيلفي
4. تأكد من:
   - الوجه يطابق الهوية
   - الشخص حقيقي (يتحرك ويتكلم)
   - الهوية واضحة وصالحة
5. اختر إجراء:
   - ✅ قبول الطلبات المحددة
   - ❌ رفض الطلبات المحددة
6. أضف ملاحظات إذا لزم الأمر

## الفوائد الأمنية 🛡️

### 1. منع الاحتيال
- ❌ لا يمكن استخدام صورة شخص آخر
- ❌ لا يمكن استخدام صور من الإنترنت
- ❌ صعوبة التزوير بالـ Deepfake (للفيديوهات القصيرة)

### 2. التحقق من الحياة (Liveness)
- ✅ الشخص يتحرك
- ✅ الشخص يتكلم
- ✅ التفاعل في الوقت الحقيقي

### 3. أدلة قانونية
- 📹 سجل فيديو كامل
- 📅 timestamp للتحقق
- 🔐 مخزن بشكل آمن ودائم

## الملفات المعدلة 📁

### Backend
```
patmatch/accounts/
├── models.py                           # ✅ Updated
├── serializers.py                      # ✅ Updated
├── views.py                            # ✅ Updated
├── admin.py                            # ✅ Updated
└── migrations/
    └── 0009_change_selfie_to_video.py  # ✅ New
```

### Mobile App
```
PetMatchMobile/
├── package.json                              # ✅ Updated
└── src/
    ├── components/
    │   └── VideoPicker.tsx                   # ✅ New
    ├── screens/
    │   └── profile/
    │       └── VerificationScreen.tsx        # ✅ Updated
    └── services/
        └── api.ts                            # ✅ Updated
```

## الخطوات التالية (اختياري) 🚧

### تحسينات مستقبلية
1. **ضغط الفيديو التلقائي**:
   - استخدام `react-native-video-processing`
   - تقليل الحجم تلقائياً قبل الرفع

2. **AI Verification**:
   - Face recognition لمقارنة الوجه بالهوية
   - Liveness detection تلقائي
   - OCR لقراءة بيانات الهوية

3. **إشعارات Push**:
   - إشعار عند قبول/رفض التحقق
   - إشعار عند استلام طلب جديد (للمشرفين)

4. **تحليلات**:
   - معدل القبول/الرفض
   - متوسط وقت المراجعة
   - إحصائيات حجم الفيديوهات

## الخلاصة ✨

التحديث من صورة إلى فيديو سيلفي يوفر:
- 🔒 أمان أعلى بكثير
- 📹 توثيق أقوى
- 🛡️ حماية من الاحتيال
- 💼 مصداقية قانونية

النظام جاهز للاستخدام الآن! ✅


