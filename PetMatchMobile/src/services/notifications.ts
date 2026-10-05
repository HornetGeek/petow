import { Platform, PermissionsAndroid, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  EventType,
  type Event as NotifeeEvent,
  type Notification as NotifeeNotification,
} from '@notifee/react-native';
import { apiService } from './api';
import { fetchFeatureFlags } from './featureFlags';

const FCM_TOKEN_KEY = 'fcmToken';
const NOTIFICATION_PERMISSION_ASKED_KEY = 'notificationPermissionAsked';

const DEFAULT_CHANNEL_ID = 'petow-actionable';
const ACTION_IDS = {
  BREEDING_APPROVE: 'breeding_approve',
  BREEDING_REJECT: 'breeding_reject',
  ADOPTION_APPROVE: 'adoption_approve',
  ADOPTION_REJECT: 'adoption_reject',
};
const IOS_CATEGORY_REQUEST = 'petow-request-actions';
const NOTIFICATIONS_DEEP_LINK = 'petow://notifications';
const NAVIGATION_DEDUP_WINDOW_MS = 1500;
const BREEDING_NOTIFICATION_TYPES = new Set([
  'breeding_request_received',
  'breeding_request_approved',
  'breeding_request_rejected',
  'breeding_request_pending_reminder',
  'breeding_request_completed',
]);
const ADOPTION_NOTIFICATION_TYPES = new Set([
  'adoption_request_received',
  'adoption_request_pending_reminder',
  'adoption_request_approved',
]);
const PET_DETAILS_NOTIFICATION_TYPES = new Set([
  'pet_nearby',
  'adoption_pet_nearby',
  'pet_status_changed',
]);
const CHAT_NOTIFICATION_TYPES = new Set([
  'chat_message_received',
  'clinic_chat_message',
  'chat-message',
]);

let handlersConfigured = false;
let foregroundNotifeeUnsubscribe: (() => void) | null = null;
let messagingForegroundUnsubscribe: (() => void) | null = null;
let lastNavigationSignature = '';
let lastNavigationAt = 0;

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // On iOS, register for remote messages first (required before getting token)
    if (Platform.OS === 'ios') {
      if (!messaging().isDeviceRegisteredForRemoteMessages) {
        await messaging().registerDeviceForRemoteMessages();
      }
    }
    
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
    // On iOS, we must register for remote messages before getting the token
    if (Platform.OS === 'ios') {
      const isRegistered = messaging().isDeviceRegisteredForRemoteMessages;
      if (!isRegistered) {
        try {
          await messaging().registerDeviceForRemoteMessages();
        } catch (registerError) {
          console.warn('Notifications: registerDeviceForRemoteMessages failed', registerError);
          return null;
        }
      }
      // Double-check after registration attempt
      if (!messaging().isDeviceRegisteredForRemoteMessages) {
        console.warn('Notifications: device not registered for remote messages');
        return null;
      }
    }
    
    // Wrap getToken in its own try-catch since iOS can still fail even if isDeviceRegisteredForRemoteMessages is true
    let token: string | null = null;
    try {
      token = await messaging().getToken();
    } catch (tokenError) {
      console.warn('Notifications: getToken failed (device may not be fully registered)', tokenError);
      return null;
    }
    
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

function getTypeFromAny(source: any): string {
  if (!source) {
    return '';
  }

  if (typeof source === 'string') {
    return source;
  }

  if (typeof source === 'object') {
    if ('data' in source && source.data) {
      const nested = getTypeFromAny((source as any).data);
      if (nested) {
        return nested;
      }
    }
    if ('type' in source && typeof (source as any).type === 'string') {
      return (source as any).type as string;
    }
  }

  return '';
}

function parseNumericId(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getDataValueAsString(data: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const raw = data[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = String(raw).trim();
    if (value.length > 0) {
      return value;
    }
  }
  return null;
}

function withQuery(baseUrl: string, key: string, rawValue?: string | number | null): string {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return baseUrl;
  }
  return `${baseUrl}?${key}=${encodeURIComponent(String(rawValue))}`;
}

