'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService, User } from '@/lib/api';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    email: string;
    password1: string;
    password2: string;
    first_name: string;
    last_name: string;
    phone: string;
    address?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in on app load
    const token = localStorage.getItem('authToken');
    if (token) {
      loadUserProfile();
    } else {
      setLoading(false);
    }

    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setFirebaseUser(firebaseUser);
    });

    return unsubscribe;
  }, []);

  const loadUserProfile = async () => {
    try {
      console.log('Debug - Loading user profile...');
      const userData = await apiService.getUserProfile();
      console.log('Debug - User profile loaded:', userData);
      setUser(userData);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      // Token might be invalid, clear it
      localStorage.removeItem('authToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await apiService.login(email, password);
      console.log('Debug - Login response:', response);
      setUser(response.user);
      localStorage.setItem('authToken', response.key);
      console.log('Debug - Token saved to localStorage:', response.key);
      
      // تحميل الملف الشخصي الكامل
      await loadUserProfile();
      
      // تأخير بسيط لضمان تحديث الحالة
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      throw error;
    }
  };

  const register = async (userData: {
    email: string;
    password1: string;
    password2: string;
    first_name: string;
    last_name: string;
    phone: string;
    address?: string;
  }) => {
    try {
      const response = await apiService.register(userData);
      setUser(response.user);
      localStorage.setItem('authToken', response.key);
      
      // تحميل الملف الشخصي الكامل
      await loadUserProfile();
      
      // تأخير بسيط لضمان تحديث الحالة
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('authToken');
    }
  };

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 