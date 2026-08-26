# PetMatch - منصة التبني والتزاوج للحيوانات الأليفة 🐾

[English](#english) | [العربية](#arabic)

---

## العربية

### 🎯 نظرة عامة
PetMatch هي منصة شاملة للتبني والتزاوج للحيوانات الأليفة، تهدف إلى ربط أصحاب الحيوانات مع العائلات المحبة والمهتمة. المنصة مبنية بتقنيات حديثة وتوفر تجربة مستخدم مميزة.

### ✨ المميزات الرئيسية
- **نظام التبني**: طلبات تبني منظمة مع نظام مراجعة شامل
- **نظام التزاوج**: إدارة طلبات التزاوج مع تتبع التاريخ
- **نظام الدردشة**: تواصل مباشر بين المستخدمين
- **نظام الموقع**: البحث عن الحيوانات القريبة باستخدام GPS
- **إدارة الشهادات**: شهادات صحية وتطعيمات
- **نظام الإشعارات**: إشعارات فورية للمستخدمين
- **واجهة مستخدم حديثة**: تصميم متجاوب ومتعدد اللغات
- **لوحة العيادات**: إدارة مواعيد وملفات العيادات البيطرية مع تقارير تفصيلية

### 🛠️ التقنيات المستخدمة

#### Backend (Django)
- **Django 4.2**: إطار عمل Python قوي
- **Django REST Framework**: API RESTful
- **PostgreSQL**: قاعدة بيانات متقدمة
- **Django Allauth**: نظام مصادقة شامل
- **JWT**: رموز مصادقة آمنة
- **CORS**: دعم الطلبات المتقاطعة

#### Frontend (Next.js)
- **Next.js 14**: إطار عمل React حديث
- **TypeScript**: برمجة آمنة بالنوع
- **Tailwind CSS**: تصميم سريع ومتجاوب
- **React Hook Form**: إدارة النماذج
- **Leaflet**: خرائط تفاعلية
- **Firebase**: مصادقة الهاتف

### 🚀 التثبيت والتشغيل

#### متطلبات النظام
- Python 3.8+
- Node.js 18+
- PostgreSQL 12+
- Git

#### تثبيت Backend
```bash
# استنساخ المشروع
git clone https://github.com/HornetGeek/petow.git
cd petow/patmatch

# إنشاء بيئة افتراضية
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# أو
venv\Scripts\activate  # Windows

# تثبيت المتطلبات
pip install -r requirements.txt

# إعداد قاعدة البيانات
python3 manage.py makemigrations
python3 manage.py migrate

# إنشاء مستخدم مدير
python3 manage.py createsuperuser

# تشغيل الخادم
python3 manage.py runserver
```

#### تثبيت Frontend
```bash
cd petmatch-nextjs

# تثبيت المتطلبات
npm install

# تشغيل في وضع التطوير
npm run dev

# بناء للإنتاج
npm run build
npm start
```

### 📱 استخدام التطبيق

#### للمستخدمين الجدد
### 🏥 لوحة العيادة الرقمية

- يمكن للعيادات التسجيل عبر الواجهة الجديدة على المسار `/clinic/register` للحصول على حساب متخصص.
- تسجيل الدخول من المسار `/clinic/login` يتيح الوصول إلى لوحة تحكم شاملة مع أقسام للحجوزات، العملاء، الرسائل، الخدمات، التقارير والإعدادات.
- الواجهة تستهلك واجهات REST جديدة من Django تحت المسار `/api/clinics/` والتي توفر وظائف التسجيل، تسجيل الدخول، إدارة المواعيد، العملاء، الرسائل إلى جانب تحديث إعدادات العيادة.
- يتم حفظ الجلسة الخاصة بالعيادة محلياً مع إمكانية التحديث الفوري للبيانات واستخدام السياق الجديد `ClinicAuthProvider` في الواجهة الأمامية.

- تمت إضافة زر مشاركة سريع لروابط الدعوات بحيث يمكن للعيادة نسخ رسالة التحميل ومشاركتها مع صاحب الحيوان بدون الاعتماد على رسائل SMS.

1. **التسجيل**: إنشاء حساب جديد مع مصادقة الهاتف
2. **إضافة حيوان**: رفع صور ومعلومات الحيوان مع تحديد الموقع
3. **إدارة الطلبات**: متابعة طلبات التبني والتزاوج

#### لأصحاب الحيوانات
1. **إضافة حيوان**: رفع معلومات وصور الحيوان
2. **استقبال الطلبات**: مراجعة طلبات التبني والتزاوج
3. **التواصل**: الدردشة مع المتقدمين

#### للمتبنين
1. **البحث**: البحث عن الحيوانات المتاحة
2. **تقديم طلب**: ملء نموذج طلب التبني
3. **المتابعة**: متابعة حالة الطلب

### 🔧 الإعدادات

#### متغيرات البيئة
```bash
# Django
SECRET_KEY=your_secret_key
DEBUG=True
DATABASE_URL=postgresql://user:password@localhost:5432/petmatch
GOOGLE_MAPS_SERVER_API_KEY=your_server_maps_key
# Mobile app invites
MOBILE_APP_INVITE_LINK_BASE=https://app.petmatch.com/invite
MOBILE_APP_DOWNLOAD_URL=https://app.petmatch.com/download

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY=your_web_maps_key

# Mobile
GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key
GOOGLE_MAPS_IOS_API_KEY=your_ios_maps_key
```

> راجع `GOOGLE_MAPS_SETUP.md` لخطوات التفعيل وتقييد المفاتيح لكل منصة.
> في حالات الطوارئ التشغيلية راجع `INCIDENT_RECOVERY_RUNBOOK.md`.

#### قاعدة البيانات
```bash
# إنشاء قاعدة بيانات PostgreSQL
createdb petmatch

# تشغيل Migrations
python3 manage.py migrate

# إضافة بيانات تجريبية (اختياري)
python3 manage.py loaddata sample_data.json
```

### 📊 هيكل المشروع
```
petow/
├── patmatch/                 # Backend Django
│   ├── accounts/            # نظام المستخدمين
│   ├── pets/               # إدارة الحيوانات
│   ├── clinics/            # إدارة العيادات
│   └── patmatch_backend/   # إعدادات Django
├── petmatch-nextjs/        # Frontend Next.js
│   ├── src/
│   │   ├── app/           # صفحات التطبيق
│   │   ├── components/    # المكونات
│   │   └── lib/          # المكتبات
│   └── public/           # الملفات العامة
└── docs/                 # الوثائق
```

### 🤝 المساهمة
نرحب بمساهماتكم! يرجى اتباع الخطوات التالية:

1. Fork المشروع
2. إنشاء فرع للميزة الجديدة (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add some AmazingFeature'`)
4. Push للفرع (`git push origin feature/AmazingFeature`)
5. فتح Pull Request

### 📄 الترخيص
هذا المشروع مرخص تحت رخصة MIT - انظر ملف [LICENSE](LICENSE) للتفاصيل.

### 📞 التواصل
- **GitHub Issues**: [https://github.com/HornetGeek/petow/issues](https://github.com/HornetGeek/petow/issues)
- **Email**: [your-email@example.com]

---

## English

### 🎯 Overview
PetMatch is a comprehensive platform for pet adoption and breeding, designed to connect pet owners with loving and interested families. Built with modern technologies, it provides an exceptional user experience.

### ✨ Key Features
- **Adoption System**: Organized adoption requests with comprehensive review system
- **Breeding System**: Breeding request management with history tracking
- **Chat System**: Direct communication between users
- **Location System**: GPS-based search for nearby pets
- **Certificate Management**: Health and vaccination certificates
- **Notification System**: Instant user notifications
- **Modern UI**: Responsive design with multi-language support

### 🛠️ Technologies Used

#### Backend (Django)
- **Django 4.2**: Powerful Python framework
- **Django REST Framework**: RESTful API
- **PostgreSQL**: Advanced database
- **Django Allauth**: Comprehensive authentication
- **JWT**: Secure authentication tokens
- **CORS**: Cross-origin request support

#### Frontend (Next.js)
- **Next.js 14**: Modern React framework
- **TypeScript**: Type-safe programming
- **Tailwind CSS**: Fast and responsive design
- **React Hook Form**: Form management
- **Leaflet**: Interactive maps
- **Firebase**: Phone authentication

### 🚀 Installation & Setup

#### System Requirements
- Python 3.8+
- Node.js 18+
- PostgreSQL 12+
- Git

#### Backend Installation
```bash
# Clone the project
git clone https://github.com/HornetGeek/petow.git
cd petow/patmatch

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install requirements
pip install -r requirements.txt

# Setup database
python3 manage.py makemigrations
python3 manage.py migrate

# Create superuser
python3 manage.py createsuperuser

# Run server
python3 manage.py runserver
```

#### Frontend Installation
```bash
cd petmatch-nextjs

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

### 📱 Using the Application

#### For New Users
1. **Registration**: Create new account with phone verification
2. **Add Pet**: Upload pet photos and information with location
3. **Manage Requests**: Track adoption and breeding requests

#### For Pet Owners
1. **Add Pet**: Upload pet information and photos
2. **Receive Requests**: Review adoption and breeding requests
3. **Communication**: Chat with applicants

#### For Adopters
1. **Search**: Find available pets
2. **Submit Request**: Fill adoption application form
3. **Follow Up**: Track request status

### 🔧 Configuration

#### Environment Variables
```bash
# Django
SECRET_KEY=your_secret_key
DEBUG=True
DATABASE_URL=postgresql://user:password@localhost:5432/petmatch
GOOGLE_MAPS_SERVER_API_KEY=your_server_maps_key
# Mobile app invites
MOBILE_APP_INVITE_LINK_BASE=https://app.petmatch.com/invite
MOBILE_APP_DOWNLOAD_URL=https://app.petmatch.com/download

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY=your_web_maps_key

# Mobile
GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key
GOOGLE_MAPS_IOS_API_KEY=your_ios_maps_key
```

> See `GOOGLE_MAPS_SETUP.md` for API enablement and platform key restriction rules.
> For production incident response, see `INCIDENT_RECOVERY_RUNBOOK.md`.

#### Database Setup
```bash
# Create PostgreSQL database
createdb petmatch

# Run migrations
python3 manage.py migrate

# Load sample data (optional)
python3 manage.py loaddata sample_data.json
```

### 📊 Project Structure
```
petow/
├── patmatch/                 # Django Backend
│   ├── accounts/            # User management
│   ├── pets/               # Pet management
│   ├── clinics/            # Clinic management
│   └── patmatch_backend/   # Django settings
├── petmatch-nextjs/        # Next.js Frontend
│   ├── src/
│   │   ├── app/           # Application pages
│   │   ├── components/    # Components
│   │   └── lib/          # Libraries
│   └── public/           # Public files
└── docs/                 # Documentation
```

### 🤝 Contributing
We welcome contributions! Please follow these steps:

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 📞 Contact
- **GitHub Issues**: [https://github.com/HornetGeek/petow/issues](https://github.com/HornetGeek/petow/issues)
- **Email**: [your-email@example.com]

---

## 🚀 Quick Start

### Option 1: Hybrid Deployment (Recommended) 🚀

#### Backend on EC2:
```bash
# Clone the project
git clone https://github.com/HornetGeek/petow.git
cd petow

# Start Backend only
./scripts/start-backend.sh

# Or manually
docker-compose -f docker-compose.backend.yml up --build -d
```

#### Frontend on Vercel:
1. **Fork/Clone** repository
2. **Connect** to Vercel
3. **Update** `vercel.json` with your EC2 IP
4. **Deploy** automatically

**Visit**: 
- **Frontend**: https://your-domain.vercel.app
- **Backend API**: http://your-ec2-ip:8000/api
- **Admin Panel**: http://your-ec2-ip:8000/admin

### Option 2: Full Docker Deployment 🐳

```bash
# Start all services
./scripts/start.sh

# Or manually
docker-compose up --build -d
```

**Visit**: http://localhost (Frontend + Backend via Nginx)

### Option 2: Manual Setup

```bash
# Clone and setup
git clone https://github.com/HornetGeek/petow.git
cd petow

# Backend
cd patmatch
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 manage.py migrate
python3 manage.py runserver

# Frontend (new terminal)
cd petmatch-nextjs
npm install
npm run dev
```

**Visit**: http://localhost:3000 (Frontend) | http://localhost:8000 (Backend)

## 🐳 Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart specific service
docker-compose restart backend

# Rebuild and start
docker-compose up --build -d

# Production mode
docker-compose -f docker-compose.prod.yml up -d
``` 
