# إعداد تسجيل الدخول بـ Google و Facebook

## 1. إنشاء ملف `.env.local`

أنشئ ملف `.env.local` في جذر المشروع وأضف المتغيرات التالية:

```env
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth
FACEBOOK_CLIENT_ID=your-facebook-app-id
FACEBOOK_CLIENT_SECRET=your-facebook-app-secret
```

## 2. الحصول على مفاتيح Google

### خطوات إعداد Google OAuth:

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/)
2. أنشئ مشروع جديد أو اختر مشروع موجود
3. فعّل Google+ API من قسم APIs & Services
4. اذهب إلى Credentials → Create Credentials → OAuth 2.0 Client IDs
5. اختر Application type: Web application
6. أضف Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google` (للإنتاج)
7. انسخ Client ID و Client Secret

## 3. الحصول على مفاتيح Facebook

### خطوات إعداد Facebook OAuth:

1. اذهب إلى [Facebook Developers](https://developers.facebook.com/)
2. أنشئ تطبيق جديد
3. أضف Facebook Login product
4. في إعدادات Facebook Login، أضف Valid OAuth Redirect URIs:
   - `http://localhost:3000/api/auth/callback/facebook`
   - `https://yourdomain.com/api/auth/callback/facebook` (للإنتاج)
5. انسخ App ID و App Secret من Basic Settings

## 4. إنشاء NEXTAUTH_SECRET

يمكنك إنشاء secret key باستخدام:

```bash
openssl rand -base64 32
```

أو استخدم أي string عشوائي طويل.

## 5. تشغيل المشروع

```bash
npm run dev
```

الآن يمكنك زيارة `/auth` وستجد أزرار تسجيل الدخول بـ Google و Facebook تعمل!

## المميزات المضافة:

✅ **تسجيل دخول بـ Google** - سريع وآمن
✅ **تسجيل دخول بـ Facebook** - تكامل مع الشبكات الاجتماعية  
✅ **إدارة الجلسات** - حفظ حالة تسجيل الدخول
✅ **صفحة ملف شخصي** - عرض معلومات المستخدم
✅ **تسجيل خروج آمن** - حماية البيانات
✅ **تصميم جميل** - يتماشى مع brand identity للموقع

## ملاحظات مهمة:

- تأكد من إضافة `.env.local` إلى `.gitignore`
- لا تشارك المفاتيح السرية مع أحد
- استخدم domain حقيقي في الإنتاج
- اختبر التسجيل قبل النشر 