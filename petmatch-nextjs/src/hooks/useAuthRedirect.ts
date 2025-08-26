'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

interface UseAuthRedirectOptions {
  requireAuth?: boolean;
  redirectTo?: string;
  onLoginRequired?: () => void;
}

export const useAuthRedirect = (options: UseAuthRedirectOptions = {}) => {
  const { 
    requireAuth = true, 
    redirectTo = '/', 
    onLoginRequired 
  } = options;
  
  const { isAuthenticated, loading } = useAuth();
  const [shouldShowLogin, setShouldShowLogin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const hasStoredPath = useRef(false);
  const originalPath = useRef<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setAuthChecked(true);
      
      if (requireAuth && !isAuthenticated && !hasStoredPath.current) {
        // حفظ الصفحة الحالية في localStorage مرة واحدة فقط
        if (typeof window !== 'undefined') {
          // حفظ المسار الأصلي إذا لم يكن محفوظاً
          if (!originalPath.current) {
            originalPath.current = pathname;
          }
          localStorage.setItem('redirectAfterLogin', originalPath.current);
          hasStoredPath.current = true;
        }
        setShouldShowLogin(true);
        if (onLoginRequired) {
          onLoginRequired();
        }
      } else if (isAuthenticated) {
        setShouldShowLogin(false);
        hasStoredPath.current = false;
        originalPath.current = null;
      }
    }
  }, [isAuthenticated, loading, requireAuth, onLoginRequired, pathname]);

  // function للعودة للصفحة المطلوبة بعد تسجيل الدخول
  const redirectToOriginalPage = () => {
    if (typeof window !== 'undefined') {
      const savedPath = localStorage.getItem('redirectAfterLogin');
      if (savedPath && savedPath !== pathname) {
        localStorage.removeItem('redirectAfterLogin');
        hasStoredPath.current = false;
        originalPath.current = null;
        router.push(savedPath);
        return true;
      }
    }
    return false;
  };

  return {
    isAuthenticated,
    loading,
    shouldShowLogin,
    authChecked,
    setShouldShowLogin,
    redirectToOriginalPage
  };
}; 