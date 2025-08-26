'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { apiService } from '@/lib/api';

interface FirebasePhoneVerificationProps {
  onVerificationComplete?: () => void;
  onClose?: () => void;
}

export default function FirebasePhoneVerification({ onVerificationComplete, onClose }: FirebasePhoneVerificationProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // تنظيف reCAPTCHA عند إلغاء المكون
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch (error) {
          console.log('Error clearing reCAPTCHA:', error);
        }
      }
    };
  }, []);

  const formatPhoneNumber = (phone: string) => {
    const numbers = phone.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)} ${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)} ${numbers.slice(3, 6)} ${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)} ${numbers.slice(3, 6)} ${numbers.slice(6, 10)}`;
  };

  const setupRecaptcha = () => {
    // إعداد reCAPTCHA
    if (typeof window !== 'undefined') {
      // تنظيف reCAPTCHA السابق
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
      
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            console.log('reCAPTCHA solved');
          },
          'expired-callback': () => {
            console.log('reCAPTCHA expired');
            setError('انتهت صلاحية reCAPTCHA، يرجى المحاولة مرة أخرى');
          }
        });
        return window.recaptchaVerifier;
      } catch (error) {
        console.error('reCAPTCHA setup error:', error);
        throw new Error('خطأ في إعداد التحقق الأمني');
      }
    }
    throw new Error('المتصفح غير متاح');
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      // تنسيق رقم الهاتف المصري
      let formattedPhone = phoneNumber;
      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('01')) {
          formattedPhone = '+20' + formattedPhone.slice(1);
        } else if (formattedPhone.startsWith('1')) {
          formattedPhone = '+20' + formattedPhone;
        } else {
          throw new Error('رقم الهاتف يجب أن يبدأ بـ 010, 011, 012, أو 015');
        }
      }

      // التحقق من صحة الرقم
      if (!formattedPhone.startsWith('+201') || formattedPhone.length !== 13) {
        throw new Error('رقم الهاتف غير صحيح');
      }

      console.log('📱 Sending SMS via Firebase to:', formattedPhone);

      // إرسال SMS عبر Firebase مباشرة
      const recaptchaVerifier = setupRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
      
      setConfirmationResult(confirmation);
      setMessage(`تم إرسال كود التحقق بنجاح عبر Firebase إلى ${formattedPhone}`);
      setStep('otp');

    } catch (err: any) {
      console.error('Firebase SMS Error:', err);
      
      // في حالة فشل Firebase تماماً، استخدم النظام الداخلي كـ backup
      if (err.code === 'auth/quota-exceeded' || err.code === 'auth/too-many-requests') {
        try {
          console.log('📱 Firebase quota exceeded, using internal system');
          const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : 
            (phoneNumber.startsWith('01') ? '+20' + phoneNumber.slice(1) : '+20' + phoneNumber);
          
          await apiService.sendPhoneOTP(formattedPhone);
          setConfirmationResult(null);
          setMessage('تم إرسال كود التحقق عبر النظام الداخلي (تحقق من Django Console)');
          setStep('otp');
        } catch (backupErr: any) {
          setError('فشل في إرسال كود التحقق عبر كلا النظامين');
        }
      } else {
        setError(err.message || 'خطأ في إرسال كود التحقق عبر Firebase');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : 
        (phoneNumber.startsWith('01') ? '+20' + phoneNumber.slice(1) : '+20' + phoneNumber);

      if (confirmationResult) {
        // التحقق عبر Firebase أولاً
        const result = await confirmationResult.confirm(otpCode);
        console.log('✅ Firebase verification successful:', result);
        
        // إشعار Django بالتحقق الناجح عبر Firebase
        try {
          await apiService.verifyFirebasePhone(formattedPhone);
          setMessage('تم التحقق من رقم الهاتف بنجاح عبر Firebase');
        } catch (djangoError) {
          console.log('⚠️ Django verification failed, but Firebase succeeded');
          setMessage('تم التحقق عبر Firebase لكن فشل في حفظ البيانات');
        }
      } else {
        // التحقق عبر النظام الداخلي (fallback)
        await apiService.verifyPhoneOTP(formattedPhone, otpCode);
        setMessage('تم التحقق من رقم الهاتف بنجاح عبر النظام الداخلي');
      }

      setTimeout(() => {
        onVerificationComplete?.();
      }, 1500);

    } catch (err: any) {
      console.error('Verification Error:', err);
      if (err.message?.includes('invalid-verification-code')) {
        setError('كود التحقق غير صحيح أو منتهي الصلاحية');
      } else {
        setError(err.message || 'كود التحقق غير صحيح');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      // تنسيق رقم الهاتف
      let formattedPhone = phoneNumber;
      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('01')) {
          formattedPhone = '+20' + formattedPhone.slice(1);
        } else if (formattedPhone.startsWith('1')) {
          formattedPhone = '+20' + formattedPhone;
        }
      }

      // إعادة تعيين النتيجة السابقة
      setConfirmationResult(null);

      try {
        // محاولة إعادة الإرسال عبر Firebase
        const recaptchaVerifier = setupRecaptcha();
        const confirmation = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
        setConfirmationResult(confirmation);
        setMessage('تم إعادة إرسال الكود عبر Firebase');
      } catch (firebaseError) {
        // في حالة فشل Firebase، استخدم النظام الداخلي
        await apiService.sendPhoneOTP(formattedPhone);
        setMessage('تم إعادة إرسال الكود عبر النظام الداخلي');
      }
    } catch (err: any) {
      setError(err.message || 'خطأ في إعادة إرسال الكود');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="phone-verification-modal">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>التحقق من رقم الهاتف</h2>
          {onClose && (
            <button className="close-btn" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOTP} className="verification-form">
            <div className="form-group">
              <label htmlFor="phone">رقم الهاتف</label>
              <div className="phone-input-group">
                <span className="country-code">+20</span>
                <input
                  type="tel"
                  id="phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="1xxxxxxxxx"
                  required
                  maxLength={10}
                  pattern="1[0-9]{9}"
                />
              </div>
              <small className="help-text">
                أدخل رقم الهاتف المصري (يبدأ بـ 010, 011, 012, أو 015)
                <br />
                <strong>سيتم إرسال رسالة SMS حقيقية عبر Firebase</strong>
              </small>
            </div>

            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <button type="submit" disabled={loading || phoneNumber.length !== 10}>
              {loading ? 'جاري الإرسال...' : 'إرسال كود التحقق'}
            </button>

            {/* Container for reCAPTCHA */}
            <div id="recaptcha-container"></div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="verification-form">
            <div className="form-group">
              <label htmlFor="otp">كود التحقق</label>
              <input
                type="text"
                id="otp"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                maxLength={6}
                className="otp-input"
              />
              <small className="help-text">
                تم إرسال كود التحقق إلى {formatPhoneNumber(phoneNumber)}
              </small>
            </div>

            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <button type="submit" disabled={loading || otpCode.length !== 6}>
              {loading ? 'جاري التحقق...' : 'تأكيد الكود'}
            </button>

            <div className="resend-section">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading}
                className="resend-btn"
              >
                إعادة إرسال الكود
              </button>
            </div>

            <button type="button" onClick={() => setStep('phone')} className="back-btn">
              تغيير رقم الهاتف
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .phone-verification-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Cairo', sans-serif;
        }

        .modal-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          padding: 32px;
          width: 90%;
          max-width: 400px;
          position: relative;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .modal-header h2 {
          margin: 0;
          color: #1f2937;
          font-size: 24px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 18px;
          color: #6b7280;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .verification-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-weight: 600;
          color: #374151;
          font-size: 14px;
        }

        .phone-input-group {
          display: flex;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
          transition: border-color 0.2s;
        }

        .phone-input-group:focus-within {
          border-color: #6366f1;
        }

        .country-code {
          background: #f9fafb;
          padding: 12px 16px;
          border-right: 1px solid #e5e7eb;
          color: #6b7280;
          font-weight: 500;
        }

        .phone-input-group input {
          flex: 1;
          border: none;
          padding: 12px 16px;
          outline: none;
          font-size: 16px;
        }

        .otp-input {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 18px;
          letter-spacing: 4px;
          text-align: center;
          transition: border-color 0.2s;
        }

        .otp-input:focus {
          border-color: #6366f1;
          outline: none;
        }

        .help-text {
          color: #6b7280;
          font-size: 12px;
        }

        .error-message {
          background: #fef2f2;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #fecaca;
          font-size: 14px;
        }

        .success-message {
          background: #f0fdf4;
          color: #16a34a;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #bbf7d0;
          font-size: 14px;
        }

        button[type="submit"] {
          background: #6366f1;
          color: white;
          border: none;
          padding: 14px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        button[type="submit"]:hover:not(:disabled) {
          background: #5145e6;
        }

        button[type="submit"]:disabled {
          background: #d1d5db;
          cursor: not-allowed;
        }

        .resend-section {
          text-align: center;
        }

        .resend-btn {
          background: none;
          border: 1px solid #e5e7eb;
          color: #6b7280;
          padding: 10px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .resend-btn:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .resend-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .back-btn {
          background: none;
          border: 1px solid #e5e7eb;
          color: #6b7280;
          padding: 10px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-btn:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        #recaptcha-container {
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
} 