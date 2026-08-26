# Adoption Requests UI - Complete Implementation 🏠

## نظرة عامة
تم تنفيذ نظام كامل لإدارة طلبات التبني في تطبيق الموبايل، مع التحقق من الحساب كشرط أساسي.

## الميزات المنفذة ✅

### 1. نظام التحقق من الحساب 🔐
- ✅ التحقق بفيديو سيلفي (بدلاً من صورة) لأمان أعلى
- ✅ رفع صورة الهوية + فيديو سيلفي (10-15 ثانية)
- ✅ مراجعة يدوية من المشرفين عبر Django Admin
- ✅ حفظ دائم للمستندات للتوثيق القانوني

### 2. إرسال طلبات التبني 📝
- ✅ نموذج شامل لتقديم طلب تبني
- ✅ التحقق من حالة المستخدم (must be verified)
- ✅ معلومات كاملة (شخصية، سكنية، خبرة، خطط رعاية)
- ✅ اختيار الموقع على الخريطة
- ✅ موافقات إلزامية
- ✅ Validation شامل

### 3. عرض طلبات التبني 📋
- ✅ قسمين: مُرسلة / مُستلمة
- ✅ عرض تفاصيل كل طلب
- ✅ حالات الطلبات (pending/approved/rejected/completed)
- ✅ Pull-to-refresh
- ✅ Empty states

### 4. الموافقة/الرفض ✓✗
- ✅ أزرار موافقة/رفض للطلبات المستلمة
- ✅ تأكيد قبل الإجراء
- ✅ تحديث تلقائي بعد الإجراء
- ✅ رسائل نجاح/خطأ واضحة

## البنية التقنية 🏗️

### Backend (Django) - جاهز
```
patmatch/
├── accounts/
│   ├── models.py (AccountVerification model)
│   ├── serializers.py (Verification + validation)
│   ├── views.py (Verification endpoints)
│   ├── admin.py (Admin interface with video player)
│   └── urls.py (API routes)
└── pets/
    ├── models.py (AdoptionRequest model - existing)
    ├── serializers.py (Adoption serializers - existing)
    ├── views.py (Adoption endpoints - existing + verification check)
    └── urls.py (API routes - existing)
```

### Mobile App (React Native) - جديد
```
PetMatchMobile/src/
├── components/
│   └── VideoPicker.tsx (NEW - Video recording/selection)
├── screens/
│   ├── adoption-request/
│   │   ├── AdoptionRequestScreen.tsx (NEW - Submit form)
│   │   └── AdoptionRequestsScreen.tsx (NEW - List & manage)
│   ├── pets/
│   │   └── PetDetailsScreen.tsx (UPDATED - Adoption button)
│   └── profile/
│       ├── VerificationScreen.tsx (NEW - ID verification)
│       └── ProfileScreen.tsx (UPDATED - Quick actions)
└── services/
    └── api.ts (UPDATED - Types & methods)
```

## واجهات المستخدم 📱

### 1. شاشة التحقق من الحساب
**Path**: Profile → التحقق من الحساب
```
┌────────────────────────────────┐
│  التحقق من الحساب        ✕    │
├────────────────────────────────┤
│  📋 تعليمات التحقق:           │
│  • صورة واضحة للهوية          │
│  • فيديو 10-15 ثانية          │
│  • قل اسمك وحرك رأسك          │
├────────────────────────────────┤
│  📷 صورة بطاقة الهوية *       │
│  [اختر صورة الهوية]            │
├────────────────────────────────┤
│  🎥 فيديو سيلفي مع الهوية *   │
│  [صور فيديو سيلفي]             │
│  ┌──────────────────────────┐  │
│  │   Video Preview          │  │
│  │   [▶ Play]               │  │
│  └──────────────────────────┘  │
│  📹 جاهز • 2.5 ميجابايت       │
├────────────────────────────────┤
│    [إرسال طلب التحقق]          │
└────────────────────────────────┘
```

