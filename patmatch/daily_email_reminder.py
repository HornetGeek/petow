#!/usr/bin/env python3
"""
Script لإرسال تذكرة يومية للمستخدمين الذين لديهم رسائل غير مقروءة
يمكن تشغيله من cron job كل يوم في نهاية اليوم
"""
import os
import sys
import django
from pathlib import Path

# إضافة مسار المشروع
project_path = Path(__file__).parent
sys.path.append(str(project_path))

# إعداد Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'patmatch_backend.settings')
django.setup()

from pets.email_notifications import send_daily_unread_messages_reminder
import logging

# إعداد التسجيل
log_file_path = project_path / 'logs' / 'daily_reminder.log'
log_file_path.parent.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(str(log_file_path)),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

def main():
    """تشغيل التذكرة اليومية"""
    try:
        logger.info("بدء تشغيل التذكرة اليومية للرسائل غير المقروءة")
        
        users_count = send_daily_unread_messages_reminder()
        
        logger.info(f"تم إرسال التذكرة اليومية إلى {users_count} مستخدم")
        
        return 0
        
    except Exception as e:
        logger.error(f"خطأ في تشغيل التذكرة اليومية: {str(e)}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code) 