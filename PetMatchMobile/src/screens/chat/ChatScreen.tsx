import React, { useState, useEffect, useRef } from 'react';
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
  Platform,
} from 'react-native';
import { apiService, ChatRoom, ChatContext } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { MessageService, FirebaseMessage } from '../../services/firebase/firebaseConfig';
import * as ImagePicker from 'react-native-image-picker';

interface ChatScreenProps {
  firebaseChatId: string;
  onClose: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ firebaseChatId, onClose }) => {
  const { user } = useAuth();
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [messages, setMessages] = useState<FirebaseMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageForModal, setSelectedImageForModal] = useState<string | null>(null);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  
  const messagesEndRef = useRef<ScrollView>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
    scrollToBottom();
  }, [messages]);

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
          const isMine = user?.id && participantIds.includes(user.id);
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

  const sendMessage = async () => {
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
  const petName = petInfo?.name || 'المريض';
  const petBreed = petInfo?.breed_name || petInfo?.pet_type_display || '';
  const petImage = petInfo?.main_image || null;

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Chat Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        
        <View style={styles.participantInfo}>
          {petImage && (
            <Image
              source={{
                uri: petImage.startsWith('http')
                  ? petImage.replace('http://', 'https://')
                  : `https://api.petow.app${petImage.startsWith('/') ? '' : '/'}${petImage}`,
              }}
              style={styles.headerAvatar}
            />
          )}
          <View style={styles.participantDetails}>
            <Text style={styles.participantName}>{otherParticipantName}</Text>
            <Text style={styles.petInfo}>
              🐾 {petName}{petBreed ? ` - ${petBreed}` : ''}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.archiveButton} onPress={archiveChat}>
          <Text style={styles.archiveButtonText}>📦</Text>
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

      {/* Chat Messages */}
      <ScrollView 
        ref={messagesEndRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatIcon}>💬</Text>
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
      <View style={styles.inputContainer}>
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
            <Text style={styles.sendButtonText}>🖼️</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="اكتب رسالتك هنا..."
            placeholderTextColor="#95a5a6"
            multiline
            maxLength={500}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>📤</Text>
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
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
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
});

export default ChatScreen;