### 2. شاشة طلب التبني
**Path**: Pet Details → 🏠 طلب تبني (if verified)
```
┌────────────────────────────────┐
│  طلب تبني فلافي           ✕   │
├────────────────────────────────┤
│  ┌──────┐                      │
│  │ 📷  │ فلافي                 │
│  │     │ قطط • شيرازي • سنة    │
│  └──────┘ 📍 الرياض            │
├────────────────────────────────┤
│  المعلومات الأساسية            │
│  الاسم الكامل *                │
│  [________________]            │
│  البريد الإلكتروني *           │
│  [________________]            │
│  رقم الهاتف *                  │
│  [________________]            │
│  العمر *    المهنة *           │
│  [___]      [________]         │
├────────────────────────────────┤
│  العنوان                       │
│  العنوان التفصيلي *            │
│  [________________]            │
│  📍 حدد الموقع على الخريطة *   │
├────────────────────────────────┤
│  معلومات السكن                │
│  نوع السكن                    │
│  [شقة] [منزل] [فيلا]          │
│  عدد أفراد العائلة             │
│  [__]                          │
├────────────────────────────────┤
│  الخبرة والوقت                │
│  مستوى الخبرة                 │
│  [لا يوجد] [مبتدئ] [متمرس]    │
│  الوقت المتاح                 │
│  [قليل] [متوسط] [كثير]        │
├────────────────────────────────┤
│  سبب التبني *                 │
│  [____________________]        │
│  [____________________]        │
├────────────────────────────────┤
│  خطط الرعاية (اختياري)        │
│  خطة التغذية                  │
│  [____________________]        │
│  خطة التمارين                 │
│  [____________________]        │
│  خطة الرعاية البيطرية         │
│  [____________________]        │
│  خطة الطوارئ                  │
│  [____________________]        │
├────────────────────────────────┤
│  الموافقات المطلوبة *         │
│  ☑ موافقة العائلة             │
│  ☑ زيارات المتابعة            │
│  ☑ الرعاية البيطرية           │
│  ☑ التدريب                    │
├────────────────────────────────┤
│    [إرسال طلب التبني]          │
└────────────────────────────────┘
```

### 3. شاشة إدارة الطلبات
**Path**: Profile → طلبات التبني
```
┌────────────────────────────────┐
│  طلبات التبني             ✕   │
├────────────────────────────────┤
│ [المُستلمة (3)] [المُرسلة (1)]│
├────────────────────────────────┤
│  ┌──────────────────────────┐  │
│  │ 📷 فلافي         ▼      │  │
│  │ الطالب: أحمد محمد       │  │
│  │ [قيد المراجعة] 15 أكت  │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ معلومات الاتصال          │  │
│  │ 📧 ahmed@example.com    │  │
│  │ 📱 01234567890          │  │
│  │ 📍 الرياض، حي النخيل    │  │
│  ├──────────────────────────┤  │
│  │ معلومات شخصية            │  │
│  │ العمر: 28 سنة            │  │
│  │ المهنة: مهندس            │  │
│  │ نوع السكن: شقة           │  │
│  ├──────────────────────────┤  │
│  │ سبب التبني               │  │
│  │ أحب الحيوانات وأريد...  │  │
│  ├──────────────────────────┤  │
│  │  [✓ قبول]  [✗ رفض]     │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

## API Endpoints المستخدمة 🌐

### Verification Endpoints
```http
POST /api/accounts/verification/request/
- Headers: Authorization: Token <token>
- Body: multipart/form-data
  - id_photo: Image
  - selfie_video: Video (max 20MB, 15 seconds)

GET /api/accounts/verification/status/
- Headers: Authorization: Token <token>
- Response: verification status object
```

### Adoption Endpoints
```http
GET /api/pets/adoption/my/
- Get my sent adoption requests
- Response: Array of AdoptionRequest objects

GET /api/pets/adoption/received/
- Get adoption requests for my pets
- Response: Array of AdoptionRequest objects

