#!/usr/bin/env python3
import os
import sys
import django

# Add the project directory to Python path
sys.path.append('/media/hornet/84ACF2FAACF2E5981/petWebsite/patmatch')

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.models import Breed, Pet
from accounts.models import User

# Create sample breeds
breeds_data = [
    {'name': 'قط شيرازي', 'description': 'قطط فارسية جميلة وهادئة'},
    {'name': 'قط مصري ماو', 'description': 'قطط مصرية أصيلة'},
    {'name': 'كلب جولدن ريتريفر', 'description': 'كلاب ودودة ومدربة'},
    {'name': 'كلب هاسكي', 'description': 'كلاب قوية ونشطة'},
    {'name': 'ببغاء أفريقي', 'description': 'طيور ذكية ومتكلمة'},
    {'name': 'كناري', 'description': 'طيور صغيرة وجميلة'},
]

print("Creating breeds...")
for breed_data in breeds_data:
    breed, created = Breed.objects.get_or_create(
        name=breed_data['name'],
        defaults={'description': breed_data['description']}
    )
    if created:
        print(f"✓ Created breed: {breed.name}")
    else:
        print(f"- Breed already exists: {breed.name}")

# Create sample user
user, created = User.objects.get_or_create(
    email='test@example.com',
    defaults={
        'username': 'test@example.com',
        'first_name': 'أحمد',
        'last_name': 'محمد',
        'phone': '0501234567',
        'address': 'الرياض، المملكة العربية السعودية'
    }
)
if created:
    user.set_password('testpass123')
    user.save()
    print(f"✓ Created user: {user.email}")
else:
    print(f"- User already exists: {user.email}")

# Create sample pets
pets_data = [
    {
        'name': 'مونا',
        'pet_type': 'cats',
        'breed_name': 'قط شيرازي',
        'age_months': 24,
        'gender': 'F',
        'weight': 3.5,
        'description': 'مونا قطة جميلة وهادئة المزاج، تحب اللعب والتفاعل مع البشر. تم تطعيمها بالكامل وهي في صحة ممتازة.',
        'location': 'الرياض',
        'is_free': True,
        'image_url': 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=400&q=80',
    },
    {
        'name': 'ماكس',
        'pet_type': 'dogs',
        'breed_name': 'كلب جولدن ريتريفر',
        'age_months': 36,
        'gender': 'M',
        'weight': 25.0,
        'description': 'ماكس كلب نشيط ومحب للعب، يبحث عن شريكة من نفس السلالة. مدرب ومطيع جداً.',
        'location': 'جدة',
        'breeding_fee': 500.00,
        'is_trained': True,
        'image_url': 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80',
    },
    {
        'name': 'كوكو',
        'pet_type': 'birds',
        'breed_name': 'ببغاء أفريقي',
        'age_months': 12,
        'gender': 'M',
        'weight': 0.5,
        'description': 'كوكو ببغاء ذكي ومتكلم، يحب التفاعل مع البشر. يعرف كلمات كثيرة ويحب الغناء.',
        'location': 'الدمام',
        'breeding_fee': 1200.00,
        'image_url': 'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?auto=format&fit=crop&w=400&q=80',
    }
]

print("\nCreating pets...")
for pet_data in pets_data:
    try:
        breed = Breed.objects.get(name=pet_data['breed_name'])
        
        pet, created = Pet.objects.get_or_create(
            name=pet_data['name'],
            owner=user,
            defaults={
                'pet_type': pet_data['pet_type'],
                'breed': breed,
                'age_months': pet_data['age_months'],
                'gender': pet_data['gender'],
                'weight': pet_data['weight'],
                'description': pet_data['description'],
                'location': pet_data['location'],
                'breeding_fee': pet_data.get('breeding_fee'),
                'is_free': pet_data.get('is_free', False),
                'is_trained': pet_data.get('is_trained', False),
                'main_image': pet_data.get('image_url', ''),
            }
        )
        
        if created:
            print(f"✓ Created pet: {pet.name}")
        else:
            print(f"- Pet already exists: {pet.name}")
            
    except Breed.DoesNotExist:
        print(f"✗ Breed not found: {pet_data['breed_name']}")

print(f"\n🎉 Sample data creation completed!")
print(f"📊 Total breeds: {Breed.objects.count()}")
print(f"🐾 Total pets: {Pet.objects.count()}")
print(f"👥 Total users: {User.objects.count()}")
print(f"\n📝 Test user credentials:")
print(f"   Email: test@example.com")
print(f"   Password: testpass123") 