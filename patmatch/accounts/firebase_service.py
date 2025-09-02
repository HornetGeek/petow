import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings
import logging
import os

logger = logging.getLogger(__name__)

class FirebaseService:
    """خدمة Firebase للإشعارات"""
    
    def __init__(self):
        self.app = None
        self.is_initialized = False
        self._initialize_firebase()
    
    def _initialize_firebase(self):
        """تهيئة Firebase Admin SDK"""
        try:
            # استخدام إعدادات Django بدلاً من os.environ مباشرة
            firebase_credentials = {
                'private_key_id': getattr(settings, 'FIREBASE_PRIVATE_KEY_ID', ''),
                'private_key': getattr(settings, 'FIREBASE_PRIVATE_KEY', ''),
                'client_email': getattr(settings, 'FIREBASE_CLIENT_EMAIL', ''),
                'client_id': getattr(settings, 'FIREBASE_CLIENT_ID', ''),
                'client_x509_cert_url': getattr(settings, 'FIREBASE_CLIENT_X509_CERT_URL', '')
            }
            
            # التحقق من وجود جميع المتغيرات المطلوبة
            missing_vars = []
            for key, value in firebase_credentials.items():
                if not value or value.startswith('your_') or value.startswith('firebase-adminsdk-xxxxx'):
                    missing_vars.append(key.upper())
            
            if missing_vars:
                logger.warning(f"⚠️ Firebase credentials not properly configured. Missing or invalid: {missing_vars}")
                logger.warning("⚠️ Firebase notifications will be disabled. Set proper environment variables to enable.")
                return
            
            # تحويل escaped newlines إلى newlines فعلية
            private_key = firebase_credentials['private_key'].replace('\\n', '\n')
            
            # استخدام Firebase config من إعدادات Django
            firebase_config = {
                "type": "service_account",
                "project_id": "petmatch-1e75d",
                "private_key_id": firebase_credentials['private_key_id'],
                "private_key": private_key,
                "client_email": firebase_credentials['client_email'],
                "client_id": firebase_credentials['client_id'],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": firebase_credentials['client_x509_cert_url']
            }
            
            # تهيئة Firebase إذا لم تكن مهيأة
            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_config)
                self.app = firebase_admin.initialize_app(cred)
                self.is_initialized = True
                logger.info("✅ Firebase Admin SDK initialized successfully")
            else:
                self.app = firebase_admin.get_app()
                self.is_initialized = True
                logger.info("✅ Firebase Admin SDK already initialized")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize Firebase: {str(e)}")
            self.app = None
            self.is_initialized = False
    
    def send_notification(self, fcm_token, title, body, data=None):
        """إرسال إشعار لـ FCM token واحد"""
        if not self.is_initialized:
            logger.warning("⚠️ Firebase not initialized - notification not sent")
            return False
        
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                token=fcm_token
            )
            
            response = messaging.send(message)
            logger.info(f"✅ Notification sent successfully: {response}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to send notification: {str(e)}")
            return False
    
    def send_multicast_notification(self, fcm_tokens, title, body, data=None):
        """إرسال إشعار لعدة FCM tokens"""
        if not self.is_initialized:
            logger.warning("⚠️ Firebase not initialized - multicast notification not sent")
            return False
        
        try:
            message = messaging.MulticastMessage(
                notification=messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                tokens=fcm_tokens
            )
            
            response = messaging.send_multicast(message)
            logger.info(f"✅ Multicast notification sent: {response.success_count} successful, {response.failure_count} failed")
            return response.success_count > 0
            
        except Exception as e:
            logger.error(f"❌ Failed to send multicast notification: {str(e)}")
            return False
    
    def send_topic_notification(self, topic, title, body, data=None):
        """إرسال إشعار لموضوع معين"""
        if not self.is_initialized:
            logger.warning("⚠️ Firebase not initialized - topic notification not sent")
            return False
        
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                topic=topic
            )
            
            response = messaging.send(message)
            logger.info(f"✅ Topic notification sent successfully: {response}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to send topic notification: {str(e)}")
            return False

# إنشاء instance واحد للاستخدام في التطبيق
firebase_service = FirebaseService() 