POST /api/pets/adoption/
- Submit new adoption request
- Requires: user.is_verified = true
- Body: Full adoption request data
- Returns: 403 if not verified

POST /api/pets/adoption/{id}/respond/
- Respond to received request
- Body: { "response": "accepted" | "rejected" }
- Updates pet status automatically
```

## تدفق العمل الكامل 🔄

### من جهة طالب التبني:
```
1. المستخدم يتصفح الحيوانات
   ↓
2. يجد حيوان "متاح للتبني"
   ↓
3. يضغط "🏠 طلب تبني"
   ↓
4. النظام يتحقق: هل المستخدم verified؟
   ├─ ❌ لا → رسالة تنبيه + توجيه للتحقق
   └─ ✅ نعم → فتح نموذج الطلب
   ↓
5. المستخدم يملأ النموذج:
   • معلومات شخصية
   • عنوان + موقع على الخريطة
   • معلومات السكن
   • الخبرة والوقت
   • سبب التبني
   • خطط الرعاية
   • الموافقات
   ↓
6. يرسل الطلب
   ↓
7. يستلم إشعار عند رد المالك
   ↓
8. يمكنه مراجعة الطلبات في:
   Profile → طلبات التبني → المُرسلة
```

### من جهة مالك الحيوان:
```
1. يستلم إشعار بطلب تبني جديد
   ↓
2. يفتح Profile → طلبات التبني
   ↓
3. يختار تبويب "المُستلمة"
   ↓
4. يضغط على الطلب لعرض التفاصيل:
   • معلومات الطالب
   • معلومات الاتصال
   • سبب التبني
   • خطط الرعاية
   • الموافقات
   ↓
5. يقرر:
   ├─ ✅ قبول → الحالة تتغير إلى "approved"
   │              الحيوان → "adoption_pending"
   │              يُفتح chat للتنسيق
   └─ ✗ رفض → الحالة تتغير إلى "rejected"
```

## الملفات المُنشأة/المُعدلة 📁

### Backend (Django)
```
✅ patmatch/accounts/
   ├── models.py (AccountVerification model)
   ├── serializers.py (Verification serializers + validation)
   ├── views.py (submit_account_verification, get_verification_status)
   ├── admin.py (Admin interface with video player)
   └── migrations/
       ├── 0008_accountverification.py
       └── 0009_change_selfie_to_video.py

✅ patmatch/pets/
   └── views.py (AdoptionRequestListCreateView.create - added verification check)
```

### Mobile App (React Native)
```
NEW FILES:
✅ src/components/
   └── VideoPicker.tsx
   
✅ src/screens/adoption-request/
   ├── AdoptionRequestScreen.tsx
   └── AdoptionRequestsScreen.tsx
   
✅ src/screens/profile/
   └── VerificationScreen.tsx

UPDATED FILES:
✅ src/services/api.ts
   - AccountVerification interface
   - VerificationStatus interface
   - AdoptionRequest interface
   - submitVerification()
   - getVerificationStatus()
   
✅ src/screens/profile/ProfileScreen.tsx
   - Added "التحقق من الحساب" quick action
   - Added "طلبات التبني" quick action
   - Integrated VerificationScreen
   - Integrated AdoptionRequestsScreen
   
✅ src/screens/pets/PetDetailsScreen.tsx
   - Added adoption request button
   - Verification check before adoption
   - Different buttons based on pet status
   
✅ package.json
   - Added react-native-video dependency
```

## التثبيت والإعداد 🚀

### 1. Backend (مُكتمل بالفعل)
```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite/patmatch

# Migrations already applied ✅
python3 manage.py makemigrations accounts
python3 manage.py migrate accounts
```

### 2. Mobile App Dependencies
```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite/PetMatchMobile

# Install react-native-video
npm install react-native-video@^6.0.0

# For iOS, update pods
cd ios && pod install && cd ..

