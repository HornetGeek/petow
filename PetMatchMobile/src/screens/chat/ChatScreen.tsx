import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import AppIcon from '../../components/icons/AppIcon';
import { apiService, ChatRoom, ChatContext } from '../../services/api';
import type { ChatPhase } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Share } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import VerificationScreen from '../profile/VerificationScreen';
import { MessageService, FirebaseMessage } from '../../services/firebase/firebaseConfig';
import * as ImagePicker from 'react-native-image-picker';
import { WebView } from 'react-native-webview';
import PetDetailsScreen from '../pets/PetDetailsScreen';
import { Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { getFloatingTabBarContentPadding } from '../../utils/tabBarLayout';
import { useFeatureFlags } from '../../services/featureFlags';
import { deriveChatPhase } from '../../utils/chatPhase';
import ChatStatusBanner from './components/ChatStatusBanner';

interface ChatScreenProps {
  firebaseChatId: string;
  onClose: () => void;
  onRequestVerification?: (message?: string) => void;
  reserveTabBarSpace?: boolean;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
  firebaseChatId,
  onClose,
  onRequestVerification,
  reserveTabBarSpace = true,
}) => {
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [messages, setMessages] = useState<FirebaseMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageForModal, setSelectedImageForModal] = useState<string | null>(null);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Support nudge state
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportBarVisible, setSupportBarVisible] = useState(false);
  const [showSupportWeb, setShowSupportWeb] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | undefined>(undefined);
  const [showPetDetails, setShowPetDetails] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { requestChatV2Enabled } = useFeatureFlags();
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected' | undefined>(undefined);

  const messagesEndRef = useRef<ScrollView>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastMarkReadAtRef = useRef(0);

  useEffect(() => {
    loadChatRoom();

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [firebaseChatId]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!requestChatV2Enabled) return;
    let cancelled = false;
    apiService.getVerificationStatus().then((res) => {
      if (cancelled) return;
      if (res.success && res.data?.verification?.status) {
        setVerificationStatus(res.data.verification.status as any);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [requestChatV2Enabled]);

  useEffect(() => {
    scrollToBottom();
    if (!firebaseChatId || loading) {
      return;
    }
    const now = Date.now();
    if (now - lastMarkReadAtRef.current < 2000) {
      return;
    }
    lastMarkReadAtRef.current = now;
    apiService.markChatNotificationsAsRead(firebaseChatId)
      .catch((markErr) => console.log('markChatNotificationsAsRead failed (non-fatal)', markErr));
  }, [messages, firebaseChatId, loading]);

  // Trigger support nudge after threshold (3 messages) once per chat
  // Trigger support nudge after threshold (3 messages) once per chat
  // useEffect(() => {
  //   const maybeShowNudge = async () => {
  //     try {
  //       if (!firebaseChatId) return;
  //       const threshold = 3;
  //       const count = Array.isArray(messages) ? messages.length : 0;
  //       if (count < threshold) return;

  //       // Persistent support bar after threshold unless dismissed
  //       const barDismissed = await AsyncStorage.getItem(`support_bar_dismissed_${firebaseChatId}`);
  //       if (barDismissed !== 'true') {
  //         setSupportBarVisible(true);
  //       }

  //       // One-time popup per chat
  //       const shown = await AsyncStorage.getItem(`support_nudge_shown_${firebaseChatId}`);
  //       if (shown === 'true') return;
  //       setShowSupportModal(true);
  //       await AsyncStorage.setItem(`support_nudge_shown_${firebaseChatId}`, 'true');
  //     } catch { }
  //   };
  //   maybeShowNudge();
  // }, [messages, firebaseChatId]);

  const openSupportLink = async () => {
    const url = 'https://ipn.eg/S/moataz.abdelmawgoud/instapay/3JDKnp';
    try {
      await Linking.openURL(url);
    } catch (e) {
      // فشل فتح الرابط عبر المتصفح، استخدم WebView داخل التطبيق
      setShowSupportWeb(true);
    }
  };

  const shareVodafoneCash = async () => {
    const number = '01070854517';
    const message = `دعم التطبيق عبر Vodafone Cash\nرقم المحفظة: ${number}\nالمبلغ المقترح: 20 جنيه`;
    try {
      await Share.share({ message });
    } catch { }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollToEnd({ animated: true });
  };

  const pickAndSendImage = async () => {
    try {
      const res: ImagePicker.ImagePickerResponse = await ImagePicker.launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      if (res.didCancel) return;
      const asset: ImagePicker.Asset | undefined = res.assets && res.assets[0];
      if (!asset || !asset.uri) return;

      const file: any = {
        uri: asset.uri,
        name: asset.fileName || `chat_${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      };

      const upload = await apiService.uploadChatImage(file);
      if (!upload.success || !upload.data?.image_url) {
        Alert.alert('خطأ', 'فشل رفع الصورة');
        return;
      }

      const currentUserId = user?.id || 0;
      const currentUserName = (user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}` || 'أنا').trim();
      const imgClientId = `img_${Date.now()}`;
      const ok = await MessageService.sendMessage(
        firebaseChatId,
        {
          text: '[صورة]',
          senderId: currentUserId,
          senderName: currentUserName,
          type: 'image',
          imageUrl: upload.data.image_url,
        },
        { clientId: imgClientId }
      );
      if (!ok) {
        Alert.alert('تحذير', 'تعذر إرسال الصورة الآن، سيتم إرسالها لاحقاً');
      }
    } catch (e) {
      console.error('Error picking/sending image:', e);
      Alert.alert('خطأ', 'تعذر إرسال الصورة');
    }
  };

  const loadChatRoom = async () => {
    try {
      let effectiveUser = user;
      if (!effectiveUser?.is_verified) {
        try {
          const refreshed = await refreshUser();
          if (refreshed) {
            effectiveUser = refreshed;
          }
        } catch (refreshError) {
          console.log('⚠️ ChatScreen - Failed to refresh user before loading chat:', refreshError);
        }
      }
      setLoading(true);
      setError(null);
      console.log('💬 ChatScreen - Loading chat room:', firebaseChatId);

      // 1) Validate ownership and load metadata via API first (match frontend behavior)
      let chatRoomData = null;
      try {
        chatRoomData = await apiService.getChatRoomByFirebaseId(firebaseChatId);
        console.log('💬 ChatScreen - Chat room data:', chatRoomData);
        if (chatRoomData.success && chatRoomData.data) {
          const participantIds = Object.values(chatRoomData.data.participants || {}).map((p: any) => p?.id);
          const currentUserId = effectiveUser?.id || user?.id;
          const isMine = currentUserId && participantIds.includes(currentUserId);
          if (!isMine) {
            setError('هذه المحادثة غير متاحة لحسابك');
            return onClose();
          }
          setChatRoom(chatRoomData.data);
          const contextData = await apiService.getChatRoomContext(chatRoomData.data.id);
          console.log('💬 ChatScreen - Chat context:', contextData);
          if (contextData.success && contextData.data) {
            setChatContext(contextData.data.chat_context);
          }
        }
      } catch (apiError) {
        console.log('⚠️ API not available for chat metadata');
      }

      // 2) Setup Firebase after API ownership check
      let connected = false;
      try {
        await setupMessageListener();
        connected = true;
        setFirebaseConnected(true);
        console.log('✅ Firebase connected successfully');
      } catch (firebaseError) {
        console.log('⚠️ Firebase not available, will use API or mock');
        connected = false;
        setFirebaseConnected(false);
      }

      // If neither provided data, use mock placeholders for UI
      if (!chatRoomData || !chatRoomData.success || !chatRoomData.data) {
        const mockChatRoom: ChatRoom = {
          id: 1,
          firebase_chat_id: firebaseChatId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true,
          participants: {},
          other_participant: {
            id: 2,
            name: 'أحمد محمد',
            email: 'ahmed@example.com',
            phone: '01234567890'
          },
          pet_details: {
            id: 1,
            name: 'بسكويت',
            breed_name: 'شيرازي',
            pet_type_display: 'قطط',
            main_image: 'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80'
          }
        };

        const mockChatContext: ChatContext = {
          chat_id: firebaseChatId,
          breeding_request: {
            id: 1,
            status: 'pending',
            created_at: new Date().toISOString(),
            message: 'طلب تزاوج'
          },
          pet: {
            id: 1,
            name: 'بسكويت',
            breed_name: 'شيرازي',
            pet_type_display: 'قطط',
            main_image: 'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
            owner_name: 'أحمد محمد'
          },
          participants: {},
          metadata: {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true
          }
        };

        setChatRoom(mockChatRoom);
        setChatContext(mockChatContext);
      }

      // If Firebase not connected, provide local sample messages
      if (!connected) {
        console.log('⚠️ Firebase not available, using local messages');

        // Add some sample messages if Firebase fails
        const sampleMessages: FirebaseMessage[] = [
          {
            id: '1',
            text: 'مرحباً! شكراً لك على طلب التزاوج',
            senderId: 2,
            senderName: 'أحمد محمد',
            timestamp: new Date(Date.now() - 60000),
            type: 'text'
          },
          {
            id: '2',
            text: 'هل يمكنني رؤية المزيد من الصور للقط؟',
            senderId: 1,
            senderName: 'أنت',
            timestamp: new Date(Date.now() - 30000),
            type: 'text'
          },
          {
            id: '3',
            text: 'بالطبع! إليك بعض الصور الإضافية',
            senderId: 2,
            senderName: 'أحمد محمد',
            timestamp: new Date(Date.now() - 15000),
            type: 'text'
          }
        ];

        setMessages(sampleMessages);
      }

    } catch (error) {
      console.error('❌ Error loading chat room:', error);
      setError('خطأ في تحميل المحادثة');
    } finally {
      setLoading(false);
    }
  };

  const setupMessageListener = async () => {
    console.log('💬 ChatScreen - Setting up Firebase message listener for:', firebaseChatId);

    try {
      // First, try to get existing messages
      const existingMessages = await MessageService.getMessages(firebaseChatId);
      if (existingMessages.length > 0) {
        setMessages(existingMessages);
        console.log('✅ Loaded existing messages from Firebase:', existingMessages.length);
      } else {
        // No messages yet; don't auto-create a Firestore chat with hardcoded participants.
        // Just show a local welcome message; backend will create the room when appropriate.
        const welcomeMessage: FirebaseMessage = {
          id: 'welcome',
          text: 'مرحباً! تم إنشاء المحادثة بنجاح',
          senderId: 0,
          senderName: 'النظام',
          timestamp: new Date(),
          type: 'system'
        };
        setMessages([welcomeMessage]);
      }

      // Setup real-time listener
      const unsubscribe = MessageService.subscribeToMessages(
        firebaseChatId,
        (messages) => {
          console.log('💬 ChatScreen - Received messages from Firebase:', messages.length);
          setMessages(messages);
        }
      );

      unsubscribeRef.current = unsubscribe;
      setFirebaseConnected(true);

    } catch (error) {
      console.error('❌ Error setting up Firebase listener:', error);
      setFirebaseConnected(false);
      throw error;
    }
  };

  const mustVerifyToChat = Boolean(
    chatContext?.adoption_request &&
    chatContext.adoption_request.status === 'approved' &&
    !user?.is_verified
  );

  const openVerification = (message?: string) => {
    if (onRequestVerification) {
      onRequestVerification(
        message ||
        'تم قبول طلب التبني. لإكمال المحادثة، يرجى توثيق حسابك لحماية المجتمع ومنع الاستغلال.'
      );
      return;
    }
    setVerificationNotice(
      message ||
      'تم قبول طلب التبني. لإكمال المحادثة، يرجى توثيق حسابك لحماية المجتمع ومنع الاستغلال.'
    );
    setShowVerification(true);
  };

  const closeVerification = async () => {
    setShowVerification(false);
    setVerificationNotice(undefined);
    await refreshUser();
  };

  const sendMessage = async () => {
    if (mustVerifyToChat) {
      openVerification();
      return;
    }
    if (!newMessage.trim() || !chatRoom || sending) return;

    try {
      setSending(true);
      console.log(' ChatScreen - Sending message:', newMessage);

      const currentUserId = user?.id || 0;
      const currentUserName = (user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}` || 'أنا').trim();
      // Optimistic add always using a stable clientId; Firestore snapshot will reuse same id
      const clientId = Date.now().toString();
      const optimistic: FirebaseMessage = {
        id: clientId,
        text: newMessage.trim(),
        senderId: currentUserId,
        senderName: currentUserName,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, optimistic]);
      const messageText = newMessage.trim();
      setNewMessage('');

      // Try to send via Firebase
      if (firebaseConnected) {
        const ok = await MessageService.sendMessage(
          firebaseChatId,
          {
            text: messageText,
            senderId: currentUserId,
            senderName: currentUserName,
            type: 'text',
          },
          { clientId }
        );
        if (!ok) {
          console.warn('⚠️ Firebase send returned false; keeping local optimistic message');
          Alert.alert('تحذير', 'تم حفظ الرسالة محلياً، سيتم إرسالها لاحقاً');
        }
      } else {
        console.log('⚠️ Firebase not connected, message saved locally');
        Alert.alert('تحذير', 'غير متصل بـ Firebase، تم حفظ الرسالة محلياً');
      }

      // Fire-and-forget: ask backend to push a notification to the peer
      try {
        await apiService.sendChatMessageNotification(firebaseChatId, messageText);
      } catch (notifyErr) {
        console.log('sendChatMessageNotification failed (non-fatal)', notifyErr);
      }

    } catch (err) {
      console.error('💬 ChatScreen - Error sending message:', err);
      Alert.alert('خطأ', 'فشل في إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (timestamp: any) => {
    if (!timestamp) return '';

    let date: Date;
    if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else {
      date = new Date(timestamp as string | number | Date);
    }

    return date.toLocaleTimeString('ar', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const archiveChat = async () => {
    if (!chatRoom) return;

    try {
      Alert.alert('نجح', 'تم أرشفة المحادثة بنجاح');
      onClose();
    } catch (err) {
      console.error(' ChatScreen - Error archiving chat:', err);
      Alert.alert('خطأ', 'فشل في أرشفة المحادثة');
    }
  };

  const renderMessage = (message: FirebaseMessage) => {
    const isCurrentUser = user?.id ? message.senderId === user.id : false;
    const isSystem = message.type === 'system';

    return (
      <View
        key={message.id}
        style={[
          styles.message,
          isCurrentUser ? styles.sentMessage : styles.receivedMessage,
          isSystem && styles.systemMessage
        ]}
      >
        <View style={[
          styles.messageContent,
          isCurrentUser && styles.sentMessageContent,
          isSystem && styles.systemMessageContent
        ]}>
          {message.type === 'image' && message.imageUrl && (
            <TouchableOpacity
              onPress={() => setSelectedImageForModal(message.imageUrl!)}
            >
              <Image
                source={{ uri: message.imageUrl }}
                style={styles.messageImage}
              />
            </TouchableOpacity>
          )}
          <Text style={[
            styles.messageText,
            isCurrentUser && styles.sentMessageText,
            isSystem && styles.systemMessageText
          ]}>
            {message.text}
          </Text>
          <Text style={[
            styles.messageTime,
            isCurrentUser && styles.sentMessageTime
          ]}>
            {formatMessageTime(message.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>المحادثة</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#02B7B4" />
          <Text style={styles.loadingText}>جاري تحميل المحادثة...</Text>
        </View>
      </View>
    );
  }

  if (error && !chatRoom) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>المحادثة</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>خطأ في تحميل المحادثة</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadChatRoom}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const petInfo = chatContext?.pet || null;
  const otherParticipantName = chatRoom?.other_participant?.name
    || chatContext?.clinic?.name
    || 'فريق العيادة';
  const currentUserId = user?.id;

  // Adapted from spec: ChatRoom has no `requester` / `adoption_request` / `breeding_request`
  // fields directly. Those live on ChatContext. Perspective is derived from pet ownership:
  // current user is "owner" if their name matches the pet owner's name, else "requester".
  const ownerName = chatContext?.pet?.owner_name || null;
  const userFullName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '';
  const isRequester = !!ownerName && !!userFullName ? ownerName !== userFullName : true;
  const perspective: 'requester' | 'owner' = isRequester ? 'requester' : 'owner';

  const phase: ChatPhase = useMemo(() => {
    const requestStatus = (
      chatContext?.adoption_request?.status ||
      chatContext?.breeding_request?.status ||
      'pending'
    ) as 'pending' | 'approved' | 'rejected';
    const requestKind: 'adoption' | 'breeding' = chatContext?.adoption_request ? 'adoption' : 'breeding';
    return deriveChatPhase({
      requestKind,
      requestStatus,
      isActive: chatRoom?.is_active ?? true,
      isRequester,
      isRequesterVerified: isRequester ? !!user?.is_verified : false,
      verificationStatus,
    });
  }, [chatRoom, chatContext, user, isRequester, verificationStatus]);
  const otherParticipantVerified = (() => {
    if (chatRoom?.other_participant?.is_verified) {
      return true;
    }
    if (chatRoom?.participants && currentUserId) {
      return Object.values(chatRoom.participants).some((participant) => {
        if (!participant) return false;
        if (participant.id === currentUserId) return false;
        return !!participant.is_verified;
      });
    }
    return false;
  })();
  const petName = petInfo?.name || 'المريض';
  const petBreed = petInfo?.breed_name || petInfo?.pet_type_display || '';
  const petImage = petInfo?.main_image || null;
  const composerBottomPadding = reserveTabBarSpace
    ? getFloatingTabBarContentPadding(insets.bottom, 4)
    : 20 + insets.bottom;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight + insets.top : 0}
    >
      {/* Chat Header */}
      <View
        style={styles.header}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.participantInfo}
          onPress={() => {
            if (chatContext?.pet?.id) {
              setShowPetDetails(true);
            }
          }}
          activeOpacity={0.7}
        >
          {petImage && (
            <Image
              source={{
                uri: resolveMediaUrl(petImage),
              }}
              style={styles.headerAvatar}
            />
          )}
          <View style={styles.participantDetails}>
            <View style={styles.participantNameRow}>
              <Text style={styles.participantName}>{otherParticipantName}</Text>
              {otherParticipantVerified && (
                <View style={styles.trustedBadge}>
                  <AppIcon name="shield-check" size={12} color="#1c7c5c" />
                  <Text style={styles.trustedBadgeText}>موثوق</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <AppIcon name="paw" size={12} color="#FF6B35" />
              <Text style={styles.petInfo}> {petName}{petBreed ? ` - ${petBreed}` : ''}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.archiveButton} onPress={archiveChat}>
          <AppIcon name="document" size={20} color="#e67e22" />
        </TouchableOpacity>
      </View>

      {/* Firebase Connection Status */}
      {!firebaseConnected && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionBannerText}>
            ⚠️ غير متصل بـ Firebase - الرسائل محفوظة محلياً
          </Text>
        </View>
      )}

      {requestChatV2Enabled ? (
        <ChatStatusBanner phase={phase} perspective={perspective} />
      ) : null}

      {/* Chat Messages */}
      <ScrollView
        ref={messagesEndRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {supportBarVisible && (
          <View style={styles.supportBar}>
            <Text style={styles.supportBarText}>ادعم التطبيق بـ 20 جنيه عبر Instapay</Text>
            <View style={styles.supportBarActions}>
              <TouchableOpacity style={styles.supportBarButton} onPress={() => setShowSupportModal(true)}>
                <Text style={styles.supportBarButtonText}>ادعم الآن</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.supportBarClose}
                onPress={async () => {
                  setSupportBarVisible(false);
                  await AsyncStorage.setItem(`support_bar_dismissed_${firebaseChatId}`, 'true');
                }}
              >
                <Text style={styles.supportBarCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <AppIcon name="chat" size={48} color="#3B82F6" />
            <Text style={styles.emptyChatTitle}>ابدأ المحادثة</Text>
            <Text style={styles.emptyChatDescription}>
              مرحباً! يمكنك الآن التحدث مع {otherParticipantName} حول {petName}
            </Text>
          </View>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollView>

      {/* Message Input */}
      <View
        style={[
          styles.inputContainer,
          keyboardVisible && styles.inputContainerRaised,
          { paddingBottom: composerBottomPadding },
        ]}
      >
        {/* Verification gate when adoption approved and user not verified */}
        {chatContext?.adoption_request?.status === 'approved' && !user?.is_verified && (
          <View style={styles.verifyGate}>
            <Text style={styles.verifyGateText}>
              تم قبول طلب التبني. لتتمكن من الرد ومتابعة المحادثة، يرجى توثيق حسابك.
            </Text>
            <TouchableOpacity style={styles.verifyGateButton} onPress={() => openVerification()}>
              <Text style={styles.verifyGateButtonText}>توثيق الحساب للمتابعة</Text>
            </TouchableOpacity>
          </View>
        )}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Text style={styles.closeErrorText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.messageInput}>
          <TouchableOpacity
            style={[styles.mediaButton, sending && styles.sendButtonDisabled]}
            onPress={pickAndSendImage}
            disabled={sending}
          >
            <AppIcon name="image" size={20} color="#3B82F6" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="اكتب رسالتك هنا..."
            placeholderTextColor="#95a5a6"
            multiline
            maxLength={500}
            editable={!sending && !mustVerifyToChat}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending || mustVerifyToChat) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending || mustVerifyToChat}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <AppIcon name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Image Modal */}
      {selectedImageForModal && (
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={styles.imageModalContent}
            onPress={() => setSelectedImageForModal(null)}
          >
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setSelectedImageForModal(null)}
            >
              <Text style={styles.closeModalText}>✕</Text>
            </TouchableOpacity>
            <Image
              source={{ uri: selectedImageForModal }}
              style={styles.enlargedImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      )}

      {showSupportModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSupportModal(false)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>اتفقنا؟</Text>
            <Text style={styles.modalBody}>
              لو التطبيق فادك في الاتفاق، تقدر تدعمنا بمساهمة 20 جنيه علشان نفضل نطوّر ونخدمك بشكل أفضل. شكراً لدعمك ❤️
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalPrimary} onPress={() => { setShowSupportModal(false); openSupportLink(); }}>
                <Text style={styles.modalPrimaryText}>Instapay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondary} onPress={() => { setShowSupportModal(false); shareVodafoneCash(); }}>
                <Text style={styles.modalSecondaryText}>Vodafone Cash</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowSupportModal(false)}>
              <Text style={styles.modalDismissText}>ليس الآن</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showSupportWeb && (
        <View style={styles.webOverlay}>
          <View style={styles.webCard}>
            <View style={styles.webHeader}>
              <Text style={styles.webTitle}>الدفع عبر Instapay</Text>
              <TouchableOpacity onPress={() => setShowSupportWeb(false)}>
                <Text style={styles.webClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <WebView source={{ uri: 'https://ipn.eg/S/moataz.abdelmawgoud/instapay/3JDKnp' }} startInLoadingState />
          </View>
        </View>
      )}

      {/* Verification Screen Modal */}
      {showVerification && (
        <VerificationScreen
          onClose={closeVerification}
          onVerificationSubmitted={closeVerification}
          noticeMessage={verificationNotice}
        />
      )}

      {/* Pet Details Modal */}
      {showPetDetails && chatContext?.pet?.id && (
        <Modal
          visible={showPetDetails}
          animationType="slide"
          onRequestClose={() => setShowPetDetails(false)}
        >
          <PetDetailsScreen
            petId={chatContext.pet.id}
            onClose={() => setShowPetDetails(false)}
          />
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  backButton: {
    padding: 10,
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 24,
    color: '#2c3e50',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
  },
  placeholder: {
    width: 40,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  participantDetails: {
    flex: 1,
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginRight: 6,
  },
  trustedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f8f5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trustedBadgeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  trustedBadgeText: {
    fontSize: 12,
    color: '#1c7c5c',
    fontWeight: '600',
  },
  petInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  archiveButton: {
    padding: 10,
  },
  archiveButtonText: {
    fontSize: 18,
    color: '#e67e22',
  },
  connectionBanner: {
    backgroundColor: '#fff3cd',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ffeaa7',
  },
  connectionBannerText: {
    color: '#856404',
    textAlign: 'center',
    fontSize: 12,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  messagesContent: {
    padding: 20,
  },
  supportBar: {
    backgroundColor: '#e6f7fb',
    borderWidth: 1,
    borderColor: '#bfe7f5',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  supportBarText: {
    color: '#0b4a6f',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  supportBarActions: { flexDirection: 'row', alignItems: 'center' },
  supportBarButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  supportBarButtonText: { color: '#fff', fontWeight: '700' },
  supportBarClose: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4 },
  supportBarCloseText: { color: '#0b4a6f', fontSize: 16 },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 10,
    color: '#7f8c8d',
    fontSize: 16,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#02B7B4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyChat: {
    alignItems: 'center',
    padding: 60,
  },
  emptyChatIcon: {
    fontSize: 48,
    marginBottom: 20,
    color: '#bdc3c7',
  },
  emptyChatTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  emptyChatDescription: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 24,
  },
  message: {
    marginBottom: 16,
    maxWidth: '85%',
  },
  sentMessage: {
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    alignSelf: 'flex-start',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '100%',
  },
  messageContent: {
    backgroundColor: '#f1f3f4',
    padding: 12,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  sentMessageContent: {
    backgroundColor: '#02B7B4',
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
  },
  systemMessageContent: {
    backgroundColor: '#ffeaa7',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#2c3e50',
  },
  sentMessageText: {
    color: '#fff',
  },
  systemMessageText: {
    color: '#2d3436',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 6,
    color: '#657786',
  },
  sentMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  inputContainerRaised: {
    marginBottom: 8,
  },
  errorBanner: {
    backgroundColor: '#f8d7da',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerText: {
    color: '#721c24',
    flex: 1,
  },
  closeErrorText: {
    color: '#721c24',
    fontSize: 16,
    fontWeight: 'bold',
  },
  messageInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 22,
    backgroundColor: '#f7f9fa',
    color: '#2c3e50',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  mediaButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#02B7B4',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#95a5a6',
  },
  sendButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  verifyGate: {
    backgroundColor: '#fff8e1',
    borderColor: '#ffecb5',
    borderWidth: 1,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
  },
  verifyGateText: {
    color: '#7a5a00',
    fontSize: 14,
    marginBottom: 8,
  },
  verifyGateButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1c344d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  verifyGateButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  imageModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  imageModalContent: {
    position: 'relative',
    maxWidth: '95%',
    maxHeight: '95%',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '92%',
    borderWidth: 1,
    borderColor: '#e7eef3',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalPrimary: {
    flex: 1,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalPrimaryText: { color: '#fff', fontWeight: '800' },
  modalSecondary: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSecondaryText: { color: '#0f172a', fontWeight: '800' },
  modalDismissText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#65708b',
    fontWeight: '600',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalCloseText: { fontSize: 18, color: '#0f172a' },
  closeModalButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
  },
  closeModalText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  enlargedImage: {
    width: 300,
    height: 300,
    borderRadius: 12,
  },
  webOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  webCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '95%',
    height: '80%',
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  webTitle: { fontWeight: '800', color: '#0f172a' },
  webClose: { fontSize: 18, color: '#0f172a' },
});

export default ChatScreen;
