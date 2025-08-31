# 🐱 API حذف القطط

هذا الملف يوضح كيفية استخدام API endpoints لحذف القطط من قاعدة البيانات.

## ⚠️ تحذير مهم

**هذه العمليات لا يمكن التراجع عنها!** تأكد من أنك تريد حذف القطط قبل استخدام هذه APIs.

## 🔐 المتطلبات

- يجب أن تكون **مشرف (Superuser)** في النظام
- يجب إرسال token المصادقة في header `Authorization`

## 📋 API Endpoints

### 1. عرض ملخص القطط

**GET** `/api/pets/admin/cats/`

**الوصف:** عرض قائمة بجميع القطط الموجودة في قاعدة البيانات

**الاستجابة:**
```json
{
  "total_cats": 5,
  "cats": [
    {
      "id": 1,
      "name": "ميمي",
      "breed": "شيرازي",
      "owner": "ahmed_user",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 2. حذف جميع القطط

**DELETE** `/api/pets/admin/cats/delete/`

**الوصف:** حذف جميع القطط من قاعدة البيانات

**الاستجابة:**
```json
{
  "message": "تم حذف 5 قط بنجاح",
  "deleted_count": 5
}
```

### 3. حذف القطط حسب السلالة

**DELETE** `/api/pets/admin/cats/delete/{breed_name}/`

**الوصف:** حذف جميع القطط من سلالة معينة

**المعاملات:**
- `breed_name`: اسم السلالة (أو جزء منها)

**مثال:** `/api/pets/admin/cats/delete/شيرازي`

**الاستجابة:**
```json
{
  "message": "تم حذف 3 قط من سلالة شيرازي بنجاح",
  "deleted_count": 3
}
```

## 🚀 أمثلة الاستخدام

### باستخدام cURL

#### عرض ملخص القطط:
```bash
curl -X GET \
  "https://api.petow.app/api/pets/admin/cats/" \
  -H "Authorization: Token YOUR_TOKEN_HERE"
```

#### حذف جميع القطط:
```bash
curl -X DELETE \
  "https://api.petow.app/api/pets/admin/cats/delete/" \
  -H "Authorization: Token YOUR_TOKEN_HERE"
```

#### حذف القطط من سلالة معينة:
```bash
curl -X DELETE \
  "https://api.petow.app/api/pets/admin/cats/delete/شيرازي" \
  -H "Authorization: Token YOUR_TOKEN_HERE"
```

### باستخدام JavaScript/Fetch

```javascript
// عرض ملخص القطط
async function getCatsSummary() {
  const response = await fetch('https://api.petow.app/api/pets/admin/cats/', {
    method: 'GET',
    headers: {
      'Authorization': 'Token YOUR_TOKEN_HERE',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
}

// حذف جميع القطط
async function deleteAllCats() {
  const response = await fetch('https://api.petow.app/api/pets/admin/cats/delete/', {
    method: 'DELETE',
    headers: {
      'Authorization': 'Token YOUR_TOKEN_HERE',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
}

// حذف القطط من سلالة معينة
async function deleteCatsByBreed(breedName) {
  const response = await fetch(`https://api.petow.app/api/pets/admin/cats/delete/${breedName}/`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Token YOUR_TOKEN_HERE',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
}
```

### باستخدام Python

```python
import requests

# إعدادات
BASE_URL = "https://api.petow.app/api/pets"
TOKEN = "YOUR_TOKEN_HERE"
HEADERS = {
    "Authorization": f"Token {TOKEN}",
    "Content-Type": "application/json"
}

# عرض ملخص القطط
def get_cats_summary():
    response = requests.get(f"{BASE_URL}/admin/cats/", headers=HEADERS)
    return response.json()

# حذف جميع القطط
def delete_all_cats():
    response = requests.delete(f"{BASE_URL}/admin/cats/delete/", headers=HEADERS)
    return response.json()

# حذف القطط من سلالة معينة
def delete_cats_by_breed(breed_name):
    response = requests.delete(f"{BASE_URL}/admin/cats/delete/{breed_name}/", headers=HEADERS)
    return response.json()

# استخدام
if __name__ == "__main__":
    # عرض الملخص
    summary = get_cats_summary()
    print(f"عدد القطط: {summary['total_cats']}")
    
    # حذف جميع القطط
    result = delete_all_cats()
    print(result['message'])
```

## 🛠️ السكريبت المحلي

يمكنك أيضاً استخدام السكريبت المحلي `delete_cats.py`:

```bash
cd patmatch
python3 delete_cats.py
```

السكريبت يوفر واجهة تفاعلية لحذف القطط مع تأكيد العمليات.

## ⚡ ملاحظات مهمة

1. **الأمان:** هذه APIs متاحة للمشرفين فقط
2. **النسخ الاحتياطية:** تأكد من عمل نسخة احتياطية قبل الحذف
3. **التأكيد:** APIs لا تتطلب تأكيد إضافي - احرص على التأكد من صحة الطلب
4. **المعاملات:** جميع العمليات تتم في transaction واحدة لضمان الاتساق

## 🆘 في حالة الخطأ

إذا واجهت خطأ 403، تأكد من:
- أنك مشرف في النظام
- أن token المصادقة صحيح
- أن الـ CSRF settings صحيحة

إذا واجهت خطأ 500، تحقق من:
- سجلات الخادم
- صحة قاعدة البيانات
- صلاحيات المستخدم 