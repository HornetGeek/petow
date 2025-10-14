import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, ApiResponse, User } from '../services/api';
import { getAndRegisterFcmToken, shouldShowNotificationPermissionRequest } from '../services/notifications';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

type RegisterPayload = {
  email: string;
  password1: string;
  password2: string;
  first_name: string;
  last_name: string;
  phone?: string;
};

type RegisterResult = {
  success: boolean;
  error?: string;
};

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterPayload) => Promise<RegisterResult>;
  logout: () => void;
  loading: boolean;
  shouldShowNotificationModal: boolean;
  setShouldShowNotificationModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [shouldShowNotificationModal, setShouldShowNotificationModal] = useState(false);

  // Ask for location once and save a readable address to the user's profile (best-effort)
  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'ios') {
        const status = await Geolocation.requestAuthorization('whenInUse');
        return status === 'granted';
      }
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'السماح بالوصول إلى الموقع',
            message: 'نحتاج إذنك لمعرفة موقعك لعرض الحيوانات القريبة وتخصيص التجربة',
            buttonPositive: 'موافقة',
            buttonNegative: 'رفض',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return false;
    } catch {
      return false;
    }
  };

  const getCurrentCoords = async (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (pos) => {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=ar,en`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': 'PetMatchMobile/1.0 (contact@petmatch.com)',
            'Accept': 'application/json',
          },
        }
      );
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      const full: string | undefined = data?.display_name;
      if (full && full.length) {
        const parts = full.split(', ');
        return parts.slice(0, 3).join(', ');
      }
      return null;
    } catch {
      return null;
    }
  };

  const captureAndSaveUserLocation = async (currentUser?: User | null) => {
    try {
      const effectiveUser = currentUser ?? user;
      // If user has no address, force a run regardless of throttle
      const mustRun = !!effectiveUser && (!effectiveUser.address || effectiveUser.address.trim().length < 3);

      // Throttle: once per 12 hours (unless mustRun)
      const lastTs = await AsyncStorage.getItem('user_location_saved_at');
      const now = Date.now();
      if (!mustRun && lastTs) {
        const deltaHrs = (now - Number(lastTs)) / (1000 * 60 * 60);
        if (deltaHrs < 12) {
          return;
        }
      }

      const granted = await requestLocationPermission();
      if (!granted) return;
      const coords = await getCurrentCoords();
      if (!coords) return;
      let addr = await reverseGeocode(coords.lat, coords.lng);

      // Always send latitude/longitude; only set address if it's missing to avoid overriding user-entered value
      if (effectiveUser) {
        const payload: any = { latitude: coords.lat, longitude: coords.lng };
        if (!effectiveUser.address || effectiveUser.address.trim().length < 3) {
          // Fallback to coordinates string if reverse geocoding failed
          if (!addr) {
            addr = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
          }
          payload.address = addr;
        }
        console.log('📍 Updating user profile location payload:', payload);
        const resp = await apiService.updateProfile(payload);
        console.log('📍 Update profile response:', resp);
        if (resp.success && resp.data) {
          // Update local user state so UI reflects new address immediately
          setUser(resp.data as any);
        }
      }

      await AsyncStorage.setItem('user_location_saved_at', String(now));
      await AsyncStorage.setItem('user_location_last_addr', addr || '');
      await AsyncStorage.setItem('user_location_last_coords', JSON.stringify(coords));
    } catch {
      // ignore errors; best-effort only
    }
  };

  // Check for existing token on app start
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        console.log('🔍 Checking authentication status...');
        const token = await AsyncStorage.getItem('authToken');
        
        if (token) {
          console.log('🔑 Token found, verifying with server...');
          // Verify token with server - FIXED: Changed getUserProfile() to getProfile()
          const response = await apiService.getProfile();
          
          if (response.success && response.data) {
            console.log('✅ Token valid, user logged in:', response.data);
            setUser(response.data);
            // Capture and save user location (best-effort)
            captureAndSaveUserLocation(response.data);
            
            // Register FCM token for existing authenticated user
            try {
              console.log('📱 Registering FCM token for existing user...');
              await getAndRegisterFcmToken();
              console.log('✅ FCM token registered successfully');
            } catch (error) {
              console.log('⚠️ FCM token registration failed (non-fatal):', error);
            }
          } else {
            console.log('❌ Token invalid, clearing storage');
            await AsyncStorage.removeItem('authToken');
          }
        } else {
          console.log('⚠️ No token found');
        }
      } catch (error) {
        console.error('❌ Error checking auth status:', error);
        // Clear invalid token
        await AsyncStorage.removeItem('authToken');
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // On app start, if notifications are not granted and we haven't asked yet,
  // show the permission modal so the system prompt can be triggered again.
  useEffect(() => {
    const maybeShowNotificationModal = async () => {
      try {
        const shouldShow = await shouldShowNotificationPermissionRequest();
        if (shouldShow) {
          setShouldShowNotificationModal(true);
        }
      } catch (error) {
        // non-fatal
      }
    };
    maybeShowNotificationModal();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    console.log('🔐 AuthContext: Attempting login with:', { email, password: '***' });
    setLoading(true);
    
    try {
      const response: ApiResponse<any> = await apiService.login(email, password);
      console.log('📡 AuthContext: Login API Response:', response);
      
      // Handle different response structures
      let userData = null;
      if (response.success && response.data) {
        // Check if user data is directly in data or nested
        userData = response.data.user || response.data;
        console.log('👤 Extracted user data:', userData);
      }
      
      if (userData && userData.email) {
        console.log('✅ AuthContext: Login successful, setting user:', userData);
        setUser(userData);
        // Capture and save user location on login
        captureAndSaveUserLocation(userData);
        
        // Register FCM token after successful login
        try {
          console.log('📱 Registering FCM token after login...');
          await getAndRegisterFcmToken();
          console.log('✅ FCM token registered successfully');
        } catch (error) {
          console.log('⚠️ FCM token registration failed (non-fatal):', error);
        }
        
        // Check if we should show notification permission modal
        try {
          const shouldShow = await shouldShowNotificationPermissionRequest();
          if (shouldShow) {
            console.log('📱 Should show notification permission modal');
            setShouldShowNotificationModal(true);
          }
        } catch (error) {
          console.log('⚠️ Error checking notification permission status:', error);
        }
        
        setLoading(false);
        return true;
      } else {
        console.log('❌ AuthContext: Login failed - no valid user data:', response);
        setLoading(false);
        return false;
      }
    } catch (error) {
      console.error('💥 AuthContext: Login error:', error);
      setLoading(false);
      return false;
    }
  };

  const register = async (userData: RegisterPayload): Promise<RegisterResult> => {
    console.log('📝 AuthContext: Attempting registration with:', {
      ...userData,
      password1: '***',
      password2: '***',
    });
    setLoading(true);

    try {
      const response: ApiResponse<any> = await apiService.register(userData);
      console.log('📡 AuthContext: Register API Response:', response);

      let user = null;
      if (response.success && response.data) {
        user = response.data.user || response.data;
        console.log('👤 Extracted user data:', user);
      }

      if (user && user.email) {
        console.log('✅ AuthContext: Registration successful, setting user:', user);
        setUser(user);
        // Capture and save user location on register
        captureAndSaveUserLocation(user);
        
        // Register FCM token after successful registration
        try {
          console.log('📱 Registering FCM token after registration...');
          await getAndRegisterFcmToken();
          console.log('✅ FCM token registered successfully');
        } catch (error) {
          console.log('⚠️ FCM token registration failed (non-fatal):', error);
        }
        
        return { success: true };
      }

      console.log('❌ AuthContext: Registration failed - no valid user data:', response);
      return {
        success: false,
        error: response.error || 'تعذر إنشاء الحساب، حاول مرة أخرى',
      };
    } catch (error) {
      console.error('💥 AuthContext: Registration error:', error);
      return {
        success: false,
        error: 'حدث خطأ أثناء إنشاء الحساب',
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    console.log('🚪 AuthContext: Logging out user');
    setUser(null);
    await apiService.logout();
  };

  const value: AuthContextType = {
    user,
    login,
    register,
    logout,
    loading,
    shouldShowNotificationModal,
    setShouldShowNotificationModal,
  };

  console.log('🔄 AuthContext: Current state:', { user: user ? 'logged in' : 'not logged in', loading });

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
