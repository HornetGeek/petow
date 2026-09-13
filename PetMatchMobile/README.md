# PetMatch Mobile App

تطبيق بيت ماتش للجوال - منصة التزاوج والتبني للحيوانات الأليفة

## المميزات

- 🔐 نظام مصادقة آمن
- 🐕 عرض الحيوانات الأليفة
- 🔍 بحث متقدم
- ❤️ المفضلة
- 💬 نظام محادثة
- 🏠 التبني
- 🐾 التزاوج
- 📱 واجهة مستخدم عربية جميلة
- 🔔 إشعارات فورية

## التقنيات المستخدمة

- **React Native 0.74.5** - إطار العمل الأساسي
- **TypeScript** - للكتابة الآمنة
- **React Navigation 6** - للتنقل
- **React Native Paper** - لمكونات الواجهة
- **React Query** - لإدارة البيانات
- **Axios** - للاتصال بالخادم
- **AsyncStorage** - للتخزين المحلي
- **React Hook Form** - لإدارة النماذج

## التثبيت والتشغيل

### المتطلبات

- Node.js >= 20.19.4
- React Native CLI
- Android Studio (للتطوير على Android)
- Xcode (للتطوير على iOS)

### خطوات التثبيت

1. **تثبيت التبعيات:**
```bash
npm install
```

2. **للتطوير على Android:**
```bash
npx react-native run-android
```

3. **للتطوير على iOS:**
```bash
npx react-native run-ios
```

4. **تشغيل Metro Bundler:**
```bash
npm start
```

## البنية

```
src/
├── components/          # المكونات القابلة لإعادة الاستخدام
├── contexts/           # React Contexts
├── hooks/              # Custom Hooks
├── navigation/         # نظام التنقل
├── screens/           # شاشات التطبيق
│   ├── auth/          # شاشات المصادقة
│   └── main/          # الشاشات الرئيسية
├── services/          # خدمات API
├── types/             # تعريفات TypeScript
└── utils/             # أدوات مساعدة
```

## API Integration

التطبيق متصل بـ API موجود في:
- Base URL: `https://api.petow.app/api`
- جميع endpoints متوافقة مع API الحالي

## الميزات المخطط لها

- [ ] دفع الإشعارات (Push Notifications)
- [ ] خرائط لموقع الحيوانات
- [ ] كاميرا لالتقاط الصور
- [ ] نظام تقييم
- [ ] دعم متعدد اللغات
- [ ] وضع عدم الاتصال (Offline Mode)

## المساهمة

1. Fork المشروع
2. إنشاء branch جديد (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add some AmazingFeature'`)
4. Push إلى Branch (`git push origin feature/AmazingFeature`)
5. فتح Pull Request

## الترخيص

هذا المشروع مرخص تحت رخصة MIT - راجع ملف [LICENSE](LICENSE) للتفاصيل.

## الدعم

للحصول على الدعم، يرجى فتح issue في GitHub أو التواصل معنا عبر البريد الإلكتروني.

---

تم تطوير هذا التطبيق بـ ❤️ لخدمة مجتمع محبي الحيوانات الأليفة
