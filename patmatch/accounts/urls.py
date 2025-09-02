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
] 