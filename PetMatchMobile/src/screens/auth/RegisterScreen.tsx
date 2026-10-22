import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  Linking,
} from 'react-native';
import PhoneInput from 'react-native-phone-number-input';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '../../contexts/AuthContext';
import AppIcon, { IconSize } from '../../components/icons/AppIcon';

const PRIVACY_POLICY_URL = 'https://petow.app/privacy-policy';
const TERMS_URL = 'https://petow.app/terms';

const GOOGLE_WEB_CLIENT_ID = '171353883247-d3qfgch4tkiihlc212bkpbm62adllfr3.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '171353883247-0u0t3567pgbb48ijjmif5is0s62h5os4.apps.googleusercontent.com';

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
  onGoogleNewUser?: (googlePicture?: string) => void;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin, onGoogleNewUser }) => {
  const phoneInputRef = useRef<PhoneInput>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [phoneValue, setPhoneValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { register, googleLogin } = useAuth();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleRegister = async () => {
    const { email, password, confirmPassword, firstName, lastName, phone } = formData;

    if (
      !email.trim() ||
      !password ||
      !confirmPassword ||
      !firstName.trim() ||
      !lastName.trim() ||
      !phone.trim()
    ) {
      setErrorMessage('برجاء استكمال جميع الحقول');
      return;
    }

    if (password.length < 4) {
      setErrorMessage('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('كلمتا المرور غير متطابقتين');
      return;
    }

    if (!acceptedTerms) {
      setErrorMessage('يرجى الموافقة على سياسة الخصوصية والشروط والأحكام');
      return;
    }

    setErrorMessage('');
    setLoading(true);
    try {
      const result = await register({
        email: email.trim(),
        password1: password,
        password2: confirmPassword,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
      });

      if (!result.success) {
        setErrorMessage(result.error || 'تعذر إنشاء الحساب، حاول مرة أخرى');
      }
    } catch (error) {
      setErrorMessage('حدث خطأ أثناء إنشاء الحساب');
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
        setErrorMessage(result.error || 'فشل التسجيل باستخدام Google');
      }
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrorMessage('خدمات Google Play غير متوفرة');
      } else {
        setErrorMessage('حدث خطأ أثناء التسجيل باستخدام Google');
      }
    } finally {
      setGoogleLoading(false);
    }
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
              <Text style={styles.brandTitle}>إنشاء حساب</Text>
              <Text style={styles.brandSubtitle}>
                انضم إلى مجتمع PetMatch وابحث عن الشريك المثالي لحيوانك الأليف
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.row}>
                <View style={[styles.fieldGroup, styles.halfWidth]}>
                  <Text style={styles.inputLabel}>الاسم الأول</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="الاسم الأول"
                    placeholderTextColor="#95a5a6"
                    value={formData.firstName}
                    onChangeText={(value) => handleInputChange('firstName', value)}
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.fieldGroup, styles.halfWidth]}>
                  <Text style={styles.inputLabel}>اسم العائلة</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="اسم العائلة"
                    placeholderTextColor="#95a5a6"
                    value={formData.lastName}
                    onChangeText={(value) => handleInputChange('lastName', value)}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#95a5a6"
                  value={formData.email}
                  onChangeText={(value) => handleInputChange('email', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>رقم الهاتف</Text>
                <PhoneInput
                  ref={phoneInputRef}
                  defaultCode="EG"
                  layout="first"
                  value={phoneValue}
                  onChangeText={(value) => setPhoneValue(value)}
                  onChangeFormattedText={(text) => {
                    const sanitized = text ? text.replace(/\s+/g, '') : '';
                    handleInputChange('phone', sanitized);
                  }}
                  countryPickerProps={{
                    withFilter: true,
                  }}
                  textInputProps={{
                    keyboardType: 'phone-pad',
                    returnKeyType: 'next',
                    placeholder: '10 1234 5678',
                    placeholderTextColor: '#95a5a6',
                  }}
                  containerStyle={styles.phoneInputContainer}
                  textContainerStyle={styles.phoneTextContainer}
                  textInputStyle={styles.phoneTextInput}
                  codeTextStyle={styles.phoneCodeText}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>كلمة المرور</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="••••••••"
                    placeholderTextColor="#95a5a6"
                    value={formData.password}
                    onChangeText={(value) => handleInputChange('password', value)}
                    secureTextEntry={!showPassword}
                    returnKeyType="next"
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

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>تأكيد كلمة المرور</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="••••••••"
                    placeholderTextColor="#95a5a6"
                    value={formData.confirmPassword}
                    onChangeText={(value) => handleInputChange('confirmPassword', value)}
                    secureTextEntry={!showConfirmPassword}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.togglePassword}
                    onPress={() => setShowConfirmPassword(prev => !prev)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    <AppIcon
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={IconSize.md}
                      color="#64748B"
                      accessibilityLabel={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : (
                <Text style={styles.helperText}>
                  كلمة المرور يجب أن تتكون من 4 أحرف على الأقل
                </Text>
              )}

              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => setAcceptedTerms(prev => !prev)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
                accessibilityLabel="أوافق على سياسة الخصوصية والشروط والأحكام"
              >
                <View style={styles.checkboxIconWrapper}>
                  <AppIcon
                    name={acceptedTerms ? 'shield-check' : 'circle'}
                    size={IconSize.sm}
                    color={acceptedTerms ? '#14B8A6' : '#5f6c7b'}
                    accessibilityLabel={acceptedTerms ? 'تم القبول' : 'غير مقبول'}
                  />
                </View>
                <Text style={styles.consentText}>
                  أوافق على{' '}
                  <Text style={styles.linkText} onPress={() => openExternalLink(PRIVACY_POLICY_URL)}>
                    سياسة الخصوصية
                  </Text>
                  {' '}و{' '}
                  <Text style={styles.linkText} onPress={() => openExternalLink(TERMS_URL)}>
                    الشروط والأحكام
                  </Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>إنشاء الحساب</Text>
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
                    <Text style={styles.googleButtonText}>التسجيل باستخدام Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.termsContainer}>
              <Text style={styles.termsText}>
                بالتسجيل، أنت توافق على شروط الاستخدام وسياسة الخصوصية لدينا
              </Text>
            </View>

            <TouchableOpacity style={styles.switchAuth} onPress={onNavigateToLogin}>
              <Text style={styles.switchAuthText}>
                لديك حساب بالفعل؟{' '}
                <Text style={styles.switchAuthHighlight}>تسجيل الدخول</Text>
              </Text>
            </TouchableOpacity>
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
    marginTop: 24,
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
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  halfWidth: {
    width: '48%',
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
  errorText: {
    color: '#e74c3c',
    fontSize: 13,
    marginBottom: 12,
  },
  helperText: {
    color: '#5f6c7b',
    fontSize: 13,
    marginBottom: 12,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  checkboxIconWrapper: {
    marginRight: 10,
  },
  consentText: {
    flex: 1,
    color: '#5f6c7b',
    fontSize: 13,
    lineHeight: 18,
  },
  linkText: {
    color: '#02B7B4',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#02B7B4',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
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
    marginVertical: 14,
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
  termsContainer: {
    marginTop: 20,
    paddingHorizontal: 12,
  },
  termsText: {
    textAlign: 'center',
    color: '#7b8896',
    fontSize: 13,
    lineHeight: 20,
  },
  switchAuth: {
    marginTop: 24,
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
});

export default RegisterScreen;
