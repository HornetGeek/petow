# دليل المساهمة في PetMatch 🤝

## مرحباً بك! 🎉

نشكرك على اهتمامك بالمساهمة في مشروع PetMatch! هذا الدليل سيساعدك في البدء.

## كيف تبدأ 🚀

### 1. إعداد البيئة المحلية

```bash
# استنساخ المشروع
git clone https://github.com/HornetGeek/petow.git
cd petow

# إعداد Backend
cd patmatch
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# إعداد Frontend
cd ../petmatch-nextjs
npm install
```

### 2. إنشاء فرع جديد

```bash
git checkout -b feature/your-feature-name
# أو
git checkout -b fix/your-fix-name
```

## معايير الكود 📝

### Python (Django)
- استخدم Python 3.8+
- اتبع PEP 8
- اكتب docstrings للدوال
- أضف type hints

```python
def calculate_distance(self, user_lat: float, user_lng: float) -> Optional[float]:
    """
    حساب المسافة بين المستخدم والحيوان.
    
    Args:
        user_lat: خط عرض المستخدم
        user_lng: خط طول المستخدم
        
    Returns:
        المسافة بالكيلومتر أو None إذا فشل الحساب
    """
    try:
        # الكود هنا
        pass
    except Exception as e:
        logger.error(f"خطأ في حساب المسافة: {e}")
        return None
```

### TypeScript/React
- استخدم TypeScript
- اتبع ESLint rules
- استخدم functional components
- اكتب JSDoc comments

```typescript
/**
 * مكون عرض معلومات الحيوان
 */
interface PetInfoProps {
  pet: Pet;
  onEdit?: (pet: Pet) => void;
}

export const PetInfo: React.FC<PetInfoProps> = ({ pet, onEdit }) => {
  // الكود هنا
};
```

## إرسال التغييرات 📤

### 1. Commit التغييرات

```bash
git add .
git commit -m "feat: إضافة نظام البحث المتقدم

- إضافة فلترة متعددة المعايير
- تحسين أداء البحث
- إضافة اختبارات للوظائف الجديدة"
```

### 2. Push للفرع

```bash
git push origin feature/your-feature-name
```

### 3. فتح Pull Request

- اذهب لـ GitHub repository
- اضغط "New Pull Request"
- اختر الفرع المصدر والهدف
- اكتب وصف واضح للتغييرات

## قواعد Commit Messages 📋

استخدم prefixes واضحة:

- `feat:` ميزة جديدة
- `fix:` إصلاح خطأ
- `docs:` تحديث الوثائق
- `style:` تحسينات التنسيق
- `refactor:` إعادة هيكلة الكود
- `test:` إضافة أو تحديث الاختبارات
- `chore:` مهام الصيانة

## الاختبارات 🧪

### Backend Tests
```bash
cd patmatch
python manage.py test
python manage.py test pets.tests.test_models
```

### Frontend Tests
```bash
cd petmatch-nextjs
npm test
npm run test:watch
```

## الإبلاغ عن الأخطاء 🐛

### عند الإبلاغ عن خطأ:

1. **وصف واضح**: ما الذي حدث؟
2. **خطوات التكرار**: كيف يمكن تكرار المشكلة؟
3. **السلوك المتوقع**: ما الذي كان يجب أن يحدث؟
4. **معلومات النظام**: نظام التشغيل، المتصفح، إلخ
5. **لقطات شاشة**: إذا كان ذلك مفيداً

### مثال:
```
العنوان: خطأ في حساب المسافة عند الإحداثيات السالبة

الوصف:
عند إدخال إحداثيات سالبة، يحدث خطأ في حساب المسافة

خطوات التكرار:
1. اذهب لصفحة إضافة حيوان
2. أدخل إحداثيات سالبة (-90, -180)
3. اضغط حفظ

الخطأ:
ValueError: Invalid coordinates

السلوك المتوقع:
يجب أن يتم حفظ الإحداثيات بدون أخطاء
```

## اقتراح ميزات 💡

### عند اقتراح ميزة جديدة:

1. **وصف الميزة**: ما الذي تريد إضافته؟
2. **الفوائد**: كيف ستساعد المستخدمين؟
3. **التنفيذ**: اقتراحات للتنفيذ
4. **الأولوية**: مدى أهمية الميزة

## التواصل 📞

- **GitHub Issues**: للإبلاغ عن الأخطاء واقتراح الميزات
- **Discussions**: للنقاشات العامة
- **Pull Requests**: للمراجعة والتعليقات

## شكراً لك! 🙏

مساهماتك تساعد في جعل PetMatch منصة أفضل للحيوانات الأليفة والمستخدمين!

---

# Contributing to PetMatch 🤝

## Welcome! 🎉

Thank you for your interest in contributing to PetMatch! This guide will help you get started.

## How to Start 🚀

### 1. Local Environment Setup

```bash
# Clone the project
git clone https://github.com/HornetGeek/petow.git
cd petow

# Setup Backend
cd patmatch
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# Setup Frontend
cd ../petmatch-nextjs
npm install
```

### 2. Create a New Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-fix-name
```

## Code Standards 📝

### Python (Django)
- Use Python 3.8+
- Follow PEP 8
- Write docstrings for functions
- Add type hints

### TypeScript/React
- Use TypeScript
- Follow ESLint rules
- Use functional components
- Write JSDoc comments

## Submitting Changes 📤

### 1. Commit Changes

```bash
git add .
git commit -m "feat: add advanced search system

- Add multi-criteria filtering
- Improve search performance
- Add tests for new functions"
```

### 2. Push to Branch

```bash
git push origin feature/your-feature-name
```

### 3. Open Pull Request

- Go to GitHub repository
- Click "New Pull Request"
- Select source and target branches
- Write clear description of changes

## Commit Message Rules 📋

Use clear prefixes:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation updates
- `style:` formatting improvements
- `refactor:` code restructuring
- `test:` adding or updating tests
- `chore:` maintenance tasks

## Testing 🧪

### Backend Tests
```bash
cd patmatch
python manage.py test
python manage.py test pets.tests.test_models
```

### Frontend Tests
```bash
cd petmatch-nextjs
npm test
npm run test:watch
```

## Reporting Bugs 🐛

### When reporting a bug:

1. **Clear description**: What happened?
2. **Reproduction steps**: How to reproduce the problem?
3. **Expected behavior**: What should have happened?
4. **System info**: OS, browser, etc.
5. **Screenshots**: If helpful

## Feature Requests 💡

### When suggesting a new feature:

1. **Feature description**: What do you want to add?
2. **Benefits**: How will it help users?
3. **Implementation**: Suggestions for implementation
4. **Priority**: How important is the feature?

## Communication 📞

- **GitHub Issues**: For bug reports and feature requests
- **Discussions**: For general discussions
- **Pull Requests**: For reviews and comments

## Thank You! 🙏

Your contributions help make PetMatch a better platform for pets and users! 