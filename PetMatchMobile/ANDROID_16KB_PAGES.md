# دعم صفحات الذاكرة 16KB - مطلب Google Play الجديد

## المشكلة
بدءاً من 1 نوفمبر 2025، تطلب Google Play من جميع التطبيقات التي تستهدف Android 15+ أن تكون متوافقة مع صفحات الذاكرة بحجم 16 كيلوبايت بدلاً من 4 كيلوبايت التقليدية.

## التغييرات المُطبقة

### 1. تحديث إعدادات البناء (`android/app/build.gradle`)
```gradle
defaultConfig {
    // ... باقي الإعدادات
    versionCode 10
    versionName "1.0.9"

    // دعم أجهزة 16KB page size من خلال الاقتصار على معالجات 64-bit
    ndk {
        abiFilters "arm64-v8a", "x86_64"
    }
    
    packagingOptions {
        pickFirst '**/libc++_shared.so'
        pickFirst '**/libjsc.so'
        pickFirst '**/libreactnativejni.so'
    }
}
```

### 2. تحديث إعدادات Gradle (`android/gradle.properties`)
```properties
# Enable 16KB page size support (required for Android 15+)
android.native.useEmbeddedDexLoader=true

# Restrict builds to 64-bit ABIs only (required for 16KB pages)
reactNativeArchitectures=arm64-v8a,x86_64
```

### 3. تقييد الهياكل المدعومة
- تم التركيز على `arm64-v8a` و `x86_64` فقط
- تم تحديث خريطة إصدارات الـ APK لتتوافق مع 64-bit فقط
- هذا يقلل حجم التطبيق ويضمن التوافق مع الأجهزة الحديثة

### 4. تهيئة إعدادات الإصدار (`android/app/build.gradle`)
```gradle
release {
    minifyEnabled true
    shrinkResources true
    proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    ndk {
        debugSymbolLevel 'FULL'
    }
}
```
- تم تمكين R8/ProGuard لإنتاج ملف `mapping.txt` تلقائياً.
- تمت إضافة `debugSymbolLevel 'FULL'` لإنتاج ملف `native-debug-symbols.zip` المطلوب من Google Play.

## كيفية الاختبار

### 1. بناء النسخة للاختبار
```bash
cd android
./gradlew assembleRelease
```

### 2. اختبار التوافق
```bash
# تشغيل script الاختبار
cd scripts
chmod +x test-16kb-pages.sh
./test-16kb-pages.sh
```

### 3. رفع للاختبار على Google Play
1. ارفع الـ APK أو AAB إلى Google Play Console
2. Google Play سيختبر التوافق تلقائياً
3. ستحصل على تأكيد إذا كان التطبيق متوافق

### 4. تجهيز ملفات التحليل (mapping + native symbols)
```bash
cd android
./gradlew app:bundleRelease
```
- بعد البناء، يوجد ملف `app/build/outputs/mapping/release/mapping.txt` (ارفعه في قسم Play Console > Artifacts).
- يوجد ملف `app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip` (ارفعه في قسم Native debug symbols).
- تساعد هذه الملفات في تحليل الأعطال و ANR على Google Play Console.

## المتطلبات
- ✅ React Native 0.74.5 (متوافق)
- ✅ Target SDK 34+ (متوافق) 
- ✅ NDK version 26+ (متوافق)
- ✅ ARM64 & X86_64 support only

## التحقق من النجاح
بعد رفع التحديث، يجب أن تختفي رسالة التحذير من Google Play Console التي تقول:
> "لن تتمكّن من إصدار تحديثات التطبيقات"

## استكشاف الأخطاء
- إذا فشل البناء، تأكد من أن NDK مُثبت بشكل صحيح
- إذا كان التطبيق لا يعمل، اختبر على جهاز Android 15+
- راجع logs لأي مشاكل مع المكتبات المحلية (native libraries)

## الموعد النهائي
**1 نوفمبر 2025** - آخر موعد لرفع تحديثات متوافقة مع 16KB pages. 