async function buildDeepLinkFromPayload(data: Record<string, any>): Promise<string> {
  const payloadDeepLink = getDataValueAsString(data, ['deep_link', 'deeplink']);
  if (payloadDeepLink) {
    return payloadDeepLink;
  }

  const type = getTypeFromAny({ data }).toLowerCase();
  const firebaseChatId = getDataValueAsString(data, ['firebase_chat_id', 'chat_id', 'chat_room_id']);

  // Stage 1 + flag-on: route *_received pushes to the chat thread directly.
  if (firebaseChatId &&
      (type === 'breeding_request_received' || type === 'adoption_request_received')) {
    try {
      const flags = await fetchFeatureFlags(false);
      if (flags.requestChatV2Enabled) {
        return withQuery('petow://clinic-chat', 'firebase_chat_id', firebaseChatId);
      }
    } catch {
      // fall through to legacy inbox deeplink
    }
  }

  if (BREEDING_NOTIFICATION_TYPES.has(type)) {
    const requestId = getDataValueAsString(data, ['breeding_request_id', 'request_id']);
    return withQuery('petow://breeding-requests', 'breeding_request_id', requestId);
  }

  if (ADOPTION_NOTIFICATION_TYPES.has(type)) {
    const requestId = getDataValueAsString(data, ['adoption_request_id', 'request_id']);
    return withQuery('petow://adoption-requests', 'adoption_request_id', requestId);
  }

  if (PET_DETAILS_NOTIFICATION_TYPES.has(type)) {
    const petId = getDataValueAsString(data, ['pet_id', 'related_pet', 'target_id']);
    return withQuery('petow://pet-details', 'pet_id', petId);
  }

  if (CHAT_NOTIFICATION_TYPES.has(type) || isClinicChatNotification({ data })) {
    const chatId = getDataValueAsString(data, ['firebase_chat_id', 'chat_id', 'chat_room_id']);
    return withQuery('petow://clinic-chat', 'firebase_chat_id', chatId);
  }

  if (type === 'clinic_invite' || type === 'clinic_broadcast') {
    return withQuery(NOTIFICATIONS_DEEP_LINK, 'type', type);
  }

  if (
    type === 'system_message' ||
    type === 'app_update' ||
    type === 'system_issue_apology' ||
    type === 'recommended_pets' ||
    type === 'account_verification_approved'
  ) {
    return NOTIFICATIONS_DEEP_LINK;
  }

  return NOTIFICATIONS_DEEP_LINK;
}

function buildNavigationSignature(data: Record<string, any>, deepLink: string): string {
  const type = getTypeFromAny({ data }).toLowerCase() || 'unknown';
  const messageId = getDataValueAsString(data, ['message_id', 'google.message_id', 'notification_id']) || '';
  const requestId =
    getDataValueAsString(data, ['breeding_request_id', 'adoption_request_id', 'request_id']) || '';
  const petId = getDataValueAsString(data, ['pet_id']) || '';
  const chatId = getDataValueAsString(data, ['firebase_chat_id', 'chat_id', 'chat_room_id']) || '';
  return [type, messageId, requestId, petId, chatId, deepLink].join('|');
}

function shouldSkipNavigation(signature: string): boolean {
  const now = Date.now();
  if (
    signature &&
    signature === lastNavigationSignature &&
    now - lastNavigationAt < NAVIGATION_DEDUP_WINDOW_MS
  ) {
    return true;
  }
  lastNavigationSignature = signature;
  lastNavigationAt = now;
  return false;
}

