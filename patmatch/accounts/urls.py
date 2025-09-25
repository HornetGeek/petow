from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    path('profile/', views.UserProfileView.as_view(), name='profile'),
    path('login/', views.login, name='login'),
    path('register/', views.register, name='register'),
    path('logout/', views.logout, name='logout'),
    path('send-phone-otp/', views.send_phone_otp, name='send_phone_otp'),
    path('verify-phone-otp/', views.verify_phone_otp, name='verify_phone_otp'),
    path('verify-firebase-phone/', views.verify_firebase_phone, name='verify_firebase_phone'),
    path('update-notification-token/', views.update_notification_token, name='update_notification_token'),
    # Password Reset URLs
    path('send-password-reset-otp/', views.send_password_reset_otp, name='send_password_reset_otp'),
    path('verify-password-reset-otp/', views.verify_password_reset_otp, name='verify_password_reset_otp'),
    path('reset-password-confirm/', views.reset_password_confirm, name='reset_password_confirm'),
    path('send-push-notification/', views.send_push_notification, name='send_push_notification'),
    # Admin push endpoint (API key protected)
    path('admin/send-push-to-email/', views.admin_send_push_to_email, name='admin_send_push_to_email'),
    path('admin/send-push-to-token/', views.admin_send_push_to_token, name='admin_send_push_to_token'),
]
