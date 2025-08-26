#!/usr/bin/env python
"""
Script to populate the database with initial data
"""
import os
import django
from django.conf import settings

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed, VeterinaryClinic

def create_breeds():
    """إنشاء السلالات الأساسية"""
    breeds_data = [
        # سلالات القطط
        {'name': 'قط شيرازي', 'description': 'قطط ذات شعر طويل وجميل'},
        {'name': 'قط سيامي', 'description': 'قطط نشطة وذكية'},
        {'name': 'قط بريطاني', 'description': 'قطط هادئة ومحبة'},
        {'name': 'قط مين كون', 'description': 'قطط كبيرة الحجم ولطيفة'},
        {'name': 'قط بالينيزي', 'description': 'قطط أنيقة وجميلة'},
        
        # سلالات الكلاب
        {'name': 'كلب جولدن ريتريفر', 'description': 'كلاب ودودة ومحبة للعائلة'},
        {'name': 'كلب لابرادور', 'description': 'كلاب نشطة ومطيعة'},
        {'name': 'كلب جيرمان شيبرد', 'description': 'كلاب حراسة ذكية'},
        {'name': 'كلب هاسكي سيبيري', 'description': 'كلاب قوية ونشطة'},
        {'name': 'كلب بولدوغ فرنسي', 'description': 'كلاب صغيرة ومحبة'},
        
        # طيور
        {'name': 'كناري', 'description': 'طيور مغردة جميلة'},
        {'name': 'حسون', 'description': 'طيور ملونة ونشطة'},
        {'name': 'ببغاء', 'description': 'طيور ذكية ومتكلمة'},
        {'name': 'عصفور دوري', 'description': 'طيور صغيرة ونشطة'},
        
        # أخرى
        {'name': 'أرنب', 'description': 'حيوانات أليفة لطيفة'},
        {'name': 'هامستر', 'description': 'حيوانات صغيرة ومحبة'},
    ]
    
    for breed_data in breeds_data:
        breed, created = Breed.objects.get_or_create(
            name=breed_data['name'],
            defaults={'description': breed_data['description']}
        )
        if created:
            print(f"✅ تم إنشاء السلالة: {breed.name}")
        else:
            print(f"📋 السلالة موجودة: {breed.name}")

def create_veterinary_clinics():
    """إنشاء العيادات البيطرية"""
    clinics_data = [
        {
            'name': 'مركز القاهرة البيطري',
            'code': 'cairo_vet_center',
            'address': 'شارع العروبة، مدينة نصر، القاهرة',
            'city': 'القاهرة',
            'phone': '02-24010011',
            'email': 'info@cairovet.com',
            'working_hours': 'السبت - الخميس: 9:00 ص - 9:00 م',
        },
        {
            'name': 'مستشفى الإسكندرية للحيوانات',
            'code': 'alexandria_animal_hospital',
            'address': 'طريق الحرية، سموحة، الإسكندرية',
            'city': 'الإسكندرية',
            'phone': '03-4280011',
            'email': 'contact@alexvet.com',
            'working_hours': 'يومياً: 8:00 ص - 10:00 م',
        },
        {
            'name': 'عيادة الرياض للحيوانات الأليفة',
            'code': 'riyadh_pet_clinic',
            'address': 'شارع الملك فهد، العليا، الرياض',
            'city': 'الرياض',
            'phone': '011-4620011',
            'email': 'info@riyadhpets.sa',
            'working_hours': 'السبت - الخميس: 8:00 ص - 8:00 م',
        },
        {
            'name': 'العيادة البيطرية بجدة',
            'code': 'jeddah_veterinary',
            'address': 'شارع الأمير سلطان، الروضة، جدة',
            'city': 'جدة',
            'phone': '012-6630011',
            'email': 'care@jeddahvet.sa',
            'working_hours': 'السبت - الخميس: 9:00 ص - 9:00 م',
        },
        {
            'name': 'مركز الدمام لرعاية الحيوانات',
            'code': 'dammam_animal_care',
            'address': 'شارع الملك عبدالعزيز، الفيصلية، الدمام',
            'city': 'الدمام',
            'phone': '013-8320011',
            'email': 'support@dammamanimalcare.sa',
            'working_hours': 'السبت - الخميس: 7:00 ص - 7:00 م',
        },
        {
            'name': 'عيادة المنصورة البيطرية',
            'code': 'mansoura_vet_clinic',
            'address': 'شارع الجمهورية، وسط البلد، المنصورة',
            'city': 'المنصورة',
            'phone': '050-2340011',
            'email': 'info@mansourapet.com',
            'working_hours': 'السبت - الخميس: 9:00 ص - 8:00 م',
        },
        {
            'name': 'مستشفى الزقازيق للحيوانات',
            'code': 'zagazig_animal_hospital',
            'address': 'شارع الجامعة، الزقازيق',
            'city': 'الزقازيق',
            'phone': '055-2310011',
            'email': 'contact@zagazigvet.com',
            'working_hours': 'السبت - الخميس: 8:00 ص - 6:00 م',
        },
        {
            'name': 'مركز أسوان للحيوانات الأليفة',
            'code': 'aswan_pet_center',
            'address': 'شارع الكورنيش، أسوان',
            'city': 'أسوان',
            'phone': '097-2400011',
            'email': 'info@aswanpets.com',
            'working_hours': 'السبت - الخميس: 8:00 ص - 7:00 م',
        },
        {
            'name': 'العيادة البيطرية الحديثة',
            'code': 'luxor_veterinary',
            'address': 'شارع التليفزيون، الأقصر',
            'city': 'الأقصر',
            'phone': '095-2370011',
            'email': 'care@luxorvet.com',
            'working_hours': 'السبت - الخميس: 9:00 ص - 7:00 م',
        },
        {
            'name': 'عيادة الغردقة للحيوانات',
            'code': 'hurghada_animal_clinic',
            'address': 'شارع شيراتون، السقالة، الغردقة',
            'city': 'الغردقة',
            'phone': '065-3440011',
            'email': 'info@hurghadavet.com',
            'working_hours': 'يومياً: 9:00 ص - 9:00 م',
        },
    ]
    
    for clinic_data in clinics_data:
        clinic, created = VeterinaryClinic.objects.get_or_create(
            code=clinic_data['code'],
            defaults=clinic_data
        )
        if created:
            print(f"🏥 تم إنشاء العيادة: {clinic.name}")
        else:
            print(f"📋 العيادة موجودة: {clinic.name}")

def main():
    """تشغيل جميع المهام"""
    print("🚀 بدء إضافة البيانات الأساسية...")
    
    print("\n📚 إنشاء السلالات...")
    create_breeds()
    
    print("\n🏥 إنشاء العيادات البيطرية...")
    create_veterinary_clinics()
    
    print("\n✅ تم الانتهاء من إضافة البيانات الأساسية!")
    print(f"📊 إجمالي السلالات: {Breed.objects.count()}")
    print(f"🏥 إجمالي العيادات: {VeterinaryClinic.objects.count()}")

if __name__ == '__main__':
    main() 