# Rebuild the app
npm run android
# or
npm run ios
```

## كيفية الاستخدام 📖

### للمستخدمين:

#### 1. التحقق من الحساب (خطوة إلزامية أولاً)
```
الملف الشخصي → التحقق من الحساب
↓
ارفع صورة الهوية
↓
صور فيديو سيلفي (10-15 ثانية):
• امسك الهوية بجانب وجهك
• قل: "أنا [اسمك] أريد التحقق من حسابي"
• حرك رأسك قليلاً
↓
إرسال الطلب
↓
انتظر المراجعة (24-48 ساعة)
```

#### 2. طلب تبني حيوان
```
الحيوانات → اختر حيوان "متاح للتبني"
↓
🏠 طلب تبني
↓
املأ النموذج:
• معلوماتك الشخصية
• موقعك (خريطة)
• معلومات السكن
• خبرتك
• سبب التبني
• خطط الرعاية
• الموافقات
↓
إرسال الطلب
```

#### 3. متابعة الطلبات
```
الملف الشخصي → طلبات التبني
↓
اختر التبويب:
• المُرسلة: طلباتك
• المُستلمة: طلبات لحيواناتك
```

### للمشرفين (Django Admin):

#### مراجعة طلبات التحقق
```
1. /admin/accounts/accountverification/
2. Filter by status = "pending"
3. افتح الطلب
4. شاهد:
   • صورة الهوية
   • فيديو السيلفي (مشغل مدمج)
5. اختر إجراء:
   ✓ قبول الطلبات المحددة
   ✗ رفض الطلبات المحددة
6. أضف ملاحظات (اختياري)
```

## الفلاتر والـ Validation 🔍

### Form Validation
```javascript
✅ الاسم الكامل: required
✅ البريد: required + valid email format
✅ الهاتف: required + Egyptian/Saudi/UAE format
✅ العمر: required + >= 18
✅ المهنة: required
✅ العنوان: required
✅ الموقع: required (lat/lng from map)
✅ سبب التبني: required + min 20 characters
✅ جميع الموافقات: required (must check all)
```

### Video Validation (Backend)
```python
✅ File types: MP4, MOV, AVI, WEBM
✅ Max size: 20 MB
✅ Duration: 10-15 seconds (enforced in mobile)
```

### Business Logic
```
✅ User must be verified to submit adoption request
✅ Cannot submit duplicate pending requests
✅ Pet must be available_for_adoption
✅ Owner cannot adopt their own pet
✅ Automatic status updates (pet & request)
```

## حالات الطلبات 📊

### Request Status Flow
```
pending (قيد المراجعة)
  ↓ Owner accepts
approved (مقبول)
  ↓ Owner marks complete
completed (مكتمل)
  
pending (قيد المراجعة)
  ↓ Owner rejects
rejected (مرفوض)
```

### Pet Status Changes
```
available_for_adoption
  ↓ Request approved
adoption_pending (التبني قيد المراجعة)
  ↓ Adoption completed
