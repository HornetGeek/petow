import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermissionWithUX } from '../services/notifications';

interface NotificationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
}

const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
  visible,
  onClose,
  onPermissionGranted,
}) => {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    
    try {
      const granted = await requestNotificationPermissionWithUX();
      
      if (granted) {
        // Permission granted - just close modal and register FCM token
        onPermissionGranted();
        onClose();
      } else {
        // Permission denied - provide more specific guidance
                  Alert.alert(
            '⚠️ تفعيل الإشعارات يدوياً',
            Platform.OS === 'android' 
              ? '🔧 لتفعيل الإشعارات يدوياً:\n\n📱 الطريقة الأولى:\n1️⃣ اذهب إلى إعدادات الجهاز\n2️⃣ ابحث عن "التطبيقات" أو "Apps"\n3️⃣ اختر "PetMatch"\n4️⃣ اضغط على "الإشعارات" أو "Notifications"\n5️⃣ فعل "السماح بالإشعارات"\n\n⚙️ الطريقة الثانية:\n1️⃣ اضغط "فتح الإعدادات" أدناه\n2️⃣ ابحث عن "الإشعارات"\n3️⃣ فعل جميع أنواع الإشعارات'
              : '🔧 لتفعيل الإشعارات على iOS:\n\n1️⃣ اذهب إلى إعدادات الجهاز\n2️⃣ اختر "الإشعارات"\n3️⃣ ابحث عن "PetMatch"\n4️⃣ فعل "السماح بالإشعارات"\n5️⃣ اختر نوع الإشعارات المطلوبة',
          [
            {
              text: 'فتح الإعدادات',
              onPress: () => {
                Linking.openSettings();
                onClose();
              },
            },
            {
              text: 'المحاولة مرة أخرى',
              onPress: () => {
                // Clear the "asked" flag so they can try again
                AsyncStorage.removeItem('notificationPermissionAsked');
                onClose();
              },
            },
            {
              text: 'لاحقاً',
              style: 'cancel',
              onPress: onClose,
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء طلب إذن الإشعارات');
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔔</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>تفعيل الإشعارات</Text>

          {/* Description */}
          <Text style={styles.description}>
            احصل على إشعارات فورية عند:
          </Text>

          {/* Benefits List */}
          <View style={styles.benefitsList}>
            <Text style={styles.benefit}>🐾 العثور على حيوان أليف مناسب</Text>
            <Text style={styles.benefit}>💬 وصول رسائل جديدة</Text>
            <Text style={styles.benefit}>❤️ إعجاب أحدهم بحيوانك الأليف</Text>
            <Text style={styles.benefit}>📅 تذكيرات مهمة للعناية</Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.allowButton]}
              onPress={handleRequestPermission}
              disabled={isRequesting}
            >
              <Text style={styles.allowButtonText}>
                {isRequesting ? '⏳ جاري التفعيل...' : '✅ السماح بالإشعارات'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.laterButton]}
              onPress={onClose}
              disabled={isRequesting}
            >
              <Text style={styles.laterButtonText}>لاحقاً</Text>
            </TouchableOpacity>
          </View>

          {/* Privacy Note */}
          <Text style={styles.privacyNote}>
            💡 يمكنك تغيير هذا الإعداد لاحقاً من إعدادات التطبيق
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 16,
  },
  benefitsList: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  benefit: {
    fontSize: 15,
    color: '#34495E',
    marginBottom: 8,
    paddingLeft: 8,
  },
  buttonContainer: {
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  allowButton: {
    backgroundColor: '#3498DB',
  },
  allowButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  laterButton: {
    backgroundColor: '#ECF0F1',
  },
  laterButtonText: {
    color: '#7F8C8D',
    fontSize: 16,
  },
  privacyNote: {
    fontSize: 12,
    color: '#95A5A6',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default NotificationPermissionModal; 