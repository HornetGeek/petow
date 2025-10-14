import { Platform, PermissionsAndroid, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { apiService } from './api';

const FCM_TOKEN_KEY = 'fcmToken';
const NOTIFICATION_PERMISSION_ASKED_KEY = 'notificationPermissionAsked';

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    return enabled;
  } catch (e) {
    console.warn('Notifications: requestPermission failed', e);
    return false;
  }
}

export async function getAndRegisterFcmToken(): Promise<string | null> {
  try {
    const token = await messaging().getToken();
    if (token) {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
      // Try to send to backend (optional; backend endpoint may vary)
      try {
        await apiService.registerPushToken(token, Platform.OS);
      } catch (err) {
        console.log('Notifications: registerPushToken failed (non-fatal)', err);
      }
      return token;
    }
  } catch (e) {
    console.warn('Notifications: getToken failed', e);
  }
  return null;
}

function isBreedingRequestNotification(remoteMessage?: FirebaseMessagingTypes.RemoteMessage | null): boolean {
  const type = remoteMessage?.data?.type;
  return typeof type === 'string' && type.startsWith('breeding_request');
}

function isClinicChatNotification(remoteMessage?: FirebaseMessagingTypes.RemoteMessage | null): boolean {
  const type = (remoteMessage?.data?.type || '').toString();
  // Support multiple backend variants
  return (
    type === 'clinic_chat_message' ||
    type === 'chat_message_received' ||
    type === 'chat-message' ||
    // Fallback: if a chat id is present, consider it a chat notification
    !!(remoteMessage?.data?.firebase_chat_id || remoteMessage?.data?.chat_room_id || remoteMessage?.data?.chat_id)
  );
}

async function navigateToClinicChat(firebaseChatId?: string | null | undefined) {
  if (!firebaseChatId) {
    return;
  }

  const deepLink = `petow://clinic-chat?firebase_chat_id=${encodeURIComponent(String(firebaseChatId))}`;
  try {
    const canOpen = await Linking.canOpenURL(deepLink);
    if (!canOpen) {
      console.warn('Notifications: clinic chat deep link not handled, attempting fallback', deepLink);
    }
    await Linking.openURL(deepLink);
  } catch (error) {
    console.warn('Notifications: navigation to clinic chat failed', error);
  }
}

async function navigateToBreedingRequests(breedingRequestId?: string | number) {
  const baseUrl = 'petow://breeding-requests';
  const url = breedingRequestId ? `${baseUrl}?breeding_request_id=${encodeURIComponent(String(breedingRequestId))}` : baseUrl;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      console.warn('Notifications: deep link not registered, attempting fallback navigation', url);
    }
    await Linking.openURL(url);
  } catch (error) {
    console.warn('Notifications: navigation to breeding requests failed', error);
  }
}

export function setupNotificationHandlers() {
  // Foreground messages
  messaging().onMessage(async (remoteMessage) => {
    console.log('Notifications: foreground message', remoteMessage);
  });

  // App opened from background state via notification
  messaging().onNotificationOpenedApp(async (remoteMessage) => {
    console.log('Notifications: opened from background', remoteMessage?.data);
    if (isBreedingRequestNotification(remoteMessage)) {
      const raw = remoteMessage?.data?.breeding_request_id as unknown;
      const id = typeof raw === 'string' || typeof raw === 'number' ? raw : undefined;
      await navigateToBreedingRequests(id as any);
    } else if (isClinicChatNotification(remoteMessage)) {
      const raw = (remoteMessage?.data?.firebase_chat_id
        ?? remoteMessage?.data?.chat_room_id
        ?? remoteMessage?.data?.chat_id);
      const chatId = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
      await navigateToClinicChat(chatId);
    }
  });

  // App opened from quit state via notification
  messaging()
    .getInitialNotification()
    .then(async (remoteMessage) => {
      if (remoteMessage) {
        console.log('Notifications: opened from quit state', remoteMessage?.data);
        if (isBreedingRequestNotification(remoteMessage)) {
          const raw = remoteMessage?.data?.breeding_request_id as unknown;
          const id = typeof raw === 'string' || typeof raw === 'number' ? raw : undefined;
          await navigateToBreedingRequests(id as any);
        } else if (isClinicChatNotification(remoteMessage)) {
          const raw = (remoteMessage?.data?.firebase_chat_id
            ?? remoteMessage?.data?.chat_room_id
            ?? remoteMessage?.data?.chat_id);
          const chatId = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
          await navigateToClinicChat(chatId);
        }
      }
    });

  // Token refresh
  messaging().onTokenRefresh(async (token) => {
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    try {
      await apiService.registerPushToken(token, Platform.OS);
    } catch (err) {
      console.log('Notifications: onTokenRefresh register failed (non-fatal)', err);
    }
  });
}

