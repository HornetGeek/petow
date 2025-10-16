import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import NotificationPermissionModal from '../components/NotificationPermissionModal';
import NotificationDebugInfo from '../components/NotificationDebugInfo';
import { getAndRegisterFcmToken } from '../services/notifications';

const HomeScreen: React.FC = () => {
  const { 
    user, 
    shouldShowNotificationModal, 
    setShouldShowNotificationModal 
  } = useAuth();

  const handleNotificationPermissionGranted = async () => {
    try {
      // Re-register FCM token after permission is granted
      await getAndRegisterFcmToken();
      console.log('✅ FCM token registered after permission granted');
    } catch (error) {
      console.log('⚠️ Failed to register FCM token after permission:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🐾 مرحباً بك في PetMatch</Text>
        {user && (
          <Text style={styles.subtitle}>
            أهلاً {user.first_name}! ابحث عن الحيوان الأليف المثالي
          </Text>
        )}
      </View>

      <View style={styles.content}>
        {/* Your existing home screen content */}
        <Text style={styles.sectionTitle}>الميزات الرئيسية</Text>
        
        <TouchableOpacity style={styles.featureCard}>
          <Text style={styles.featureIcon}>🔍</Text>
          <Text style={styles.featureTitle}>البحث عن الحيوانات</Text>
          <Text style={styles.featureDescription}>
            ابحث عن الحيوان الأليف المثالي بناءً على تفضيلاتك
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureCard}>
          <Text style={styles.featureIcon}>💬</Text>
          <Text style={styles.featureTitle}>المحادثات</Text>
          <Text style={styles.featureDescription}>
            تواصل مع أصحاب الحيوانات الأليفة مباشرة
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureCard}>
          <Text style={styles.featureIcon}>❤️</Text>
          <Text style={styles.featureTitle}>المفضلة</Text>
          <Text style={styles.featureDescription}>
            احفظ الحيوانات الأليفة المفضلة لديك
          </Text>
        </TouchableOpacity>

                  <TouchableOpacity style={styles.featureCard}>
            <Text style={styles.featureIcon}>🔔</Text>
            <Text style={styles.featureTitle}>الإشعارات</Text>
            <Text style={styles.featureDescription}>
              احصل على تنبيهات فورية للرسائل والتطابقات الجديدة
            </Text>
          </TouchableOpacity>

          {/* Debug Button - Remove in production */}
          <TouchableOpacity 
            style={[styles.featureCard, { backgroundColor: '#FFF3CD' }]}
            onPress={() => setShouldShowNotificationModal(true)}
          >
            <Text style={styles.featureIcon}>🐛</Text>
            <Text style={styles.featureTitle}>تجربة الإشعارات (للاختبار)</Text>
            <Text style={styles.featureDescription}>
              اضغط هنا لإظهار نافذة طلب الإشعارات للاختبار
            </Text>
          </TouchableOpacity>
              </View>

        {/* Debug Info Component - Remove in production */}
        <NotificationDebugInfo />

        {/* Notification Permission Modal */}
      <NotificationPermissionModal
        visible={shouldShowNotificationModal}
        onClose={() => setShouldShowNotificationModal(false)}
        onPermissionGranted={handleNotificationPermissionGranted}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    backgroundColor: '#3498DB',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#E8F4FD',
    textAlign: 'center',
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
    textAlign: 'center',
  },
  featureCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  featureIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default HomeScreen;
