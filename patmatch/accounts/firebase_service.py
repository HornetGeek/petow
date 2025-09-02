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
        self._initialize_firebase()
    
    def _initialize_firebase(self):
        """تهيئة Firebase Admin SDK"""
        try:
            # استخدام Firebase config من المتغيرات البيئية
            firebase_config = {
                "type": "service_account",
                "project_id": "petmatch-1e75d",
                "private_key_id": os.environ.get('FIREBASE_PRIVATE_KEY_ID', 'your_private_key_id'),
                "private_key": os.environ.get('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n'),
                "client_email": os.environ.get('FIREBASE_CLIENT_EMAIL', 'firebase-adminsdk-xxxxx@petmatch-1e75d.iam.gserviceaccount.com'),
                "client_id": os.environ.get('FIREBASE_CLIENT_ID', 'your_client_id'),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": os.environ.get('FIREBASE_CLIENT_X509_CERT_URL', 'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40petmatch-1e75d.iam.gserviceaccount.com')
            }
            
            # تهيئة Firebase إذا لم تكن مهيأة
            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_config)
                self.app = firebase_admin.initialize_app(cred)
                logger.info("✅ Firebase Admin SDK initialized successfully")
            else:
                self.app = firebase_admin.get_app()
                logger.info("✅ Firebase Admin SDK already initialized")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize Firebase: {str(e)}")
            self.app = None
    
    def send_notification(self, fcm_token, title, body, data=None):
        """إرسال إشعار لـ FCM token واحد"""
        if not self.app:
            logger.error("Firebase not initialized")
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
        if not self.app:
            logger.error("Firebase not initialized")
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
        if not self.app:
            logger.error("Firebase not initialized")
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