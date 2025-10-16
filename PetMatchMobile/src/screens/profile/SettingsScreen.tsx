import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';

interface SettingsScreenProps {
  onClose: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTerms: () => void;
  onDeleteAccount: () => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose, onOpenPrivacyPolicy, onOpenTerms, onDeleteAccount }) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد من تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تسجيل الخروج', onPress: () => {
          // Handle logout logic here
          onClose();
        }},
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'مسح الذاكرة المؤقتة',
      'هل تريد مسح الذاكرة المؤقتة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'مسح', onPress: () => {
          // Handle cache clearing logic here
          Alert.alert('تم', 'تم مسح الذاكرة المؤقتة بنجاح');
        }},
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Text style={styles.backButtonText}>← رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإعدادات</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الإشعارات</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>الإشعارات</Text>
              <Text style={styles.settingDescription}>تلقي إشعارات حول التطبيق</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#e1e8ed', true: '#02B7B4' }}
              thumbColor={notificationsEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الخصوصية</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>الموقع</Text>
              <Text style={styles.settingDescription}>مشاركة موقعك للعثور على حيوانات قريبة</Text>
            </View>
            <Switch
              value={locationEnabled}
              onValueChange={setLocationEnabled}
              trackColor={{ false: '#e1e8ed', true: '#02B7B4' }}
              thumbColor={locationEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>المظهر</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>الوضع المظلم</Text>
              <Text style={styles.settingDescription}>استخدام الوضع المظلم</Text>
            </View>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: '#e1e8ed', true: '#02B7B4' }}
              thumbColor={darkModeEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>التطبيق</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleClearCache}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>مسح الذاكرة المؤقتة</Text>
              <Text style={styles.settingDescription}>تحرير مساحة التخزين</Text>
            </View>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>حول التطبيق</Text>
              <Text style={styles.settingDescription}>إصدار 1.0.0</Text>
            </View>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الوثائق القانونية</Text>

          <TouchableOpacity style={styles.settingItem} onPress={onOpenPrivacyPolicy}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>سياسة الخصوصية</Text>
              <Text style={styles.settingDescription}>تعرف على كيفية حماية بياناتك</Text>
            </View>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={onOpenTerms}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>الشروط والأحكام</Text>
              <Text style={styles.settingDescription}>القواعد المنظمة لاستخدام التطبيق</Text>
            </View>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, styles.dangerItem]} onPress={onDeleteAccount}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, styles.dangerText]}>حذف الحساب</Text>
              <Text style={[styles.settingDescription, styles.dangerTextMuted]}>يمكنك حذف حسابك وجميع البيانات المرتبطة به</Text>
            </View>
            <Text style={[styles.settingArrow, styles.dangerText]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#02B7B4',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
    marginHorizontal: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  settingArrow: {
    fontSize: 20,
    color: '#bdc3c7',
  },
  dangerItem: {
    borderTopWidth: 1,
    borderTopColor: '#ffe0e0',
  },
  dangerText: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  dangerTextMuted: {
    color: '#e57373',
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    margin: 20,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
