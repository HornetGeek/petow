#!/usr/bin/env python3
"""
سكريبت لعرض السلالات بشكل منظم
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed

def show_breeds_summary():
    """عرض ملخص السلالات"""
    print("🐾 ملخص السلالات في قاعدة البيانات")
    print("=" * 50)
    
    total_breeds = Breed.objects.count()
    cats_count = Breed.objects.filter(pet_type='cats').count()
    dogs_count = Breed.objects.filter(pet_type='dogs').count()
    
    print(f"📊 إجمالي السلالات: {total_breeds}")
    print(f"🐱 سلالات القطط: {cats_count}")
    print(f"🐕 سلالات الكلاب: {dogs_count}")
    print()

def show_cat_breeds():
    """عرض سلالات القطط"""
    print("🐱 سلالات القطط:")
    print("-" * 30)
    
    cats = Breed.objects.filter(pet_type='cats').order_by('name')
    for i, cat in enumerate(cats, 1):
        print(f"{i:2d}. {cat.name}")
        if cat.description:
            print(f"    {cat.description}")
        print()

def show_dog_breeds():
    """عرض سلالات الكلاب"""
    print("🐕 سلالات الكلاب:")
    print("-" * 30)
    
    dogs = Breed.objects.filter(pet_type='dogs').order_by('name')
    for i, dog in enumerate(dogs, 1):
        print(f"{i:2d}. {dog.name}")
        if dog.description:
            print(f"    {dog.description}")
        print()

def main():
    """الدالة الرئيسية"""
    show_breeds_summary()
    show_cat_breeds()
    show_dog_breeds()
    
    print("🎉 تم الانتهاء من عرض السلالات!")

if __name__ == '__main__':
    main() 