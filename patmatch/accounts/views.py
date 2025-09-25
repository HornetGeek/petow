from django.shortcuts import render
from django.contrib.auth import authenticate
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authtoken.models import Token
from .serializers import UserProfileSerializer, UserSerializer, CustomRegisterSerializer
from .models import User, PhoneOTP, PasswordResetOTP
from .email_notifications import send_welcome_email, send_password_reset_email
from django.core.mail import send_mail
from django.conf import settings
import requests
import logging
import os

from .email_notifications import send_welcome_email

logger = logging.getLogger(__name__)

# Create your views here.

class UserProfileView(generics.RetrieveUpdateDestroyAPIView):
    """عرض وتحديث الملف الشخصي"""
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        return self.request.user

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        
        # Delete auth token if exists to invalidate sessions
        Token.objects.filter(user=user).delete()
        user.delete()
        return Response(
            {'message': 'تم حذف الحساب بنجاح'},
            status=status.HTTP_200_OK
        )

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
    
    try:
        send_welcome_email(user)
    except Exception as exc:
        logger.error("Failed to send welcome email to %s: %s", user.email, exc)
    
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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_notification_token(request):
    """تحديث FCM token للمستخدم"""
    fcm_token = request.data.get('fcm_token')
    
    if not fcm_token:
        return Response(
            {'error': 'FCM token مطلوب'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = request.user
        user.fcm_token = fcm_token
        user.save()
        
        return Response({
            'success': True,
            'message': 'تم تحديث FCM token بنجاح'
        })
    except Exception as e:
        return Response(
            {'error': f'خطأ في تحديث FCM token: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def send_password_reset_otp(request):
    """إرسال كود OTP لإعادة تعيين كلمة المرور عبر الإيميل"""
    email = request.data.get('email')
    
    if not email:
        return Response(
            {'error': 'البريد الإلكتروني مطلوب'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # البحث عن المستخدم
        user = User.objects.get(email=email)
        
        # إنشاء كود OTP
        password_reset_otp = PasswordResetOTP.generate_otp(user)
        
        try:
            send_password_reset_email(user, password_reset_otp.otp_code)
            logger.info(f"Password reset OTP sent to {email}: {password_reset_otp.otp_code}")

            return Response({
                'success': True,
                'message': 'تم إرسال كود التحقق إلى بريدك الإلكتروني'
            })

        except Exception as e:
            logger.error(f"Failed to send password reset email to {email}: {str(e)}")
            print(f"🔑 Password Reset OTP for {email}: {password_reset_otp.otp_code}")

            return Response({
                'success': True,
                'message': 'تم إنشاء كود التحقق (تحقق من Django Console للحصول على الكود)',
                'debug_otp': password_reset_otp.otp_code
            })
            
    except User.DoesNotExist:
        # لا نكشف أن الإيميل غير موجود لأسباب أمنية
        return Response({
            'success': True,
            'message': 'إذا كان البريد الإلكتروني موجود، ستصلك رسالة بكود التحقق'
        })
    
    except Exception as e:
        logger.error(f"Error in send_password_reset_otp: {str(e)}")
        return Response(
            {'error': 'حدث خطأ في إرسال كود التحقق'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_password_reset_otp(request):
    """التحقق من كود OTP لإعادة تعيين كلمة المرور"""
    email = request.data.get('email')
    otp_code = request.data.get('otp_code')
    
    if not email or not otp_code:
        return Response(
            {'error': 'البريد الإلكتروني وكود التحقق مطلوبان'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = User.objects.get(email=email)
        
        # البحث عن كود OTP صالح
        password_reset_otp = PasswordResetOTP.objects.filter(
            user=user,
            otp_code=otp_code,
            is_used=False
        ).first()
        
        if not password_reset_otp:
            return Response(
                {'error': 'كود التحقق غير صحيح'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if password_reset_otp.is_expired():
            return Response(
                {'error': 'كود التحقق منتهي الصلاحية'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # تمييز الكود كمستخدم (لكن لا نحذفه حتى يتم تغيير كلمة المرور)
        password_reset_otp.is_used = True
        password_reset_otp.save()
        
        return Response({
            'success': True,
            'message': 'تم التحقق من الكود بنجاح',
            'reset_token': password_reset_otp.id  # نرسل معرف الـ OTP كـ token
        })
        
    except User.DoesNotExist:
        return Response(
            {'error': 'البريد الإلكتروني غير موجود'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    except Exception as e:
        logger.error(f"Error in verify_password_reset_otp: {str(e)}")
        return Response(
            {'error': 'حدث خطأ في التحقق من الكود'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password_confirm(request):
    """تأكيد إعادة تعيين كلمة المرور بكلمة مرور جديدة"""
    reset_token = request.data.get('reset_token')
    new_password = request.data.get('new_password')
    confirm_password = request.data.get('confirm_password')
    
    if not reset_token or not new_password or not confirm_password:
        return Response(
            {'error': 'جميع الحقول مطلوبة'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if new_password != confirm_password:
        return Response(
            {'error': 'كلمتا المرور غير متطابقتان'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if len(new_password) < 8:
        return Response(
            {'error': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # البحث عن الـ OTP token
        password_reset_otp = PasswordResetOTP.objects.get(
            id=reset_token,
            is_used=True  # يجب أن يكون مستخدم (تم التحقق منه)
        )
        
        # التأكد أن الكود لم ينته
        if password_reset_otp.is_expired():
            return Response(
                {'error': 'انتهت صلاحية جلسة إعادة تعيين كلمة المرور'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # تغيير كلمة المرور
        user = password_reset_otp.user
        user.set_password(new_password)
        user.save()
        
        # حذف جميع أكواد إعادة التعيين للمستخدم
        PasswordResetOTP.objects.filter(user=user).delete()
        
        logger.info(f"Password reset successful for user {user.email}")
        
        return Response({
            'success': True,
            'message': 'تم تغيير كلمة المرور بنجاح'
        })
        
    except PasswordResetOTP.DoesNotExist:
        return Response(
            {'error': 'رمز إعادة التعيين غير صالح'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    except Exception as e:
        logger.error(f"Error in reset_password_confirm: {str(e)}")
        return Response(
            {'error': 'حدث خطأ في تغيير كلمة المرور'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_push_notification(request):
    """Send push notification to authenticated user"""
    title = request.data.get('title', 'PetMatch Notification')
    body = request.data.get('body', 'You have a new notification')
    data = request.data.get('data', {})
    
    user = request.user
    
    if not user.fcm_token:
        return Response(
            {'error': 'User does not have FCM token registered'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Import Firebase service
        from .firebase_service import firebase_service
        
        success = firebase_service.send_notification(
            fcm_token=user.fcm_token,
            title=title,
            body=body,
            data=data
        )
        
        if success:
            return Response({
                'success': True,
                'message': 'Push notification sent successfully'
            })
        else:
            return Response(
                {'error': 'Failed to send push notification'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    except Exception as e:
        return Response(
            {'error': f'Error sending notification: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_send_push_to_email(request):
    """Send a push notification to a user by email (admin-only via API key).
    Headers:
      - X-API-KEY: <key>  OR  Authorization: Api-Key <key>
    Body JSON:
      { "email": "user@example.com", "title": "...", "body": "...", "data": { ... } }
    """
    try:
        provided_key = request.headers.get('X-API-KEY') or ''
        if not provided_key:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.lower().startswith('api-key '):
                provided_key = auth_header.split(' ', 1)[1].strip()
        configured_key = getattr(settings, 'ADMIN_API_KEY', None) or os.environ.get('ADMIN_API_KEY')
        if not configured_key or provided_key != configured_key:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        email = request.data.get('email', '').strip().lower()
        title = request.data.get('title') or 'PetMatch Notification'
        body = request.data.get('body') or 'You have a new notification'
        data = request.data.get('data') or {}

        if not email:
            return Response({'error': 'email is required'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email=email).first()
        if not user:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        if not user.fcm_token:
            return Response({'error': 'User has no FCM token'}, status=status.HTTP_400_BAD_REQUEST)

        from .firebase_service import firebase_service
        if not firebase_service.is_initialized:
            return Response({'error': 'Firebase not initialized'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        ok = firebase_service.send_notification(
            fcm_token=user.fcm_token,
            title=title,
            body=body,
            data=data,
        )
        if ok:
            return Response({'success': True}, status=status.HTTP_200_OK)
        return Response({'error': 'Failed to send push'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    except Exception as e:
        logger.error(f"admin_send_push_to_email error: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
