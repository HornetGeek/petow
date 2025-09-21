#!/usr/bin/env python3
"""
سكريبت لتنظيف وتنظيم السلالات الموجودة
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed

def cleanup_breeds():
    """تنظيف وتنظيم السلالات"""
    print("🧹 بدء تنظيف السلالات...")
    
    # حذف السلالات الخاطئة
    wrong_breeds = [
        'كلب جولدن ريتريفر',
        'كلب لابرادور', 
        'كلب جيرمان شيبرد',
        'كلب هاسكي سيبيري',
        'كلب بولدوغ فرنسي',
        'كناري',
        'حسون',
        'ببغاء',
        'عصفور دوري',
        'أرنب',
        'هامستر'
    ]
    
    for breed_name in wrong_breeds:
        try:
            breed = Breed.objects.get(name=breed_name)
            breed.delete()
            print(f"🗑️ تم حذف: {breed_name}")
        except Breed.DoesNotExist:
            print(f"ℹ️ غير موجود: {breed_name}")
    
    # تصحيح السلالات التي تحتاج إلى تعديل
    breed_corrections = {
        'قط شيرازي': {
            'name': 'قط شيرازي',
            'pet_type': 'cats',
            'description': 'قط طويل الشعر، هادئ وودود، مناسب للعائلات'
        },
        'قط بريطاني': {
            'name': 'قط بريطاني قصير الشعر',
            'pet_type': 'cats',
            'description': 'قط مستدير الوجه، هادئ ومستقل'
        },
        'قط مين كون': {
            'name': 'قط ماين كون',
            'pet_type': 'cats',
            'description': 'قط كبير الحجم، ودود ومخلص للعائلة'
        },
        'قط بالينيزي': {
            'name': 'قط بالينيزي',
            'pet_type': 'cats',
            'description': 'قط طويل الشعر، ذكي ونشط'
        }
    }
    
    print("\n🔧 تصحيح السلالات...")
    for old_name, new_data in breed_corrections.items():
        try:
            breed = Breed.objects.get(name=old_name)
            
            # التحقق من عدم وجود سلالة بنفس الاسم
            existing_breed = Breed.objects.filter(
                name=new_data['name'],
                pet_type=new_data['pet_type']
            ).exclude(id=breed.id).first()
            
            if existing_breed:
                # إذا كانت السلالة موجودة، احذف القديمة
                print(f"⚠️ السلالة {new_data['name']} موجودة مسبقاً، حذف {old_name}")
                breed.delete()
            else:
                # تحديث السلالة
                breed.name = new_data['name']
                breed.pet_type = new_data['pet_type']
                breed.description = new_data['description']
                breed.save()
                print(f"✅ تم تصحيح: {old_name} → {new_data['name']}")
                
        except Breed.DoesNotExist:
            print(f"ℹ️ غير موجود: {old_name}")

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
    print("🚀 بدء تنظيف وتنظيم السلالات...")
    
    # تنظيف السلالات
    cleanup_breeds()
    
    # عرض السلالات النهائية
    show_final_breeds()
    
    print("\n🎉 تم الانتهاء من تنظيف السلالات!")

if __name__ == '__main__':
    main() 