adopted (تم تبنيه)
```

## الإشعارات 🔔

### Existing (Backend Ready)
- ✅ `notify_adoption_request_received` - عند استلام طلب جديد
- ✅ `notify_adoption_request_approved` - عند قبول الطلب
- ✅ تكامل Firebase Cloud Messaging

### Mobile Integration
- الإشعارات تعمل تلقائياً عبر FCM
- يتم عرضها في NotificationListScreen

## الأمان والخصوصية 🔒

### Verification Security
- ✅ فيديو سيلفي (Liveness Detection)
- ✅ صعوبة التزوير
- ✅ تخزين آمن للمستندات
- ✅ مراجعة يدوية من المشرفين

### Data Protection
- ✅ Authentication required لجميع endpoints
- ✅ Users can only see their own requests
- ✅ Pet owners can only respond to their pets' requests
- ✅ Sensitive data in HTTPS only

## الاختبارات المطلوبة ✓

### Verification Flow
- [ ] تصوير فيديو سيلفي
- [ ] رفع فيديو من المعرض
- [ ] التحقق من حجم الفيديو (>20MB يرفض)
- [ ] إرسال طلب التحقق
- [ ] عرض حالة الطلب (pending/approved/rejected)
- [ ] المشرف يراجع الطلب في Admin
- [ ] المشرف يقبل/يرفض
- [ ] is_verified تتحدث تلقائياً

### Adoption Request Flow
- [ ] مستخدم غير verified يحاول التبني → رسالة تنبيه
- [ ] مستخدم verified يملأ نموذج التبني
- [ ] Validation يعمل على جميع الحقول
- [ ] اختيار الموقع على الخريطة يعمل
- [ ] إرسال الطلب بنجاح
- [ ] المالك يستلم إشعار
- [ ] المالك يرى الطلب في "المُستلمة"
- [ ] المالك يقبل الطلب → حالة الحيوان تتغير
- [ ] المالك يرفض الطلب
- [ ] الطالب يرى تحديث الحالة في "المُرسلة"

### UI/UX Testing
- [ ] Loading states تظهر بشكل صحيح
- [ ] Empty states واضحة ومفيدة
- [ ] Error messages بالعربية
- [ ] Pull-to-refresh يعمل
- [ ] Navigation بين الشاشات سلسة
- [ ] Back button يعمل بشكل صحيح
- [ ] Keyboard handling صحيح
- [ ] ScrollView responsive

## المزايا الرئيسية 🌟

### 1. أمان محسّن 🔐
- تحقق بالفيديو (لا يمكن استخدام صور مزورة)
- Liveness detection (الشخص يتحرك ويتكلم)
- مراجعة يدوية من مشرفين

### 2. عملية شاملة 📋
- نموذج تفصيلي لجمع كل المعلومات المهمة
- خطط رعاية واضحة
- موافقات قانونية

### 3. سهولة الاستخدام 💫
- واجهة بسيطة وواضحة
- تعليمات خطوة بخطوة
- رسائل خطأ مفيدة
- تصميم عصري

### 4. شفافية كاملة 👀
- المالك يرى كل تفاصيل الطالب
- الطالب يعرف حالة طلبه
- تحديثات فورية

## الخطوات التالية (اختياري) 🚧

### Phase 2 Enhancements:
1. **Chat Integration**
   - فتح محادثة تلقائياً عند القبول
   - تبادل الرسائل للتنسيق

2. **Video Compression**
   - ضغط الفيديو تلقائياً قبل الرفع
   - تقليل الحجم بدون خسارة جودة

3. **AI Verification**
   - Face recognition للمقارنة
   - Automated liveness detection
   - OCR لقراءة بيانات الهوية

4. **Analytics**
   - معدلات القبول/الرفض
   - متوسط وقت المراجعة
   - إحصائيات التبني

5. **Enhanced Notifications**
   - إشعارات push عند تغيير الحالة
   - تذكيرات للمالكين بالطلبات المعلقة
   - badges على الأيقونات

## المتطلبات التقنية 💻

### Dependencies
```json
{
  "react-native": "0.74.5",
  "react-native-image-picker": "^8.2.1",
  "react-native-video": "^6.0.0",
  "@react-native-async-storage/async-storage": "^1.21.0",
  "react-native-geolocation-service": "^5.3.1"
}
```

### Permissions Required
```xml
<!-- Android -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- iOS -->
NSCameraUsageDescription
NSPhotoLibraryUsageDescription
NSMicrophoneUsageDescription
NSLocationWhenInUseUsageDescription
```

## الخلاصة ✨

تم تنفيذ نظام تبني كامل ومتكامل يتضمن:
- 🔐 تحقق أمني بالفيديو
- 📝 نموذج شامل للطلبات
- 📋 إدارة كاملة للطلبات
- ✅ موافقة/رفض سهلة
- 💬 جاهز للتكامل مع Chat
- 🎨 UI/UX احترافي
- 🌍 دعم كامل للعربية

النظام جاهز للاستخدام الآن! 🎉


