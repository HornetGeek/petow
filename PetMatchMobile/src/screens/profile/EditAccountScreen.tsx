import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { apiService, User } from '../../services/api';

interface Props { onClose: () => void; current: User; onUpdated: (u: User) => void; }

const EditAccountScreen: React.FC<Props> = ({ onClose, current, onUpdated }) => {
  const [firstName, setFirstName] = useState(current.first_name || '');
  const [lastName, setLastName] = useState(current.last_name || '');
  const [phone, setPhone] = useState(current.phone || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    try {
      setSaving(true);
      const payload: any = {};
      if (firstName !== current.first_name) payload.first_name = firstName.trim();
      if (lastName !== current.last_name) payload.last_name = lastName.trim();
      if (phone !== current.phone) payload.phone = phone.trim();
      if (password.trim()) payload.password = password.trim();

      if (!Object.keys(payload).length) {
        Alert.alert('لا يوجد تغييرات', 'قم بتعديل الحقول أولاً');
        return;
      }

      const res = await apiService.updateUserProfile(payload);
      if (res.success && res.data) {
        Alert.alert('تم الحفظ', 'تم تحديث بياناتك بنجاح');
        onUpdated(res.data);
        onClose();
      } else {
        Alert.alert('خطأ', res.error || 'فشل تحديث البيانات');
      }
    } catch (e) {
      Alert.alert('خطأ', 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>تعديل الحساب</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>الاسم الأول</Text>
        <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="الاسم الأول" placeholderTextColor="#95a5a6" />

        <Text style={styles.label}>الاسم الأخير</Text>
        <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="الاسم الأخير" placeholderTextColor="#95a5a6" />

        <Text style={styles.label}>رقم الهاتف</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="رقم الهاتف" placeholderTextColor="#95a5a6" />

        <Text style={styles.label}>كلمة المرور الجديدة (اختياري)</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor="#95a5a6" />

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={onClose} disabled={saving}>
            <Text style={styles.secondaryText}>إلغاء</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, saving && styles.disabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>حفظ</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e1e8ed' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: '#2c3e50' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  content: { padding: 16 },
  label: { fontSize: 14, color: '#7f8c8d', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e8ed', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: '#2c3e50' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: { flex: 1, backgroundColor: '#02B7B4', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  disabled: { backgroundColor: '#95a5a6' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  secondary: { backgroundColor: '#ecf0f1' },
  secondaryText: { color: '#2c3e50', fontWeight: 'bold' },
});

export default EditAccountScreen;

