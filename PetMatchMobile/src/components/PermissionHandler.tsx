import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  PermissionsAndroid,
  Platform,
  TouchableOpacity,
} from 'react-native';

interface PermissionHandlerProps {
  onPermissionGranted: () => void;
  onPermissionDenied: () => void;
}

const PermissionHandler: React.FC<PermissionHandlerProps> = ({
  onPermissionGranted,
  onPermissionDenied,
}) => {
  const [isRequesting, setIsRequesting] = useState(false);

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') {
      onPermissionGranted();
      return;
    }

    try {
      setIsRequesting(true);

      // طلب أذونات الموقع واحدة تلو الأخرى
      const fineLocationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'أذونات الموقع الدقيق',
          message: 'يحتاج التطبيق للوصول لموقعك الدقيق لاستخدام ميزة الخريطة',
          buttonNeutral: 'اسألني لاحقاً',
          buttonNegative: 'رفض',
          buttonPositive: 'موافق',
        }
      );

      if (fineLocationResult === PermissionsAndroid.RESULTS.GRANTED) {
        onPermissionGranted();
        return;
      }

      // إذا رُفض الموقع الدقيق، جرب الموقع التقريبي
      const coarseLocationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        {
          title: 'أذونات الموقع التقريبي',
          message: 'يحتاج التطبيق للوصول لموقعك التقريبي لاستخدام ميزة الخريطة',
          buttonNeutral: 'اسألني لاحقاً',
          buttonNegative: 'رفض',
          buttonPositive: 'موافق',
        }
      );

      if (coarseLocationResult === PermissionsAndroid.RESULTS.GRANTED) {
        onPermissionGranted();
      } else {
        Alert.alert(
          'أذونات الموقع مطلوبة',
          'يحتاج التطبيق للوصول لموقعك لاستخدام ميزة الخريطة والبحث عن الحيوانات القريبة',
          [
            { text: 'إلغاء', onPress: onPermissionDenied },
            { text: 'إعادة المحاولة', onPress: requestLocationPermission }
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      Alert.alert(
        'خطأ في طلب الأذونات',
        'حدث خطأ أثناء طلب أذونات الموقع. يرجى المحاولة مرة أخرى.',
        [
          { text: 'إلغاء', onPress: onPermissionDenied },
          { text: 'إعادة المحاولة', onPress: requestLocationPermission }
        ]
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const skipPermission = () => {
    Alert.alert(
      'تخطي الأذونات',
      'يمكنك استخدام التطبيق بدون أذونات الموقع، لكن لن تتمكن من استخدام ميزة الخريطة والموقع الحالي.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تخطي', onPress: onPermissionDenied }
      ]
    );
  };

  useEffect(() => {
    // لا نطلب الأذونات تلقائياً، ننتظر المستخدم
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>طلب أذونات الموقع</Text>
      <Text style={styles.description}>
        يحتاج التطبيق للوصول لموقعك لاستخدام ميزة الخريطة والبحث عن الحيوانات القريبة
      </Text>
      
      <TouchableOpacity
        style={styles.button}
        onPress={requestLocationPermission}
        disabled={isRequesting}
      >
        <Text style={styles.buttonText}>
          {isRequesting ? 'جاري الطلب...' : 'السماح بالوصول للموقع'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={skipPermission}
        disabled={isRequesting}
      >
        <Text style={styles.skipButtonText}>تخطي</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#02B7B4',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  skipButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bdc3c7',
  },
  skipButtonText: {
    color: '#7f8c8d',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default PermissionHandler;
