import React, { useState } from 'react';
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
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  Linking,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import ForgotPasswordScreen from './ForgotPasswordScreen';

const PRIVACY_POLICY_URL = 'https://petow.app/privacy-policy';
const TERMS_URL = 'https://petow.app/terms';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { login } = useAuth();

  const handleForgotPassword = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setShowForgotPassword(true);
  };

  const openExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.warn('Failed to open link', error);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage('برجاء إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setLoading(true);
    try {
      const success = await login(email.trim(), password);
      if (!success) {
        setErrorMessage('بيانات تسجيل الدخول غير صحيحة');
      }
    } catch (error) {
      setErrorMessage('تعذر تسجيل الدخول، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <ForgotPasswordScreen
        onClose={() => setShowForgotPassword(false)}
        onSuccess={(msg) => {
          setErrorMessage('');
          setSuccessMessage(msg || 'تم تغيير كلمة المرور بنجاح');
          setShowForgotPassword(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandContainer}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>مرحباً بعودتك</Text>
              <Text style={styles.brandSubtitle}>
                سجّل دخولك لمتابعة طلباتك وتواصل مع المربين بسهولة
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#95a5a6"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>كلمة المرور</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="••••••••"
                    placeholderTextColor="#95a5a6"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.togglePassword}
                    onPress={() => setShowPassword(prev => !prev)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    <Text style={styles.togglePasswordText}>
                      {showPassword ? '🙈' : '👁'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {successMessage ? (
                <Text style={styles.successText}>{successMessage}</Text>
              ) : null}

              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>تسجيل الدخول</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryLink} onPress={handleForgotPassword}>
                <Text style={styles.secondaryLinkText}>نسيت كلمة المرور؟</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.switchAuth}
              onPress={onNavigateToRegister}
            >
              <Text style={styles.switchAuthText}>
                ليس لديك حساب؟{' '}
                <Text style={styles.switchAuthHighlight}>إنشاء حساب جديد</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.legalContainer}>
              <Text style={styles.legalText}>
                باستخدامك للتطبيق، فإنك توافق على{' '}
                <Text style={styles.linkText} onPress={() => openExternalLink(PRIVACY_POLICY_URL)}>سياسة الخصوصية</Text>
                {' '}و{' '}
                <Text style={styles.linkText} onPress={() => openExternalLink(TERMS_URL)}>الشروط والأحكام</Text>.
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  flex: {
    flex: 1,
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
  fieldGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c344d',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1c344d',
    borderWidth: 1,
    borderColor: '#e1e8f0',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 44,
  },
  togglePassword: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  togglePasswordText: {
    fontSize: 18,
    color: '#0a84ff',
  },
  successText: {
    textAlign: 'center',
    color: '#2ecc71',
    marginBottom: 12,
    fontWeight: '600',
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
  secondaryLink: {
    alignItems: 'center',
    marginTop: 14,
  },
  secondaryLinkText: {
    color: '#0a84ff',
    fontWeight: '600',
  },
  switchAuth: {
    marginTop: 28,
    alignItems: 'center',
  },
  switchAuthText: {
    color: '#5f6c7b',
    fontSize: 15,
  },
  switchAuthHighlight: {
    color: '#02B7B4',
    fontWeight: '700',
  },
  legalContainer: {
    marginTop: 20,
    paddingHorizontal: 12,
  },
  legalText: {
    textAlign: 'center',
    color: '#7b8896',
    fontSize: 13,
    lineHeight: 18,
  },
  linkText: {
    color: '#02B7B4',
    fontWeight: '600',
  },
});

export default LoginScreen;
