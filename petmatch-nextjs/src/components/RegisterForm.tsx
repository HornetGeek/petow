'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onClose?: () => void;
  onAuthSuccess?: () => void;
}

export default function RegisterForm({ onSwitchToLogin, onClose, onAuthSuccess }: RegisterFormProps) {
  const [formData, setFormData] = useState({
    email: '',
    password1: '',
    password2: '',
    first_name: '',
    last_name: '',
    phone: '',
    address: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { register } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password1 !== formData.password2) {
      setError('كلمات المرور غير متطابقة');
      return;
    }

    if (formData.password1.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    if (!formData.phone.trim()) {
      setError('رقم الهاتف مطلوب');
      return;
    }

    // تحقق من صيغة رقم الهاتف (رقم سعودي أو مصري)
    const phoneRegex = /^(\+966|0)?[5-9]\d{8}$|^(\+20|0)?1[0-5]\d{8}$/;
    if (!phoneRegex.test(formData.phone.replace(/\s/g, ''))) {
      setError('رقم الهاتف غير صحيح. يرجى إدخال رقم سعودي أو مصري صحيح');
      return;
    }

    setLoading(true);

    try {
      await register(formData);
      onAuthSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <div className="auth-form">
        <div className="auth-header">
          <h2>إنشاء حساب جديد</h2>
          <p>انضم إلى مجتمع Peto</p>
        </div>

        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="first_name">الاسم الأول</label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
                placeholder="الاسم الأول"
              />
            </div>

            <div className="form-group">
              <label htmlFor="last_name">اسم العائلة</label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
                placeholder="اسم العائلة"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="أدخل بريدك الإلكتروني"
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">رقم الهاتف <span className="required">*</span></label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              placeholder="رقم الهاتف مطلوب"
            />
          </div>

          <div className="form-group">
            <label htmlFor="address">العنوان</label>
            <input
              type="text"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="العنوان (اختياري)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password1">كلمة المرور</label>
            <input
              type="password"
              id="password1"
              name="password1"
              value={formData.password1}
              onChange={handleChange}
              required
              placeholder="كلمة المرور (8 أحرف على الأقل)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password2">تأكيد كلمة المرور</label>
            <input
              type="password"
              id="password2"
              name="password2"
              value={formData.password2}
              onChange={handleChange}
              required
              placeholder="أعد كتابة كلمة المرور"
            />
          </div>

          <button 
            type="submit" 
            className="submit-btn" 
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                جاري إنشاء الحساب...
              </>
            ) : (
              <>
                <i className="fas fa-user-plus"></i>
                إنشاء حساب جديد
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            لديك حساب بالفعل؟{' '}
            <button 
              type="button" 
              className="link-btn"
              onClick={onSwitchToLogin}
            >
              تسجيل الدخول
            </button>
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-form-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .auth-form {
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 500px;
          text-align: center;
        }

        .auth-header h2 {
          color: #333;
          margin-bottom: 10px;
          font-size: 2rem;
        }

        .auth-header p {
          color: #666;
          margin-bottom: 30px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 20px;
        }

        .form-group {
          margin-bottom: 20px;
          text-align: right;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 600;
        }

        .required {
          color: #e53e3e;
          font-weight: bold;
        }

        .form-group input {
          width: 100%;
          padding: 15px;
          border: 2px solid #e1e5e9;
          border-radius: 10px;
          font-size: 16px;
          transition: border-color 0.3s ease;
          text-align: right;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
        }

        .submit-btn {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error-message {
          background: #fee;
          color: #c53030;
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: right;
        }

        .auth-footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e1e5e9;
        }

        .link-btn {
          background: none;
          border: none;
          color: #667eea;
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
        }

        .link-btn:hover {
          color: #764ba2;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
} 