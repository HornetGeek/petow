import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { apiService } from '../../services/api';

interface ForgotPasswordScreenProps {
  onClose: () => void;
  onSuccess?: (message?: string) => void;
}

type Step = 'email' | 'otp' | 'password';

const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (step === 'email') return Boolean(email.trim());
    if (step === 'otp') return email.trim().length > 0 && otpCode.trim().length === 6;
    if (step === 'password') return resetToken.length > 0 && newPassword.length >= 8 && confirmPassword.length >= 8;
    return false;
  }, [step, email, otpCode, resetToken, newPassword, confirmPassword, loading]);

  const resetState = () => {
    setStep('email');
    setEmail('');
    setOtpCode('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setMessage('');
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSendOTP = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await apiService.sendPasswordResetOTP(email.trim());
      if (!response.success) {
        throw new Error(response.error || 'حدث خطأ في إرسال كود التحقق');
      }
      const info = response.data?.message || 'تم إرسال كود التحقق إلى بريدك الإلكتروني';
      setMessage(info);
      setStep('otp');
      // للمطورين: عرض الكود في وحدة التحكم إذا توفر
      if ((response.data as any)?.debug_otp) {
        console.log('🔑 Debug OTP Code:', (response.data as any).debug_otp);
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ في إرسال كود التحقق');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await apiService.verifyPasswordResetOTP(email.trim(), otpCode.trim());
      if (!response.success || !response.data?.reset_token) {
        throw new Error(response.error || 'تعذر التحقق من الكود');
      }
      setResetToken(String(response.data.reset_token));
      setMessage(response.data.message || 'تم التحقق من الكود بنجاح');
      setStep('password');
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ في التحقق من الكود');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await apiService.sendPasswordResetOTP(email.trim());
      if (!response.success) {
        throw new Error(response.error || 'حدث خطأ في إعادة إرسال الكود');
      }
      setMessage(response.data?.message || 'تم إعادة إرسال كود التحقق');
      if ((response.data as any)?.debug_otp) {
        console.log('🔑 Debug OTP Code:', (response.data as any).debug_otp);
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ في إعادة إرسال الكود');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتان');
      return;
    }
    if (newPassword.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await apiService.resetPasswordConfirm(resetToken, newPassword, confirmPassword);
      if (!response.success) {
        throw new Error(response.error || 'تعذر تغيير كلمة المرور');
      }
      const info = response.data?.message || 'تم تغيير كلمة المرور بنجاح';
      setMessage(info);
      onSuccess?.(info);
      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ في تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'email':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>نسيت كلمة المرور؟</Text>
            <Text style={styles.cardSubtitle}>أدخل بريدك الإلكتروني وسنرسل لك كود التحقق.</Text>
            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              placeholderTextColor="#95a5a6"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
              onPress={handleSendOTP}
              disabled={!canSubmit}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>إرسال الكود</Text>}
            </TouchableOpacity>
          </View>
        );
      case 'otp':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>أدخل كود التحقق</Text>
            <Text style={styles.cardSubtitle}>أرسلنا الكود إلى بريدك الإلكتروني. أدخل الكود المكون من 6 أرقام أدناه.</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor="#95a5a6"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
              onPress={handleVerifyOTP}
              disabled={!canSubmit}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>تحقق</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryLink} onPress={handleResendOTP} disabled={loading}>
              <Text style={styles.secondaryLinkText}>إعادة إرسال الكود</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryLink} onPress={() => setStep('email')} disabled={loading}>
              <Text style={styles.secondaryLinkText}>تعديل البريد الإلكتروني</Text>
            </TouchableOpacity>
          </View>
        );
      case 'password':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>كلمة المرور الجديدة</Text>
            <Text style={styles.cardSubtitle}>اختر كلمة مرور قوية لاستخدامها في تسجيل الدخول.</Text>
            <TextInput
              style={styles.input}
              placeholder="كلمة المرور الجديدة"
              placeholderTextColor="#95a5a6"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="تأكيد كلمة المرور"
              placeholderTextColor="#95a5a6"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={!canSubmit}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>تعيين كلمة المرور</Text>}
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose}>
                <Text style={styles.backText}>‹ العودة</Text>
              </TouchableOpacity>
            </View>

            {message ? <Text style={styles.successText}>{message}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {renderContent()}
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
  header: {
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 12,
  },
  backText: {
    color: '#1c344d',
    fontWeight: '600',
    fontSize: 15,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1c344d',
  },
  cardSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#5f6c7b',
    marginBottom: 16,
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
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#02B7B4',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryLink: {
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryLinkText: {
    color: '#0a84ff',
    fontWeight: '600',
  },
  successText: {
    textAlign: 'center',
    color: '#2ecc71',
    marginBottom: 12,
    fontWeight: '600',
  },
  errorText: {
    textAlign: 'center',
    color: '#e74c3c',
    marginBottom: 12,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
