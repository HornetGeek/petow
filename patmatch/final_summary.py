#!/usr/bin/env python3
"""
سكريبت نهائي لعرض ملخص شامل لجميع السلالات
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed

def show_comprehensive_summary():
    """عرض ملخص شامل لجميع السلالات"""
    print("🐾 ملخص شامل لجميع السلالات في قاعدة البيانات")
    print("=" * 60)
    
    total_breeds = Breed.objects.count()
    cats_count = Breed.objects.filter(pet_type='cats').count()
    dogs_count = Breed.objects.filter(pet_type='dogs').count()
    
    print(f"📊 الإحصائيات العامة:")
    print(f"  - إجمالي السلالات: {total_breeds}")
    print(f"  - سلالات القطط: {cats_count}")
    print(f"  - سلالات الكلاب: {dogs_count}")
    print()

def show_cat_breeds_summary():
    """عرض ملخص سلالات القطط"""
    print("🐱 سلالات القطط:")
    print("-" * 40)
    
    cats = Breed.objects.filter(pet_type='cats').order_by('name')
    for i, cat in enumerate(cats, 1):
        print(f"{i:2d}. {cat.name}")
        if cat.description:
            print(f"    {cat.description}")
        print()
    
    print(f"📊 إجمالي سلالات القطط: {cats.count()}")
    print()

def show_dog_breeds_summary():
    """عرض ملخص سلالات الكلاب"""
    print("🐕 سلالات الكلاب:")
    print("-" * 40)
    
    dogs = Breed.objects.filter(pet_type='dogs').order_by('name')
    for i, dog in enumerate(dogs, 1):
        print(f"{i:2d}. {dog.name}")
        if dog.description:
            print(f"    {dog.description}")
        print()
    
    print(f"📊 إجمالي سلالات الكلاب: {dogs.count()}")
    print()

def show_breeds_by_category():
    """عرض السلالات مصنفة حسب الفئة"""
    print("🏷️ تصنيف السلالات:")
    print("-" * 40)
    
    # سلالات صغيرة
    small_dogs = [
        'تشيواوا', 'بوميرانيان', 'يوركشاير تيرير', 'شيه تزو',
        'بولدوغ فرنسي', 'بيجل', 'باسنجي', 'باسيت هوند',
        'سكوتش تيرير', 'فوكس تيرير', 'كورجي', 'ويستي',
        'ويست هايلاند وايت تيرير'
    ]
    
    # سلالات متوسطة
    medium_dogs = [
        'جولدن ريتريفر', 'لابرادور ريتريفر', 'جيرمن شيبرد',
        'هاسكي سيبيري', 'أوستراليان شيبرد', 'كولي',
        'كاوالير كينج تشارلز سبانييل', 'بوكسر', 'دالماشن',
        'أوستراليان كاتل دوغ', 'مالينوي', 'مسترد إيرلندي'
    ]
    
    # سلالات كبيرة
    large_dogs = [
        'أكيتا', 'ألاسكان مالاموت', 'أمريكان بيتبول تيرير',
        'أمريكان ستافوردشاير تيرير', 'دوبرمان', 'روت وايلر',
        'سانت برنارد', 'بيرنيز ماونتن دوغ', 'نيوفاوندلاند',
        'نابوليتان ماستيف', 'هوندا'
    ]
    
    print("🐕 الكلاب الصغيرة (مناسبة للشقق):")
    for dog in small_dogs:
        if Breed.objects.filter(name=dog, pet_type='dogs').exists():
            print(f"  ✓ {dog}")
    
    print("\n🐕 الكلاب المتوسطة (مناسبة للعائلات):")
    for dog in medium_dogs:
        if Breed.objects.filter(name=dog, pet_type='dogs').exists():
            print(f"  ✓ {dog}")
    
    print("\n🐕 الكلاب الكبيرة (مناسبة للمساحات الواسعة):")
    for dog in large_dogs:
        if Breed.objects.filter(name=dog, pet_type='dogs').exists():
            print(f"  ✓ {dog}")

def main():
    """الدالة الرئيسية"""
    print("🚀 عرض الملخص النهائي لجميع السلالات...")
    print()
    
    # عرض الملخص الشامل
    show_comprehensive_summary()
    
    # عرض سلالات القطط
    show_cat_breeds_summary()
    
    # عرض سلالات الكلاب
    show_dog_breeds_summary()
    
    # عرض التصنيف
    show_breeds_by_category()
    
    print("\n🎉 تم الانتهاء من عرض الملخص الشامل!")
    print("\n💡 الآن يمكن للمستخدمين اختيار من بين:")
    print(f"  - {Breed.objects.filter(pet_type='cats').count()} سلالة قطط")
    print(f"  - {Breed.objects.filter(pet_type='dogs').count()} سلالة كلاب")

if __name__ == '__main__':
    main() 