async function ensureNotificationInfrastructure(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: DEFAULT_CHANNEL_ID,
        name: 'تنبيهات Petow',
        importance: AndroidImportance.HIGH,
        sound: 'default',
      });
    } else if (Platform.OS === 'ios') {
      await notifee.setNotificationCategories([
        {
          id: IOS_CATEGORY_REQUEST,
          actions: [
            { id: ACTION_IDS.BREEDING_APPROVE, title: 'قبول الطلب' },
            { id: ACTION_IDS.BREEDING_REJECT, title: 'رفض الطلب', destructive: true },
            { id: ACTION_IDS.ADOPTION_APPROVE, title: 'قبول التبني' },
            { id: ACTION_IDS.ADOPTION_REJECT, title: 'رفض التبني', destructive: true },
          ],
        },
      ]);
    }
  } catch (channelError) {
    console.warn('Notifications: ensureNotificationInfrastructure failed', channelError);
  }
}

function isClinicChatNotification(source?: any): boolean {
  const data = (source && 'data' in source ? (source as any).data : source) || {};
  const type = getTypeFromAny(source).toString().toLowerCase();
  return (
    type === 'clinic_chat_message' ||
    type === 'chat_message_received' ||
    type === 'chat-message' ||
    !!(data?.firebase_chat_id || data?.chat_room_id || data?.chat_id)
  );
}

async function openDeepLink(deepLink: string) {
  if (!deepLink) {
    return;
  }
  try {
    const canOpen = await Linking.canOpenURL(deepLink);
    if (!canOpen) {
      console.warn('Notifications: deep link not registered, attempting open anyway', deepLink);
    }
    await Linking.openURL(deepLink);
  } catch (error) {
    console.warn('Notifications: failed to open deep link', deepLink, error);
  }
}

async function handleNotificationNavigationFromData(data?: Record<string, any> | null) {
  if (!data || typeof data !== 'object') {
    return;
  }

  const deepLink = await buildDeepLinkFromPayload(data);
  const signature = buildNavigationSignature(data, deepLink);
  if (shouldSkipNavigation(signature)) {
    console.log('Notifications: duplicate notification tap ignored', signature);
    return;
  }

  await openDeepLink(deepLink);
}

async function handleBreedingRequestAction(action: 'approve' | 'reject', data: Record<string, any>, notificationId?: string) {
  const requestId = parseNumericId(data.breeding_request_id ?? data.request_id);
  if (!requestId) {
    console.warn('Notifications: missing breeding_request_id for action');
    return;
  }

  try {
    const response = await apiService.respondToBreedingRequest(requestId, action, action === 'reject' ? 'تمت المعالجة من الإشعار' : undefined);
    if (!response.success && response.error) {
      console.warn('Notifications: breeding request action failed', response.error);
    }
  } catch (error) {
    console.error('Notifications: error responding to breeding request', error);
  } finally {
    if (notificationId) {
      await notifee.cancelNotification(notificationId).catch(() => {});
      await notifee.cancelDisplayedNotification(notificationId).catch(() => {});
    }
  }
}

async function handleAdoptionRequestAction(action: 'approve' | 'reject', data: Record<string, any>, notificationId?: string) {
  let requestId = parseNumericId(data.adoption_request_id ?? data.request_id);
  if (!requestId) {
    try {
      const adoptionResponse = await apiService.getReceivedAdoptionRequests();
      if (adoptionResponse.success) {
        const list = Array.isArray(adoptionResponse.data)
          ? adoptionResponse.data
          : Array.isArray((adoptionResponse.data as any)?.results)
            ? (adoptionResponse.data as any).results
            : [];
        const petId = parseNumericId(data.pet_id);
        const match = list.find((req: any) => {
          const candidateId = parseNumericId(req?.id);
          if (!candidateId) return false;
          if (requestId && candidateId !== requestId) return false;
          if (petId) {
            const reqPetId = parseNumericId(req?.pet?.id);
            if (reqPetId !== petId) return false;
          }
          const status = (req?.status || '').toString().toLowerCase();
          return status === 'pending';
        });
        const matchId = match ? parseNumericId(match.id) : null;
        if (matchId) {
          requestId = matchId;
        }
      }
    } catch (lookupError) {
      console.error('Notifications: lookup adoption request failed', lookupError);
    }
  }

  if (!requestId) {
    console.warn('Notifications: missing adoption_request_id for action');
    return;
  }

  try {
    const response = await apiService.respondToAdoptionRequest(requestId, action, action === 'reject' ? 'تمت المعالجة من الإشعار' : undefined);
    if (!response.success && response.error) {
      console.warn('Notifications: adoption request action failed', response.error);
    }
  } catch (error) {
    console.error('Notifications: error responding to adoption request', error);
  } finally {
    if (notificationId) {
      await notifee.cancelNotification(notificationId).catch(() => {});
      await notifee.cancelDisplayedNotification(notificationId).catch(() => {});
    }
  }
}

