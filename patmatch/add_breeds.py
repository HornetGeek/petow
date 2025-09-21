#!/usr/bin/env python3
"""
سكريبت لإضافة سلالات القطط والكلاب
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed

def add_cat_breeds():
    """إضافة سلالات القطط"""
    cat_breeds = [
        {
            'name': 'قط فارسي',
            'pet_type': 'cats',
            'description': 'قط طويل الشعر، هادئ وودود، مناسب للعائلات'
        },
        {
            'name': 'قط سيامي',
            'pet_type': 'cats',
            'description': 'قط ذكي ونشط، يحب التفاعل مع البشر'
        },
        {
            'name': 'قط ماين كون',
            'pet_type': 'cats',
            'description': 'قط كبير الحجم، ودود ومخلص للعائلة'
        },
        {
            'name': 'قط البريطاني قصير الشعر',
            'pet_type': 'cats',
            'description': 'قط مستدير الوجه، هادئ ومستقل'
        },
        {
            'name': 'قط الحبشي',
            'pet_type': 'cats',
            'description': 'قط رياضي ونشط، يحب اللعب والحركة'
        },
        {
            'name': 'قط الروسي الأزرق',
            'pet_type': 'cats',
            'description': 'قط هادئ ومخلص، مناسب للعائلات الهادئة'
        },
        {
            'name': 'قط البنغال',
            'pet_type': 'cats',
            'description': 'قط بري المظهر، نشط ويحب اللعب'
        },
        {
            'name': 'قط المانكس',
            'pet_type': 'cats',
            'description': 'قط بدون ذيل، ذكي ومخلص'
        },
        {
            'name': 'قط البورمي',
            'pet_type': 'cats',
            'description': 'قط متوسط الحجم، ودود ومحب للعائلة'
        },
        {
            'name': 'قط الهيمالايا',
            'pet_type': 'cats',
            'description': 'قط طويل الشعر، هادئ ومحب للراحة'
        },
        {
            'name': 'قط الأمريكي قصير الشعر',
            'pet_type': 'cats',
            'description': 'قط قوي البنية، صبور ومخلص'
        },
        {
            'name': 'قط النرويجي',
            'pet_type': 'cats',
            'description': 'قط طويل الشعر، رياضي ومحب للطبيعة'
        }
    ]
    
    print("🐱 إضافة سلالات القطط...")
    for breed_data in cat_breeds:
        breed, created = Breed.objects.get_or_create(
            name=breed_data['name'],
            pet_type=breed_data['pet_type'],
            defaults={'description': breed_data['description']}
        )
        if created:
            print(f"✅ تم إضافة: {breed.name}")
        else:
            print(f"ℹ️ موجود مسبقاً: {breed.name}")

def add_dog_breeds():
    """إضافة سلالات الكلاب"""
    dog_breeds = [
        {
            'name': 'جولدن ريتريفر',
            'pet_type': 'dogs',
            'description': 'كلب ذكي وودود، ممتاز مع الأطفال والعائلات'
        },
        {
            'name': 'لابرادور ريتريفر',
            'pet_type': 'dogs',
            'description': 'كلب نشط ومخلص، مناسب للعائلات النشطة'
        },
        {
            'name': 'جيرمن شيبرد',
            'pet_type': 'dogs',
            'description': 'كلب ذكي ومخلص، ممتاز للحراسة والتدريب'
        },
        {
            'name': 'بولدوغ فرنسي',
            'pet_type': 'dogs',
            'description': 'كلب صغير ومرح، مناسب للشقق'
        },
        {
            'name': 'بيجل',
            'pet_type': 'dogs',
            'description': 'كلب صغير ونشط، يحب اللعب والاستكشاف'
        },
        {
            'name': 'بوميرانيان',
            'pet_type': 'dogs',
            'description': 'كلب صغير وحيوي، مناسب للعائلات الصغيرة'
        },
        {
            'name': 'شيه تزو',
            'pet_type': 'dogs',
            'description': 'كلب صغير وهادئ، ممتاز للشقق'
        },
        {
            'name': 'يوركشاير تيرير',
            'pet_type': 'dogs',
            'description': 'كلب صغير وذكي، مناسب للعائلات'
        },
        {
            'name': 'كاوالير كينج تشارلز سبانييل',
            'pet_type': 'dogs',
            'description': 'كلب ودود وهادئ، ممتاز مع الأطفال'
        },
        {
            'name': 'هاسكي سيبيري',
            'pet_type': 'dogs',
            'description': 'كلب رياضي ونشط، يحتاج تمرين يومي'
        },
        {
            'name': 'روت وايلر',
            'pet_type': 'dogs',
            'description': 'كلب قوي ومخلص، ممتاز للحراسة'
        },
        {
            'name': 'دوبرمان',
            'pet_type': 'dogs',
            'description': 'كلب ذكي ومخلص، ممتاز للحراسة والتدريب'
        },
        {
            'name': 'كولي',
            'pet_type': 'dogs',
            'description': 'كلب ذكي وودود، ممتاز مع الأطفال'
        },
        {
            'name': 'سانت برنارد',
            'pet_type': 'dogs',
            'description': 'كلب كبير وودود، ممتاز مع العائلات'
        },
        {
            'name': 'بيرنيز ماونتن دوغ',
            'pet_type': 'dogs',
            'description': 'كلب كبير وهادئ، ممتاز مع الأطفال'
        },
        {
            'name': 'نيوفاوندلاند',
            'pet_type': 'dogs',
            'description': 'كلب كبير وودود، يحب الماء والأطفال'
        }
    ]
    
    print("\n🐕 إضافة سلالات الكلاب...")
    for breed_data in dog_breeds:
        breed, created = Breed.objects.get_or_create(
            name=breed_data['name'],
            pet_type=breed_data['pet_type'],
            defaults={'description': breed_data['description']}
        )
        if created:
            print(f"✅ تم إضافة: {breed.name}")
        else:
            print(f"ℹ️ موجود مسبقاً: {breed.name}")

def show_existing_breeds():
    """عرض السلالات الموجودة"""
    print("\n📋 السلالات الموجودة حالياً:")
    
    cats = Breed.objects.filter(pet_type='cats')
    dogs = Breed.objects.filter(pet_type='dogs')
    
    print(f"\n🐱 القطط ({cats.count()} سلالة):")
    for cat in cats:
        print(f"  - {cat.name}")
    
    print(f"\n🐕 الكلاب ({dogs.count()} سلالة):")
    for dog in dogs:
        print(f"  - {dog.name}")

def main():
    """الدالة الرئيسية"""
    print("🚀 بدء إضافة السلالات...")
    
    # إضافة سلالات القطط
    add_cat_breeds()
    
    # إضافة سلالات الكلاب
    add_dog_breeds()
    
    # عرض السلالات الموجودة
    show_existing_breeds()
    
    print("\n🎉 تم الانتهاء من إضافة السلالات!")

if __name__ == '__main__':
    main() 