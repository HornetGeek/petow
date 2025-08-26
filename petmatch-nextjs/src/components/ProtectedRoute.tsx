'use client';
import { ReactNode, useState, useEffect } from 'react';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import AuthModal from './AuthModal';
import LoadingSpinner from './LoadingSpinner';
import Header from './Header';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  fallback?: ReactNode;
  message?: string;
}

export default function ProtectedRoute({ 
  children, 
  requireAuth = true, 
  fallback,
  message = "يجب تسجيل الدخول للوصول لهذه الصفحة"
}: ProtectedRouteProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [initialMode, setInitialMode] = useState<'login' | 'register'>('login');
  const [authCompleted, setAuthCompleted] = useState(false);

  const { isAuthenticated, loading, shouldShowLogin, authChecked, redirectToOriginalPage } = useAuthRedirect({
    requireAuth,
    onLoginRequired: () => {
      setShowAuthModal(true);
      setInitialMode('login');
    }
  });

  // إعادة تعيين authCompleted عند تغيير حالة المصادقة
  useEffect(() => {
    if (isAuthenticated && !authCompleted) {
      setAuthCompleted(true);
    }
  }, [isAuthenticated, authCompleted]);

  if (loading || !authChecked) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--bg-light)'
      }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (isAuthenticated || !requireAuth) {
    return (
      <>
        <Header />
        {children}
      </>
    );
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <>
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--bg-light)',
        padding: '2rem'
      }}>
        <div style={{ 
          textAlign: 'center', 
          maxWidth: '500px',
          background: 'white',
          padding: '3rem',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            fontSize: '4rem', 
            color: 'var(--primary)', 
            marginBottom: '1rem' 
          }}>
            🔒
          </div>
          <h1 style={{ 
            fontSize: '1.8rem', 
            marginBottom: '1rem', 
            color: 'var(--text-primary)' 
          }}>
            تسجيل الدخول مطلوب
          </h1>
          <p style={{ 
            fontSize: '1.1rem', 
            marginBottom: '2rem', 
            color: 'var(--text-secondary)',
            lineHeight: '1.6'
          }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button 
              onClick={() => {
                setShowAuthModal(true);
                setInitialMode('login');
              }}
              style={{
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              تسجيل الدخول
            </button>
            <button 
              onClick={() => {
                setShowAuthModal(true);
                setInitialMode('register');
              }}
              style={{
                background: 'var(--secondary)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              إنشاء حساب
            </button>
          </div>
        </div>
      </div>

      {/* نافذة المصادقة */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={initialMode}
        onAuthSuccess={() => {
          setShowAuthModal(false);
          // العودة للصفحة المطلوبة بعد تسجيل الدخول مع تأخير بسيط
          setTimeout(() => {
            redirectToOriginalPage();
          }, 200);
        }}
      />
    </>
  );
} 