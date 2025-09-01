#!/usr/bin/env python3
"""
سكريبت للتحقق من المستخدمين وإنشاء superuser
"""
import os
import sys
import django

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import User

User = get_user_model()

def check_users():
    """التحقق من المستخدمين الموجودين"""
    print("👥 فحص المستخدمين في النظام")
    print("=" * 50)
    
    # التحقق من المستخدمين العاديين
    users = User.objects.all()
    print(f"📊 إجمالي عدد المستخدمين: {users.count()}")
    
    if users.count() == 0:
        print("❌ لا يوجد مستخدمين في النظام")
        return False
    
    print("\n📋 قائمة المستخدمين:")
    for i, user in enumerate(users, 1):
        is_superuser = "✅" if user.is_superuser else "❌"
        is_staff = "✅" if user.is_staff else "❌"
        is_active = "✅" if user.is_active else "❌"
        
        print(f"  {i}. {user.username} ({user.email})")
        print(f"     - Superuser: {is_superuser}")
        print(f"     - Staff: {is_staff}")
        print(f"     - Active: {is_active}")
        print(f"     - Last Login: {user.last_login}")
        print()
    
    # البحث عن superusers
    superusers = User.objects.filter(is_superuser=True)
    print(f"👑 عدد Superusers: {superusers.count()}")
    
    if superusers.count() == 0:
        print("⚠️  لا يوجد superuser في النظام!")
        return False
    
    return True

def create_superuser(username, email, password):
    """إنشاء superuser جديد"""
    try:
        if User.objects.filter(username=username).exists():
            print(f"❌ المستخدم {username} موجود بالفعل")
            return False
        
        if User.objects.filter(email=email).exists():
            print(f"❌ البريد الإلكتروني {email} مستخدم بالفعل")
            return False
        
        # إنشاء المستخدم
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password
        )
        
        # تعيينه كـ superuser
        user.is_superuser = True
        user.is_staff = True
        user.is_active = True
        user.save()
        
        print(f"✅ تم إنشاء superuser {username} بنجاح")
        print(f"   Username: {username}")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        return True
        
    except Exception as e:
        print(f"❌ حدث خطأ أثناء إنشاء superuser: {e}")
        return False

def reset_superuser_password(username, new_password):
    """إعادة تعيين كلمة مرور superuser"""
    try:
        user = User.objects.filter(username=username, is_superuser=True).first()
        
        if not user:
            print(f"❌ لم يتم العثور على superuser باسم {username}")
            return False
        
        # تحديث كلمة المرور
        user.set_password(new_password)
        user.save()
        
        print(f"✅ تم تحديث كلمة مرور {username} بنجاح")
        print(f"   Username: {username}")
        print(f"   New Password: {new_password}")
        return True
        
    except Exception as e:
        print(f"❌ حدث خطأ أثناء تحديث كلمة المرور: {e}")
        return False

def main():
    """الدالة الرئيسية"""
    print("🔐 إدارة المستخدمين")
    print("=" * 50)
    
    # فحص المستخدمين
    has_superuser = check_users()
    
    while True:
        print("\nاختر العملية:")
        print("1. فحص المستخدمين")
        print("2. إنشاء superuser جديد")
        print("3. إعادة تعيين كلمة مرور superuser")
        print("4. خروج")
        
        choice = input("\nاختر رقم العملية: ").strip()
        
        if choice == '1':
            check_users()
        
        elif choice == '2':
            if not has_superuser:
                print("\n⚠️  لا يوجد superuser في النظام - إنشاء واحد جديد:")
                username = input("Username: ").strip()
                email = input("Email: ").strip()
                password = input("Password: ").strip()
                
                if username and email and password:
                    if create_superuser(username, email, password):
                        has_superuser = True
                else:
                    print("❌ يجب ملء جميع الحقول")
            else:
                print("✅ يوجد superuser بالفعل في النظام")
        
        elif choice == '3':
            if has_superuser:
                username = input("أدخل username للـ superuser: ").strip()
                new_password = input("أدخل كلمة المرور الجديدة: ").strip()
                
                if username and new_password:
                    reset_superuser_password(username, new_password)
                else:
                    print("❌ يجب ملء جميع الحقول")
            else:
                print("❌ لا يوجد superuser في النظام")
        
        elif choice == '4':
            print("👋 شكراً لك!")
            break
        
        else:
            print("❌ اختيار غير صحيح، حاول مرة أخرى")

if __name__ == '__main__':
    main() 