async function handleNotificationAction(actionId?: string | null, notification?: NotifeeNotification | null) {
  if (!actionId || !notification) {
    return;
  }

  const data = (notification.data || {}) as Record<string, any>;
  await trackMobileNotificationEvent('actioned', data, { action_id: actionId });

  switch (actionId) {
    case ACTION_IDS.BREEDING_APPROVE:
      await handleBreedingRequestAction('approve', data, notification.id);
      break;
    case ACTION_IDS.BREEDING_REJECT:
      await handleBreedingRequestAction('reject', data, notification.id);
      break;
    case ACTION_IDS.ADOPTION_APPROVE:
      await handleAdoptionRequestAction('approve', data, notification.id);
      break;
    case ACTION_IDS.ADOPTION_REJECT:
      await handleAdoptionRequestAction('reject', data, notification.id);
      break;
    default:
      break;
  }
}

async function handleNotificationPress(notification?: NotifeeNotification | null) {
  if (!notification) {
    return;
  }
  const data = (notification.data || {}) as Record<string, any>;
  await trackMobileNotificationEvent('opened', data);
  await handleNotificationNavigationFromData(data);
}

async function trackMobileNotificationEvent(
  eventType: 'opened' | 'actioned' | 'dismissed',
  data: Record<string, any>,
  metadata?: Record<string, any>
) {
  try {
    const notificationId = parseNumericId(data.notification_id ?? data.id);
    await apiService.trackNotificationEvent(
      eventType,
      'mobile_push',
      notificationId ?? undefined,
      {
        type: getTypeFromAny({ data }) || '',
        chat_id: data.chat_id || data.firebase_chat_id || data.chat_room_id || null,
        ...metadata,
      }
    );
  } catch (err) {
    console.warn('Notifications: failed to track mobile push event', err);
  }
}

function buildAndroidActions(type: string): { title: string; pressAction: { id: string; launchActivity: string } }[] | undefined {
  switch (type) {
    case 'breeding_request_received':
      return [
        {
          title: 'رفض',
          pressAction: { id: ACTION_IDS.BREEDING_REJECT, launchActivity: 'default' },
        },
        {
          title: 'قبول',
          pressAction: { id: ACTION_IDS.BREEDING_APPROVE, launchActivity: 'default' },
        },
      ];
    case 'adoption_request_received':
      return [
        {
          title: 'رفض',
          pressAction: { id: ACTION_IDS.ADOPTION_REJECT, launchActivity: 'default' },
        },
        {
          title: 'قبول',
          pressAction: { id: ACTION_IDS.ADOPTION_APPROVE, launchActivity: 'default' },
        },
      ];
    default:
      return undefined;
  }
}