// Check if we should show permission request
export async function shouldShowNotificationPermissionRequest(): Promise<boolean> {
  try {
    const authStatus = await messaging().hasPermission();
    const alreadyAsked = await AsyncStorage.getItem(NOTIFICATION_PERMISSION_ASKED_KEY);
    
    const shouldShow = authStatus !== messaging.AuthorizationStatus.AUTHORIZED && 
                      authStatus !== messaging.AuthorizationStatus.PROVISIONAL && 
                      !alreadyAsked;
    
    return shouldShow;
  } catch (e) {
    console.error('❌ Error checking notification permission status:', e);
    return false;
  }
}

// Mark that we've asked for permission
export async function markNotificationPermissionAsked(): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, 'true');
}

// Check Android system-level notification permission
async function checkAndroidSystemPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true; // iOS handles this differently
  }
  
  try {
    // For Android 13+ (API level 33+), check POST_NOTIFICATIONS permission
    if (Platform.Version >= 33) {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      console.log('📋 Android POST_NOTIFICATIONS permission:', granted);
      return granted;
    } else {
      // For older Android versions, notifications are enabled by default
      console.log('📋 Android version < 13, notifications enabled by default');
      return true;
    }
  } catch (error) {
    console.error('❌ Error checking Android permission:', error);
    return false;
  }
}

// Request Android system-level notification permission
async function requestAndroidSystemPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return true;
  }
  
  try {
    console.log('📱 Requesting Android POST_NOTIFICATIONS permission...');
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'تفعيل الإشعارات',
        message: 'يحتاج PetMatch إلى إذن الإشعارات لإرسال تنبيهات عن الحيوانات الأليفة والرسائل',
        buttonNeutral: 'اسأل لاحقاً',
        buttonNegative: 'إلغاء',
        buttonPositive: 'موافق',
      }
    );
    
    const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
    console.log('📋 Android permission result:', granted, 'Granted:', isGranted);
    return isGranted;
  } catch (error) {
    console.error('❌ Error requesting Android permission:', error);
    return false;
  }
}

// Enhanced permission request with better UX
export async function requestNotificationPermissionWithUX(): Promise<boolean> {
  try {
    // Check current permissions
    const currentStatus = await messaging().hasPermission();
    const androidPermission = await checkAndroidSystemPermission();
    
    // Request Android system permission if needed
    if (!androidPermission) {
      const androidGranted = await requestAndroidSystemPermission();
      if (!androidGranted) {
        await markNotificationPermissionAsked();
        return false;
      }
    }
    
    // Request Firebase permission
    await markNotificationPermissionAsked();
    
    const authStatus = await messaging().requestPermission({
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      provisional: false,
      sound: true,
    });
    
    const firebaseEnabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    
    // Final verification
    const finalAndroidCheck = await checkAndroidSystemPermission();
    const overallSuccess = firebaseEnabled && finalAndroidCheck;
    
    return overallSuccess;
  } catch (e) {
    console.error('❌ Permission request failed with error:', e);
    return false;
  }
}

export async function initNotifications() {
  const granted = await requestNotificationPermission();
  if (!granted && Platform.OS === 'android') {
    // On Android 13+, permission is required; on older versions, notifications still work.
    console.log('Notifications: permission not granted');
  }
  await getAndRegisterFcmToken();
  setupNotificationHandlers();
}

