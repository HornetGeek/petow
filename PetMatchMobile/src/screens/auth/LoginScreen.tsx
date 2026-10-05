import React, { useState, useEffect } from 'react';
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
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '../../contexts/AuthContext';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import AppIcon, { IconSize } from '../../components/icons/AppIcon';

const PRIVACY_POLICY_URL = 'https://petow.app/privacy-policy';
const TERMS_URL = 'https://petow.app/terms';

const GOOGLE_WEB_CLIENT_ID = '171353883247-d3qfgch4tkiihlc212bkpbm62adllfr3.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '171353883247-0u0t3567pgbb48ijjmif5is0s62h5os4.apps.googleusercontent.com';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  onGoogleNewUser?: (googlePicture?: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigateToRegister, onGoogleNewUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { login, googleLogin } = useAuth();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    });
  }, []);

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

  const onGoogleButtonPress = async () => {
    setErrorMessage('');
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResponse = await GoogleSignin.signIn();

      let idToken: string | null = null;
      if (signInResponse.type === 'success' && signInResponse.data) {
        idToken = signInResponse.data.idToken ?? null;
      } else if (signInResponse.type === 'cancelled') {
        setGoogleLoading(false);
        return;
      }

      if (!idToken) {
        setErrorMessage('فشل الحصول على رمز الدخول من Google');
        setGoogleLoading(false);
        return;
      }

      const result = await googleLogin(idToken);

      if (result.success) {
        if (result.isNewUser && onGoogleNewUser) {
          onGoogleNewUser(result.googlePicture);
        }
      } else {
        setErrorMessage(result.error || 'فشل تسجيل الدخول باستخدام Google');
      }
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrorMessage('خدمات Google Play غير متوفرة');
      } else {
        setErrorMessage('حدث خطأ أثناء تسجيل الدخول باستخدام Google');
      }
    } finally {
      setGoogleLoading(false);
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
                    <AppIcon
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={IconSize.md}
                      color="#64748B"
                      accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    />
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

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>أو</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
                onPress={onGoogleButtonPress}
                disabled={googleLoading}
                activeOpacity={0.7}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#444" />
                ) : (
                  <>
                    <View style={styles.googleIconWrap}>
                      <Text style={styles.googleIconG}>G</Text>
                    </View>
                    <Text style={styles.googleButtonText}>تسجيل الدخول باستخدام Google</Text>
                  </>
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e1e8f0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#94a3b8',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e8f0',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
  },
  googleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3c4043',
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