async function displayNotificationForRemoteMessage(remoteMessage: FirebaseMessagingTypes.RemoteMessage, origin: 'foreground' | 'background' = 'foreground') {
  try {
    await ensureNotificationInfrastructure();

    const data = remoteMessage.data || {};
    const type = getTypeFromAny(remoteMessage);
    const title =
      remoteMessage.notification?.title ||
      data.title ||
      (type === 'breeding_request_received'
        ? 'طلب تزاوج جديد'
        : type === 'adoption_request_received'
        ? 'طلب تبني جديد'
        : 'إشعار جديد');
    const body =
      remoteMessage.notification?.body ||
      data.body ||
      data.message ||
      remoteMessage.data?.message ||
      '';

    const androidActions = buildAndroidActions(type);
    const notificationId = remoteMessage.messageId || `${Date.now()}`;

    await notifee.displayNotification({
      id: notificationId,
      title,
      body,
      data,
      android: {
        channelId: DEFAULT_CHANNEL_ID,
        pressAction: { id: 'default', launchActivity: 'default' },
        importance: AndroidImportance.HIGH,
        actions: androidActions,
        smallIcon: 'ic_launcher',
      },
      ios: {
        categoryId:
          type === 'breeding_request_received' || type === 'adoption_request_received'
            ? IOS_CATEGORY_REQUEST
            : undefined,
        // Critical: These settings make iOS show the notification banner
        foregroundPresentationOptions: {
          alert: true,
          badge: true,
          sound: true,
          banner: true,
          list: true,
        },
        sound: 'default',
      },
    });
  } catch (error) {
    console.error('Notifications: failed to display notification', error);
  }
}

function registerForegroundNotificationListener() {
  if (foregroundNotifeeUnsubscribe) {
    return;
  }

  foregroundNotifeeUnsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      await handleNotificationAction(detail.pressAction?.id ?? detail.actionId, detail.notification);
    } else if (type === EventType.PRESS) {
      await handleNotificationPress(detail.notification);
    } else if (type === EventType.DISMISSED) {
      const data = (detail.notification?.data || {}) as Record<string, any>;
      await trackMobileNotificationEvent('dismissed', data);
    }
  });
}

export async function handleBackgroundRemoteMessage(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
  if (!remoteMessage) {
    return;
  }
  await displayNotificationForRemoteMessage(remoteMessage, 'background');
}

export async function handleNotifeeBackgroundEvent(event: NotifeeEvent) {
  const { type, detail } = event;
  if (type === EventType.ACTION_PRESS) {
    await handleNotificationAction(detail.pressAction?.id ?? detail.actionId, detail.notification);
  } else if (type === EventType.PRESS) {
    await handleNotificationPress(detail.notification);
  } else if (type === EventType.DISMISSED) {
    const data = (detail.notification?.data || {}) as Record<string, any>;
    await trackMobileNotificationEvent('dismissed', data);
  }
}

async function handleRemoteMessageInternal(remoteMessage: FirebaseMessagingTypes.RemoteMessage, origin: 'foreground' | 'background') {
  console.log(`Notifications: handling ${origin} message`, remoteMessage?.data);
  await displayNotificationForRemoteMessage(remoteMessage, origin);
}

export function setupNotificationHandlers() {
  if (handlersConfigured) {
    return;
  }
  handlersConfigured = true;

  registerForegroundNotificationListener();

  if (!messagingForegroundUnsubscribe) {
    messagingForegroundUnsubscribe = messaging().onMessage(async (remoteMessage) => {
      await handleRemoteMessageInternal(remoteMessage, 'foreground');
    });
  }

  messaging().onNotificationOpenedApp(async (remoteMessage) => {
    console.log('Notifications: opened from background', remoteMessage?.data);
    await trackMobileNotificationEvent('opened', (remoteMessage?.data || {}) as Record<string, any>, {
      open_context: 'background',
    });
    await handleNotificationNavigationFromData(remoteMessage?.data ?? {});
  });

  messaging()
    .getInitialNotification()
    .then(async (remoteMessage) => {
      if (remoteMessage) {
        console.log('Notifications: opened from quit state', remoteMessage?.data);
        await trackMobileNotificationEvent('opened', (remoteMessage?.data || {}) as Record<string, any>, {
          open_context: 'quit_state',
        });
        await handleNotificationNavigationFromData(remoteMessage?.data ?? {});
      }
    });

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
    // On iOS, register for remote messages first (required before getting token)
    if (Platform.OS === 'ios') {
      if (!messaging().isDeviceRegisteredForRemoteMessages) {
        await messaging().registerDeviceForRemoteMessages();
      }
    }
    
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
  await ensureNotificationInfrastructure();
  setupNotificationHandlers();
}
