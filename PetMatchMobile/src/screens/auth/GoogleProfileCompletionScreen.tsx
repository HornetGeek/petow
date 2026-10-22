import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from 'react-native';
import PhoneInput from 'react-native-phone-number-input';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';

interface GoogleProfileCompletionScreenProps {
  googlePicture?: string;
  onComplete: () => void;
}

const GoogleProfileCompletionScreen: React.FC<GoogleProfileCompletionScreenProps> = ({
  googlePicture,
  onComplete,
}) => {
  const phoneInputRef = useRef<PhoneInput>(null);
  const { user, refreshUser } = useAuth();
  const [phoneValue, setPhoneValue] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleComplete = async () => {
    setErrorMessage('');

    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (phone) {
        payload.phone = phone;
      }

      if (Object.keys(payload).length > 0) {
        await apiService.updateProfile(payload);
        await refreshUser();
      }

      onComplete();
    } catch (error) {
      setErrorMessage('حدث خطأ أثناء حفظ البيانات، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          enableOnAndroid
          extraScrollHeight={Platform.select({ ios: 60, android: 30 })}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          alwaysBounceVertical={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandContainer}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>أكمل ملفك الشخصي</Text>
            <Text style={styles.brandSubtitle}>
              مرحباً {user?.first_name || ''}! أكمل بياناتك لتحسين تجربتك في Petow
            </Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>الاسم</Text>
              <Text style={styles.infoValue}>{user?.first_name} {user?.last_name}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>البريد الإلكتروني</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>رقم الهاتف (مطلوب)</Text>
              <PhoneInput
                ref={phoneInputRef}
                defaultCode="EG"
                layout="first"
                value={phoneValue}
                onChangeText={(value) => setPhoneValue(value)}
                onChangeFormattedText={(text) => {
                  const sanitized = text ? text.replace(/\s+/g, '') : '';
                  setPhone(sanitized);
                }}
                countryPickerProps={{
                  withFilter: true,
                }}
                textInputProps={{
                  keyboardType: 'phone-pad',
                  returnKeyType: 'done',
                  placeholder: '10 1234 5678',
                  placeholderTextColor: '#95a5a6',
                }}
                containerStyle={styles.phoneInputContainer}
                textContainerStyle={styles.phoneTextContainer}
                textInputStyle={styles.phoneTextInput}
                codeTextStyle={styles.phoneCodeText}
              />
            </View>

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleComplete}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>متابعة</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={loading}
            >
              <Text style={styles.skipButtonText}>تخطي لاحقاً</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  brandLogo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    borderRadius: 20,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1c344d',
  },
  brandSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: '#5f6c7b',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5f6c7b',
  },
  infoValue: {
    fontSize: 14,
    color: '#1c344d',
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 16,
    marginTop: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c344d',
    marginBottom: 6,
  },
  phoneInputContainer: {
    width: '100%',
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  phoneTextContainer: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 0,
  },
  phoneTextInput: {
    fontSize: 16,
    color: '#1c344d',
    paddingVertical: 12,
  },
  phoneCodeText: {
    fontSize: 16,
    color: '#1c344d',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 13,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#02B7B4',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  skipButton: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  skipButtonText: {
    color: '#5f6c7b',
    fontSize: 15,
    fontWeight: '500',
  },
});

export default GoogleProfileCompletionScreen;
