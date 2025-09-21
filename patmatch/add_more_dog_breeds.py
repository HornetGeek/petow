#!/usr/bin/env python3
"""
سكريبت لإضافة المزيد من سلالات الكلاب
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed

def add_more_dog_breeds():
    """إضافة المزيد من سلالات الكلاب"""
    additional_dog_breeds = [
        {
            'name': 'أكيتا',
            'pet_type': 'dogs',
            'description': 'كلب ياباني كبير وهادئ، مخلص ومحترم، ممتاز مع العائلات'
        },
        {
            'name': 'ألاسكان مالاموت',
            'pet_type': 'dogs',
            'description': 'كلب قوي ونشط، مناسب للعمل والرياضة، يحتاج تمرين يومي'
        },
        {
            'name': 'أمريكان بيتبول تيرير',
            'pet_type': 'dogs',
            'description': 'كلب قوي وذكي، مخلص للعائلة، يحتاج تدريب وتنشئة اجتماعية'
        },
        {
            'name': 'أمريكان ستافوردشاير تيرير',
            'pet_type': 'dogs',
            'description': 'كلب قوي وذكي، مخلص ومحب للعائلة، يحتاج تدريب'
        },
        {
            'name': 'أوستراليان كاتل دوغ',
            'pet_type': 'dogs',
            'description': 'كلب ذكي ونشط، ممتاز للعمل مع الماشية، يحتاج تمرين'
        },
        {
            'name': 'أوستراليان شيبرد',
            'pet_type': 'dogs',
            'description': 'كلب ذكي ونشط، ممتاز للعمل والرياضة، يحتاج تمرين يومي'
        },
        {
            'name': 'باسنجي',
            'pet_type': 'dogs',
            'description': 'كلب أفريقي صغير ونظيف، لا ينبح، مناسب للشقق'
        },
        {
            'name': 'باسيت هوند',
            'pet_type': 'dogs',
            'description': 'كلب صغير وهادئ، ممتاز مع الأطفال، مناسب للعائلات'
        },
        {
            'name': 'بوكسر',
            'pet_type': 'dogs',
            'description': 'كلب قوي ونشط، مخلص ومحب للعائلة، ممتاز مع الأطفال'
        },
        {
            'name': 'تشاو تشاو',
            'pet_type': 'dogs',
            'description': 'كلب صيني مستقل وهادئ، مخلص للعائلة، مناسب للشقق'
        },
        {
            'name': 'تشيواوا',
            'pet_type': 'dogs',
            'description': 'أصغر سلالة كلاب في العالم، نشط ومخلص، مناسب للشقق'
        },
        {
            'name': 'داتشوند',
            'pet_type': 'dogs',
            'description': 'كلب ألماني طويل الجسم، نشط وذكي، ممتاز للصيد'
        },
        {
            'name': 'دالماشن',
            'pet_type': 'dogs',
            'description': 'كلب أبيض ببقع سوداء، نشط ومخلص، ممتاز مع العائلات'
        },
        {
            'name': 'سامويد',
            'pet_type': 'dogs',
            'description': 'كلب أبيض جميل، ودود ومخلص، ممتاز مع الأطفال'
        },
        {
            'name': 'سكوتش تيرير',
            'pet_type': 'dogs',
            'description': 'كلب اسكتلندي صغير وذكي، نشط ومخلص، مناسب للعائلات'
        },
        {
            'name': 'فوكس تيرير',
            'pet_type': 'dogs',
            'description': 'كلب بريطاني صغير ونشط، ذكي ومخلص، ممتاز للصيد'
        },
        {
            'name': 'كورجي',
            'pet_type': 'dogs',
            'description': 'كلب ويلزي صغير وذكي، نشط ومخلص، ممتاز مع الأطفال'
        },
        {
            'name': 'لابرادودل',
            'pet_type': 'dogs',
            'description': 'خليط من لابرادور وبودل، ذكي ونظيف، مناسب للحساسية'
        },
        {
            'name': 'مالينوي',
            'pet_type': 'dogs',
            'description': 'كلب بلجيكي ذكي ونشط، ممتاز للعمل والحراسة'
        },
        {
            'name': 'مسترد إيرلندي',
            'pet_type': 'dogs',
            'description': 'كلب أيرلندي طويل الشعر، ذكي ومخلص، ممتاز للصيد'
        },
        {
            'name': 'نابوليتان ماستيف',
            'pet_type': 'dogs',
            'description': 'كلب إيطالي كبير وقوي، مخلص ومحمي، ممتاز للحراسة'
        },
        {
            'name': 'هوندا',
            'pet_type': 'dogs',
            'description': 'كلب أفغاني طويل الشعر، أنيق ومستقل، مناسب للعائلات'
        },
        {
            'name': 'ويست هايلاند وايت تيرير',
            'pet_type': 'dogs',
            'description': 'كلب اسكتلندي أبيض صغير، نشط وذكي، مناسب للعائلات'
        },
        {
            'name': 'ويستي',
            'pet_type': 'dogs',
            'description': 'كلب اسكتلندي أبيض صغير، نشط ومخلص، ممتاز مع الأطفال'
        }
    ]
    
    print("🐕 إضافة المزيد من سلالات الكلاب...")
    added_count = 0
    existing_count = 0
    
    for breed_data in additional_dog_breeds:
        breed, created = Breed.objects.get_or_create(
            name=breed_data['name'],
            pet_type=breed_data['pet_type'],
            defaults={'description': breed_data['description']}
        )
        if created:
            print(f"✅ تم إضافة: {breed.name}")
            added_count += 1
        else:
            print(f"ℹ️ موجود مسبقاً: {breed.name}")
            existing_count += 1
    
    print(f"\n📊 ملخص الإضافة:")
    print(f"  - تم إضافة: {added_count} سلالة جديدة")
    print(f"  - موجودة مسبقاً: {existing_count} سلالة")

def show_all_dog_breeds():
    """عرض جميع سلالات الكلاب"""
    print("\n🐕 جميع سلالات الكلاب:")
    print("-" * 40)
    
    dogs = Breed.objects.filter(pet_type='dogs').order_by('name')
    for i, dog in enumerate(dogs, 1):
        print(f"{i:2d}. {dog.name}")
        if dog.description:
            print(f"    {dog.description}")
        print()
    
    print(f"📊 إجمالي سلالات الكلاب: {dogs.count()}")

def main():
    """الدالة الرئيسية"""
    print("🚀 بدء إضافة المزيد من سلالات الكلاب...")
    
    # إضافة سلالات جديدة
    add_more_dog_breeds()
    
    # عرض جميع سلالات الكلاب
    show_all_dog_breeds()
    
    print("\n🎉 تم الانتهاء من إضافة سلالات الكلاب!")

if __name__ == '__main__':
    main() 