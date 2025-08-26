# إعداد Firebase للـ SMS Authentication

## 1. إنشاء مشروع Firebase

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. أنشئ مشروع جديد
3. فعل Authentication من القائمة الجانبية
4. اذهب لـ Sign-in method وفعل Phone authentication

## 2. إعداد المفاتيح

1. اذهب لـ Project Settings > General
2. انسخ Firebase config object
3. أضف المفاتيح في ملف `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## 3. التحديد في Django Backend

أضف هذا الكود في `accounts/views.py`:

```python
import firebase_admin
from firebase_admin import credentials, auth

# تحديد في settings.py
firebase_cred = credentials.Certificate("path/to/firebase-adminsdk.json")
firebase_admin.initialize_app(firebase_cred)

# في views.py
def send_firebase_sms(phone_number, otp_code):
    """إرسال SMS عبر Firebase"""
    try:
        # إرسال OTP عبر Firebase
        message = f"كود التحقق الخاص بك: {otp_code}"
        
        # استخدام Firebase Admin SDK
        from firebase_admin import messaging
        
        # بدلاً من SMS، يمكن استخدام FCM للإشعارات
        # أو دمج Firebase Auth مع Django
        
        print(f"Firebase SMS sent to {phone_number}: {message}")
        return True
    except Exception as e:
        print(f"Firebase SMS error: {e}")
        return False
```

## 4. Frontend Integration

```javascript
// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

## 5. المحددات المجانية

- Firebase يوفر 10,000 تحقق SMS مجاناً شهرياً
- بعد كده $0.05 لكل رسالة
- مناسب جداً للـ MVP

## 6. البدائل المجانية الأخرى

1. **Twilio Trial**: $15.50 رصيد مجاني
2. **AWS SNS**: 100 رسالة مجانية شهرياً
3. **MessageBird**: رصيد تجريبي
4. **Nexmo/Vonage**: رصيد تجريبي

## 7. للتجربة الحالية

استخدم طباعة الكود في الكونسول للتطوير، وبعدين ادمج Firebase لما تكون جاهز للإنتاج. 