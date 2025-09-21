#!/usr/bin/env python3
"""
سكريبت لحذف جميع القطط من قاعدة البيانات
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Pet
from django.db import transaction

def delete_all_cats():
    """حذف جميع القطط من قاعدة البيانات"""
    try:
        # البحث عن جميع القطط
        cats = Pet.objects.filter(pet_type='cats')
        cat_count = cats.count()
        
        if cat_count == 0:
            print("✅ لا توجد قطط في قاعدة البيانات")
            return
        
        print(f"🔍 تم العثور على {cat_count} قط في قاعدة البيانات")
        
        # عرض تفاصيل القطط قبل الحذف
        print("\n📋 تفاصيل القطط التي سيتم حذفها:")
        for i, cat in enumerate(cats, 1):
            print(f"  {i}. {cat.name} (ID: {cat.id}) - {cat.breed.name if cat.breed else 'بدون سلالة'}")
        
        # تأكيد الحذف
        confirm = input(f"\n⚠️  هل أنت متأكد من حذف جميع القطط ({cat_count} قط)؟ (اكتب 'نعم' للتأكيد): ")
        
        if confirm.strip() != 'نعم':
            print("❌ تم إلغاء العملية")
            return
        
        # حذف القطط
        with transaction.atomic():
            deleted_count = cats.delete()[0]
            print(f"✅ تم حذف {deleted_count} قط بنجاح")
        
        # التحقق من النتيجة
        remaining_cats = Pet.objects.filter(pet_type='cats').count()
        print(f"📊 عدد القطط المتبقية: {remaining_cats}")
        
    except Exception as e:
        print(f"❌ حدث خطأ أثناء حذف القطط: {e}")
        return False
    
    return True

def delete_cats_by_breed(breed_name):
    """حذف القطط حسب السلالة"""
    try:
        from pets.models import Breed
        
        # البحث عن السلالة
        breed = Breed.objects.filter(name__icontains=breed_name, pet_type='cats').first()
        
        if not breed:
            print(f"❌ لم يتم العثور على سلالة القطط: {breed_name}")
            return False
        
        # البحث عن القطط من هذه السلالة
        cats = Pet.objects.filter(breed=breed, pet_type='cats')
        cat_count = cats.count()
        
        if cat_count == 0:
            print(f"✅ لا توجد قطط من سلالة {breed.name}")
            return True
        
        print(f"🔍 تم العثور على {cat_count} قط من سلالة {breed.name}")
        
        # عرض تفاصيل القطط
        print("\n📋 تفاصيل القطط التي سيتم حذفها:")
        for i, cat in enumerate(cats, 1):
            print(f"  {i}. {cat.name} (ID: {cat.id})")
        
        # تأكيد الحذف
        confirm = input(f"\n⚠️  هل أنت متأكد من حذف جميع القطط من سلالة {breed.name}؟ (اكتب 'نعم' للتأكيد): ")
        
        if confirm.strip() != 'نعم':
            print("❌ تم إلغاء العملية")
            return False
        
        # حذف القطط
        with transaction.atomic():
            deleted_count = cats.delete()[0]
            print(f"✅ تم حذف {deleted_count} قط من سلالة {breed.name} بنجاح")
        
        return True
        
    except Exception as e:
        print(f"❌ حدث خطأ أثناء حذف القطط: {e}")
        return False

def show_cats_summary():
    """عرض ملخص القطط في قاعدة البيانات"""
    try:
        cats = Pet.objects.filter(pet_type='cats')
        cat_count = cats.count()
        
        print(f"\n📊 ملخص القطط في قاعدة البيانات:")
        print(f"  إجمالي عدد القطط: {cat_count}")
        
        if cat_count > 0:
            print("\n📋 قائمة القطط:")
            for i, cat in enumerate(cats, 1):
                breed_name = cat.breed.name if cat.breed else 'بدون سلالة'
                owner = cat.owner.username if cat.owner else 'غير محدد'
                print(f"  {i}. {cat.name} - {breed_name} - المالك: {owner}")
        
        return cat_count
        
    except Exception as e:
        print(f"❌ حدث خطأ أثناء عرض الملخص: {e}")
        return 0

def main():
    """الدالة الرئيسية"""
    print("🐱 سكريبت حذف القطط")
    print("=" * 50)
    
    while True:
        print("\nاختر العملية:")
        print("1. عرض ملخص القطط")
        print("2. حذف جميع القطط")
        print("3. حذف القطط حسب السلالة")
        print("4. خروج")
        
        choice = input("\nاختر رقم العملية: ").strip()
        
        if choice == '1':
            show_cats_summary()
        
        elif choice == '2':
            delete_all_cats()
        
        elif choice == '3':
            breed_name = input("أدخل اسم السلالة (أو جزء منها): ").strip()
            if breed_name:
                delete_cats_by_breed(breed_name)
            else:
                print("❌ يجب إدخال اسم السلالة")
        
        elif choice == '4':
            print("👋 شكراً لك!")
            break
        
        else:
            print("❌ اختيار غير صحيح، حاول مرة أخرى")

if __name__ == '__main__':
    main() 