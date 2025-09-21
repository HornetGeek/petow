#!/usr/bin/env python3
"""
سكريبت نهائي لإزالة التكرار في السلالات
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed

def remove_duplicates():
    """إزالة السلالات المكررة"""
    print("🧹 إزالة السلالات المكررة...")
    
    # البحث عن السلالات المكررة
    all_breeds = Breed.objects.all()
    seen_names = set()
    duplicates = []
    
    for breed in all_breeds:
        key = (breed.name, breed.pet_type)
        if key in seen_names:
            duplicates.append(breed)
        else:
            seen_names.add(key)
    
    if duplicates:
        print(f"🔍 تم العثور على {len(duplicates)} سلالة مكررة:")
        for breed in duplicates:
            print(f"  - {breed.name} ({breed.pet_type})")
            breed.delete()
            print(f"    ✅ تم حذفها")
    else:
        print("✅ لا توجد سلالات مكررة")

def show_final_breeds():
    """عرض السلالات النهائية"""
    print("\n📋 السلالات النهائية:")
    
    cats = Breed.objects.filter(pet_type='cats').order_by('name')
    dogs = Breed.objects.filter(pet_type='dogs').order_by('name')
    
    print(f"\n🐱 القطط ({cats.count()} سلالة):")
    for cat in cats:
        print(f"  - {cat.name}")
    
    print(f"\n🐕 الكلاب ({dogs.count()} سلالة):")
    for dog in dogs:
        print(f"  - {dog.name}")

def main():
    """الدالة الرئيسية"""
    print("🚀 بدء التنظيف النهائي للسلالات...")
    
    # إزالة التكرار
    remove_duplicates()
    
    # عرض السلالات النهائية
    show_final_breeds()
    
    print("\n🎉 تم الانتهاء من التنظيف النهائي!")

if __name__ == '__main__':
    main() 