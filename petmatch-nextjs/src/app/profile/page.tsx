'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import FirebasePhoneVerification from '@/components/FirebasePhoneVerification';
import { apiService } from '@/lib/api';

export default function ProfilePage() {
  const { user, isAuthenticated } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: ''
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      setProfileData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || ''
      });
    }
  }, [user, isAuthenticated]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiService.updateUserProfile(profileData);
      setSuccess('تم تحديث الملف الشخصي بنجاح');
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في التحديث');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneVerificationComplete = () => {
    setShowPhoneVerification(false);
    setSuccess('تم التحقق من رقم الهاتف بنجاح!');
  };

  return (
    <ProtectedRoute message="يجب تسجيل الدخول لعرض الملف الشخصي">
      <Content />
    </ProtectedRoute>
  );

  function Content() {
    return (
    <div className="profile-page">
      <div className="container">
        <div className="profile-card fade-in">
          {/* Header */}
          <div className="profile-header">
            <div className="profile-info">
              <h1>الملف الشخصي</h1>
              <p>إدارة معلوماتك الشخصية</p>
            </div>
            
            <div className="profile-avatar">
              <i className="fas fa-user"></i>
            </div>
          </div>

          {/* Phone Verification Status */}
          {user?.phone && (
            <div className={`verification-status ${user.is_phone_verified ? 'verified' : 'unverified'}`}>
              <div className="verification-info">
                <i className={`fas ${user.is_phone_verified ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}></i>
                <div className="verification-text">
                  <div className="verification-title">
                    {user.is_phone_verified ? 'تم التحقق من رقم الهاتف' : 'لم يتم التحقق من رقم الهاتف'}
                  </div>
                  <div className="verification-subtitle">
                    {user.is_phone_verified 
                      ? 'رقم هاتفك موثق ومؤكد' 
                      : 'يرجى التحقق من رقم الهاتف لزيادة الأمان'}
                  </div>
                </div>
              </div>
              
              {!user.is_phone_verified && (
                <button
                  onClick={() => setShowPhoneVerification(true)}
                  className="verify-btn"
                >
                  التحقق الآن
                </button>
              )}
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="message error-message slide-in-right">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="message success-message slide-in-right">
              <i className="fas fa-check-circle"></i>
              <span>{success}</span>
            </div>
          )}

          {/* Profile Form */}
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="first_name">الاسم الأول</label>
                <input
                  type="text"
                  id="first_name"
                  name="first_name"
                  value={profileData.first_name}
                  onChange={handleChange}
                  disabled={!editing}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="last_name">اسم العائلة</label>
                <input
                  type="text"
                  id="last_name"
                  name="last_name"
                  value={profileData.last_name}
                  onChange={handleChange}
                  disabled={!editing}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="email">البريد الإلكتروني</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={profileData.email}
                  onChange={handleChange}
                  disabled={!editing}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="phone">
                  رقم الهاتف
                  {user?.is_phone_verified && (
                    <span className="verified-badge">
                      <i className="fas fa-check-circle"></i>
                      موثق
                    </span>
                  )}
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={profileData.phone}
                  onChange={handleChange}
                  disabled={!editing}
                  className="form-input"
                  placeholder="01xxxxxxxxx"
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="address">العنوان</label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={profileData.address}
                  onChange={handleChange}
                  disabled={!editing}
                  className="form-input"
                  placeholder="المدينة، المحافظة"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="form-actions">
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn btn-primary"
                >
                  <i className="fas fa-edit"></i>
                  تعديل البيانات
                </button>
              ) : (
                <div className="edit-actions">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading ? (
                      <>
                        <div className="loading-spinner"></div>
                        جاري الحفظ...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save"></i>
                        حفظ التغييرات
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setError('');
                      setSuccess('');
                      // Reset form data
                      if (user) {
                        setProfileData({
                          first_name: user.first_name || '',
                          last_name: user.last_name || '',
                          email: user.email || '',
                          phone: user.phone || '',
                          address: user.address || ''
                        });
                      }
                    }}
                    className="btn btn-outline"
                  >
                    <i className="fas fa-times"></i>
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Phone Verification Modal */}
      {showPhoneVerification && (
        <FirebasePhoneVerification
          onClose={() => setShowPhoneVerification(false)}
          onVerificationComplete={handlePhoneVerificationComplete}
        />
      )}

      <style jsx>{`
        .profile-page {
          min-height: 100vh;
          background: var(--bg);
          padding-bottom: var(--gap);
        }

        .unauthorized-page {
          min-height: 100vh;
          background: var(--bg);
        }

        .unauthorized-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 4rem var(--container-padding);
          text-align: center;
        }

        .unauthorized-content i {
          font-size: 4rem;
          color: var(--muted-light);
          margin-bottom: 2rem;
        }

        .unauthorized-content h1 {
          font-size: clamp(1.5rem, 4vw, 2rem);
          color: var(--dark);
          margin-bottom: 1rem;
        }

        .unauthorized-content p {
          color: var(--muted);
          font-size: 1.1rem;
        }

        .profile-card {
          background: white;
          border-radius: var(--card-radius);
          padding: clamp(1.5rem, 4vw, 2rem);
          box-shadow: var(--shadow-lg);
          max-width: 800px;
          margin: 0 auto;
        }

        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid var(--gray-100);
        }

        @media (max-width: 768px) {
          .profile-header {
            flex-direction: column;
            text-align: center;
            gap: 1.5rem;
          }
        }

        .profile-info h1 {
          font-size: clamp(1.8rem, 5vw, 2rem);
          color: var(--dark);
          margin-bottom: 0.5rem;
          font-weight: 800;
        }

        .profile-info p {
          color: var(--muted);
          font-size: 1.1rem;
        }

        .profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 2rem;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .profile-avatar {
            width: 100px;
            height: 100px;
            font-size: 2.5rem;
          }
        }

        .verification-status {
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .verification-status {
            flex-direction: column;
            align-items: stretch;
            text-align: center;
            gap: 1rem;
          }
        }

        .verification-status.verified {
          background: #f0fdf4;
          border: 2px solid #bbf7d0;
        }

        .verification-status.unverified {
          background: #fff7ed;
          border: 2px solid #fed7aa;
        }

        .verification-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        @media (max-width: 768px) {
          .verification-info {
            justify-content: center;
          }
        }

        .verification-status.verified .verification-info i {
          color: #16a34a;
          font-size: 20px;
        }

        .verification-status.unverified .verification-info i {
          color: #ea580c;
          font-size: 20px;
        }

        .verification-title {
          font-weight: 600;
        }

        .verification-status.verified .verification-title {
          color: #16a34a;
        }

        .verification-status.unverified .verification-title {
          color: #ea580c;
        }

        .verification-subtitle {
          font-size: 14px;
          opacity: 0.8;
        }

        .verification-status.verified .verification-subtitle {
          color: #16a34a;
        }

        .verification-status.unverified .verification-subtitle {
          color: #ea580c;
        }

        .verify-btn {
          background: #ea580c;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: var(--button-radius);
          font-size: 14px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
          min-height: 44px;
        }

        .verify-btn:hover {
          background: #dc2626;
          transform: translateY(-2px);
        }

        .message {
          padding: 1rem;
          border-radius: var(--button-radius);
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 500;
        }

        .error-message {
          background: #fee;
          color: #c53030;
          border: 1px solid #fed7d7;
        }

        .success-message {
          background: #f0fff4;
          color: #2d7738;
          border: 1px solid #9ae6b4;
        }

        .profile-form {
          margin-top: 1rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-group label {
          font-weight: 600;
          color: var(--dark);
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .verified-badge {
          background: var(--success);
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid var(--gray-200);
          border-radius: var(--button-radius);
          font-size: 1rem;
          font-family: "Cairo", sans-serif;
          transition: all 0.3s ease;
          background: white;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-input:disabled {
          background: var(--gray-50);
          color: var(--muted);
          cursor: not-allowed;
        }

        .form-actions {
          text-align: center;
          padding-top: 1.5rem;
          border-top: 2px solid var(--gray-100);
        }

        .edit-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        @media (max-width: 480px) {
          .edit-actions {
            flex-direction: column;
          }
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: var(--button-radius);
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border: 2px solid transparent;
          min-height: 44px;
          font-family: "Cairo", sans-serif;
        }

        .btn-primary {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--primary-dark);
          transform: translateY(-2px);
          box-shadow: var(--shadow-lg);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .btn-outline {
          background: transparent;
          color: var(--muted);
          border-color: var(--gray-300);
        }

        .btn-outline:hover {
          background: var(--gray-50);
          color: var(--dark);
          border-color: var(--gray-400);
        }

        /* Touch improvements */
        @media (hover: none) and (pointer: coarse) {
          .btn,
          .verify-btn {
            min-height: 44px;
            min-width: 44px;
          }
        }

        /* Enhanced animations */
        @media (prefers-reduced-motion: no-preference) {
          .form-group:nth-child(1) { animation: fadeInUp 0.6s ease 0.1s both; }
          .form-group:nth-child(2) { animation: fadeInUp 0.6s ease 0.2s both; }
          .form-group:nth-child(3) { animation: fadeInUp 0.6s ease 0.3s both; }
          .form-group:nth-child(4) { animation: fadeInUp 0.6s ease 0.4s both; }
          .form-group:nth-child(5) { animation: fadeInUp 0.6s ease 0.5s both; }
        }
      `}</style>
    </div>
    );
  }
} 