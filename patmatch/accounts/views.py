from django.shortcuts import render
from django.contrib.auth import authenticate
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authtoken.models import Token
from .serializers import UserProfileSerializer, UserSerializer, CustomRegisterSerializer
from .models import User, PhoneOTP
import requests
import logging

logger = logging.getLogger(__name__)

# Create your views here.

class UserProfileView(generics.RetrieveUpdateAPIView):
    """عرض وتحديث الملف الشخصي"""
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        return self.request.user

@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """تسجيل الدخول"""
    email = request.data.get('email')
    password = request.data.get('password')
    
    if not email or not password:
        return Response(
            {'error': 'البريد الإلكتروني وكلمة المرور مطلوبان'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    user = authenticate(username=email, password=password)
    if user:
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'key': token.key,
            'user': UserSerializer(user).data
        })
    
    return Response(
        {'error': 'بيانات تسجيل الدخول غير صحيحة'}, 
        status=status.HTTP_400_BAD_REQUEST
    )

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """تسجيل مستخدم جديد"""
    serializer = CustomRegisterSerializer(data=request.data)
    
    if serializer.is_valid():
        try:
            user = serializer.save()
            
            # إنشاء token للمستخدم الجديد
            token, created = Token.objects.get_or_create(user=user)
            
            return Response({
                'key': token.key,
                'user': UserSerializer(user).data,
                'message': 'تم إنشاء الحساب بنجاح'
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            return Response(
                {'error': 'حدث خطأ في إنشاء الحساب'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """إنشاء حساب جديد"""
    email = request.data.get('email')
    password = request.data.get('password1')
    password2 = request.data.get('password2')
    first_name = request.data.get('first_name')
    last_name = request.data.get('last_name')
    
    if not all([email, password, password2, first_name, last_name]):
        return Response(
            {'error': 'جميع الحقول مطلوبة'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if password != password2:
        return Response(
            {'error': 'كلمات المرور غير متطابقة'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if User.objects.filter(email=email).exists():
        return Response(
            {'error': 'المستخدم موجود بالفعل'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name
    )
    
    token, created = Token.objects.get_or_create(user=user)
    return Response({
        'key': token.key,
        'user': UserSerializer(user).data
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """تسجيل الخروج"""
    try:
        request.user.auth_token.delete()
        return Response({'message': 'تم تسجيل الخروج بنجاح'})
    except:
        return Response({'error': 'خطأ في تسجيل الخروج'}, 
                       status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_phone_otp(request):
    """إرسال كود التحقق للهاتف"""
    phone_number = request.data.get('phone_number')
    
    if not phone_number:
        return Response(
            {'error': 'رقم الهاتف مطلوب'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # تنسيق رقم الهاتف المصري (إضافة +20 إذا لم يكن موجود)
    if not phone_number.startswith('+'):
        # أرقام الموبايل المصرية تبدأ بـ 01 (010, 011, 012, 015)
        if phone_number.startswith('01'):
            phone_number = '+20' + phone_number[1:]  # +2010xxxxxxx, +2011xxxxxxx, etc.
        elif phone_number.startswith('1') and len(phone_number) == 10:
            phone_number = '+20' + phone_number  # +201xxxxxxxxx
        else:
            return Response(
                {'error': 'تنسيق رقم الهاتف غير صحيح. يجب أن يبدأ بـ 010, 011, 012, أو 015'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # التحقق من صحة الرقم المصري
    if not phone_number.startswith('+201'):
        return Response(
            {'error': 'رقم الهاتف يجب أن يكون مصري (يبدأ بـ +201)'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # التحقق من طول الرقم (يجب أن يكون 13 رقم: +20 + 10 أرقام)
    if len(phone_number) != 13:
        return Response(
            {'error': 'رقم الهاتف غير صحيح'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # إنشاء كود OTP
        otp = PhoneOTP.generate_otp(request.user, phone_number)
        
        # إرسال الرسالة (للتطوير: طباعة الكود في الكونسول)
        print(f"📱 OTP for {phone_number}: {otp.otp_code}")
        logger.info(f"OTP generated for user {request.user.email}, phone {phone_number}: {otp.otp_code}")
        
        # في الإنتاج، ستستخدم Firebase Auth هنا
        # send_firebase_sms(phone_number, otp.otp_code)
        
        return Response({
            'message': 'تم إرسال كود التحقق بنجاح',
            'expires_in': 300  # 5 دقائق
        })
        
    except Exception as e:
        logger.error(f"Error sending OTP: {str(e)}")
        return Response(
            {'error': 'خطأ في إرسال كود التحقق'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_phone_otp(request):
    """التحقق من كود OTP"""
    phone_number = request.data.get('phone_number')
    otp_code = request.data.get('otp_code')
    
    if not phone_number or not otp_code:
        return Response(
            {'error': 'رقم الهاتف وكود التحقق مطلوبان'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # تنسيق رقم الهاتف المصري
    if not phone_number.startswith('+'):
        if phone_number.startswith('01'):
            phone_number = '+20' + phone_number[1:]
        elif phone_number.startswith('1') and len(phone_number) == 10:
            phone_number = '+20' + phone_number
    
    try:
        # البحث عن كود OTP صالح
        otp = PhoneOTP.objects.filter(
            user=request.user,
            phone_number=phone_number,
            otp_code=otp_code,
            is_used=False
        ).first()
        
        if not otp:
            return Response(
                {'error': 'كود التحقق غير صحيح'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if otp.is_expired():
            return Response(
                {'error': 'كود التحقق منتهي الصلاحية'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # تأكيد الكود
        otp.is_used = True
        otp.save()
        
        # تحديث المستخدم
        request.user.phone = phone_number
        request.user.is_phone_verified = True
        request.user.save()
        
        return Response({
            'message': 'تم التحقق من رقم الهاتف بنجاح',
            'user': UserSerializer(request.user).data
        })
        
    except Exception as e:
        logger.error(f"Error verifying OTP: {str(e)}")
        return Response(
            {'error': 'خطأ في التحقق من الكود'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_firebase_phone(request):
    """التحقق من رقم الهاتف عبر Firebase"""
    phone_number = request.data.get('phone_number')
    
    if not phone_number:
        return Response(
            {'error': 'رقم الهاتف مطلوب'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # تنسيق رقم الهاتف المصري
    if not phone_number.startswith('+'):
        if phone_number.startswith('01'):
            phone_number = '+20' + phone_number[1:]
        elif phone_number.startswith('1') and len(phone_number) == 10:
            phone_number = '+20' + phone_number
    
    try:
        # تحديث المستخدم مباشرة (Firebase تحقق من الكود في Frontend)
        request.user.phone = phone_number
        request.user.is_phone_verified = True
        request.user.save()
        
        print(f"✅ Firebase phone verification successful for {request.user.email}: {phone_number}")
        
        return Response({
            'message': 'تم التحقق من رقم الهاتف بنجاح عبر Firebase',
            'user': UserSerializer(request.user).data
        })
        
    except Exception as e:
        logger.error(f"Error updating phone verification: {str(e)}")
        return Response(
            {'error': 'خطأ في حفظ معلومات التحقق'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def send_firebase_sms(phone_number, otp_code):
    """إرسال رسالة SMS عبر Firebase (للاستخدام في الإنتاج)"""
    # للتطوير: طباعة الكود
    print(f"🔥 Firebase SMS to {phone_number}: كود التحقق الخاص بك هو: {otp_code}")
    
    # للإنتاج: استخدم Firebase Admin SDK
    try:
        # import firebase_admin
        # from firebase_admin import auth
        
        # يمكن استخدام Firebase Phone Auth API
        # أو دمج مع خدمات SMS أخرى مجانية:
        
        # 1. Firebase Authentication (10,000 مجاناً/شهر)
        # 2. Twilio Trial ($15.50 رصيد مجاني)
        # 3. AWS SNS (100 رسالة مجانية/شهر)
        # 4. MessageBird (رصيد تجريبي)
        
        # مثال للإنتاج:
        # message = f"كود التحقق الخاص بك: {otp_code}"
        # send_actual_sms(phone_number, message)
        
        return True
    except Exception as e:
        logger.error(f"Firebase SMS error: {e}")
        return False


def send_sms(phone_number, message):
    """دالة مهجورة - استخدم send_firebase_sms"""
    return send_firebase_sms(phone_number, message.split(': ')[-1])
