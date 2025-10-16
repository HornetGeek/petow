import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { apiService, ChatRoomList } from '../../services/api';
import { MessageService } from '../../services/firebase/firebaseConfig';
import ChatScreen from './ChatScreen';
import { firestore } from '../../services/firebase/firebaseConfig';
import { useAuth } from '../../contexts/AuthContext';

interface ChatListScreenProps {
  onClose: () => void;
  initialFirebaseChatId?: string | null;
  onChatOpened?: () => void;
}

const ChatListScreen: React.FC<ChatListScreenProps> = ({ onClose, initialFirebaseChatId = null, onChatOpened }) => {
  const { user } = useAuth();
  const [activeChats, setActiveChats] = useState<ChatRoomList[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatRoomList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const appliedInitialRef = useRef<string | null>(null);

  useEffect(() => {
    loadChatRooms();
  }, []);

  useEffect(() => {
    if (initialFirebaseChatId && appliedInitialRef.current !== initialFirebaseChatId) {
      appliedInitialRef.current = initialFirebaseChatId;
      console.log('💬 ChatListScreen - Auto-opening chat from trigger:', initialFirebaseChatId);
      setSelectedChatId(initialFirebaseChatId);
      onChatOpened?.();
    }
  }, [initialFirebaseChatId, onChatOpened]);

  const loadChatRooms = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('💬 ChatListScreen - Loading chat rooms...');
      
      // Load from backend first (frontend behavior)
      try {
        const response = await apiService.getChatRooms();
        if (response.success && response.data) {
          setActiveChats(response.data.results);
          setArchivedChats([]);
          setFirebaseConnected(false);
          console.log('✅ Loaded chat rooms from API:', response.data.results.length);
          return;
        }
      } catch (apiError) {
        console.log('⚠️ Chat API unavailable, will try Firebase fallback');
      }

      // Fallback to Firebase if API isn’t available
      try {
        await loadFromFirebase();
        setFirebaseConnected(true);
        console.log('✅ Loaded chat rooms from Firebase');
        return;
      } catch (firebaseError) {
        console.log('⚠️ Firebase not available, using mock data');
      }

      // If both fail, use mock data (development only)
      setTimeout(() => {
        const sampleChats: ChatRoomList[] = [
          {
            id: 1,
            firebase_chat_id: 'chat_1',
            created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            updated_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            other_participant: 'أحمد محمد',
            pet_name: 'بسكويت',
            pet_image: 'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80'
          },
          {
            id: 2,
            firebase_chat_id: 'chat_2',
            created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
            updated_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
            other_participant: 'فاطمة علي',
            pet_name: 'ميمي',
            pet_image: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80'
          },
          {
            id: 3,
            firebase_chat_id: 'chat_3',
            created_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
            updated_at: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
            other_participant: 'محمد أحمد',
            pet_name: 'ريكس',
            pet_image: 'https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80'
          }
        ];
        
        setActiveChats(sampleChats);
        setArchivedChats([]);
        setFirebaseConnected(false);
        console.log('✅ Sample chats loaded');
      }, 1000);
      
    } catch (err) {
      console.error(' ChatListScreen - Error loading chat rooms:', err);
      setError('فشل في تحميل المحادثات');
    } finally {
      setLoading(false);
    }
  };

  const loadFromFirebase = async () => {
    try {
      if (!user?.id) {
        throw new Error('No authenticated user');
      }
      // Load chat rooms from Firebase Firestore
      const baseQuery = firestore()
        .collection('chats')
        .where('participants', 'array-contains', user.id);

      let chatRoomsSnapshot;
      let usedFallback = false;
      try {
        // Preferred query with orderBy, requires composite index
        chatRoomsSnapshot = await baseQuery.orderBy('updatedAt', 'desc').get();
      } catch (err: unknown) {
        const firestoreError = err as { code?: string; message?: string } | null;
        const code = firestoreError?.code || '';
        const msg = String(firestoreError?.message || err || '');
        const isIndexError = code === 'firestore/failed-precondition' || code === 'failed-precondition' || msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION') || msg.includes('create_composite');
        if (isIndexError) {
          console.warn('⚠️ Firestore ordered query needs index; falling back without orderBy. Error:', msg || code);
          try {
            // Fallback: run without orderBy (single-field index auto-exists), then sort locally
            chatRoomsSnapshot = await baseQuery.get();
            usedFallback = true;
          } catch (fallbackErr) {
            console.error('❌ Firestore fallback query failed:', fallbackErr);
            throw fallbackErr;
          }
        } else {
          console.warn('⚠️ Firestore ordered query failed; falling back without orderBy anyway. Error:', msg || code);
          chatRoomsSnapshot = await baseQuery.get();
          usedFallback = true;
        }
      }
      
      const firebaseChats: ChatRoomList[] = [];
      chatRoomsSnapshot.forEach((doc) => {
        const data = doc.data() as any;
        firebaseChats.push({
          id: Number(doc.id) || Date.now(),
          firebase_chat_id: doc.id,
          created_at: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
          updated_at: data.updatedAt?.toDate().toISOString() || new Date().toISOString(),
          other_participant: data.otherParticipantName || 'Unknown User',
          pet_name: data.petName || 'Unknown Pet',
          pet_image: data.petImage || null
        });
      });
      
      // Sort client-side by updated_at desc when needed
      if (usedFallback) {
        firebaseChats.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      }

      // Enrich missing names/images from API if needed
      const needsEnrichment = firebaseChats.some(c => c.other_participant === 'Unknown User' || c.pet_name === 'Unknown Pet');
      if (needsEnrichment) {
        try {
          const enriched = await Promise.all(firebaseChats.map(async (c) => {
            if (c.other_participant !== 'Unknown User' && c.pet_name !== 'Unknown Pet') return c;
            try {
              const resp = await apiService.getChatRoomByFirebaseId(c.firebase_chat_id);
              if (resp.success && resp.data) {
                // Defensive: ensure current user is a participant; otherwise drop it later
                const participantIds = Object.values(resp.data.participants || {}).map((p: any) => p?.id);
                const isMine = user?.id && participantIds.includes(user.id);
                return {
                  ...c,
                  other_participant: resp.data.other_participant?.name || c.other_participant,
                  pet_name: resp.data.pet_details?.name || c.pet_name,
                  pet_image: resp.data.pet_details?.main_image || c.pet_image,
                  // mark for drop if API indicates it's not mine
                  ...(isMine ? {} : { __drop__: true }),
                } as ChatRoomList;
              }
              // If API responded but not success (e.g., 404), drop this chat to match frontend behavior
              return { ...(c as any), __drop__: true } as any;
            } catch {}
            return c;
          }));
          const filtered = (enriched as any[]).filter((c) => !(c as any).__drop__);
          setActiveChats(filtered as ChatRoomList[]);
        } catch {
          setActiveChats(firebaseChats);
        }
      } else {
        setActiveChats(firebaseChats);
      }
      setArchivedChats([]);
      console.log('✅ Loaded real chat rooms from Firebase:', firebaseChats.length);
    } catch (error) {
      console.error('❌ Error loading from Firebase:', error);
      throw error;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChatRooms();
    setRefreshing(false);
  };

  const openChat = (firebaseChatId: string) => {
    console.log('💬 ChatListScreen - Opening chat:', firebaseChatId);
    appliedInitialRef.current = firebaseChatId;
    setSelectedChatId(firebaseChatId);
    onChatOpened?.();
  };

  const closeChat = () => {
    appliedInitialRef.current = null;
    setSelectedChatId(null);
    // Refresh chat list when returning
    loadChatRooms();
  };

  const handleCloseList = () => {
    appliedInitialRef.current = null;
    onClose();
  };

  const formatLastMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('ar', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (diffInHours < 168) { // Less than a week
      return date.toLocaleDateString('ar', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('ar', { 
        day: '2-digit', 
        month: '2-digit' 
      });
    }
  };

  const renderChatCard = (chat: ChatRoomList) => {
    return (
      <TouchableOpacity
        key={chat.id}
        style={styles.chatCard}
        onPress={() => openChat(chat.firebase_chat_id)}
      >
        <View style={styles.chatAvatar}>
          {chat.pet_image ? (
            <Image
              source={{ uri: chat.pet_image.startsWith('http') ? chat.pet_image.replace('http://','https://') : `https://api.petow.app${chat.pet_image.startsWith('/') ? '' : '/'}${chat.pet_image}` }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.defaultAvatar}>
              <Text style={styles.defaultAvatarText}>🐾</Text>
            </View>
          )}
        </View>
        
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.participantName}>{chat.other_participant}</Text>
            <Text style={styles.lastMessageTime}>
              {formatLastMessageTime(chat.updated_at)}
            </Text>
          </View>
          
          <View style={styles.chatDetails}>
            <Text style={styles.petName}>🐾 {chat.pet_name}</Text>
            <Text style={styles.lastMessage}>
              {firebaseConnected ? 'متصل بـ Firebase' : 'محفوظ محلياً'}
            </Text>
          </View>
        </View>
        
        <View style={styles.chatArrow}>
          <Text style={styles.arrowText}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>
        {activeTab === 'active' ? 'لا توجد محادثات نشطة' : 'لا توجد محادثات مؤرشفة'}
      </Text>
      <Text style={styles.emptyDescription}>
        {activeTab === 'active' 
          ? 'ابدأ محادثة جديدة من خلال طلب تزاوج'
          : 'المحادثات المؤرشفة ستظهر هنا'
        }
      </Text>
    </View>
  );

  if (selectedChatId) {
    return (
      <ChatScreen 
        firebaseChatId={selectedChatId} 
        onClose={closeChat} 
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleCloseList}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المحادثات</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Connection Status */}
      {!firebaseConnected && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionBannerText}>
            ⚠️ غير متصل بـ Firebase - البيانات محفوظة محلياً
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
            النشطة ({activeChats.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archived' && styles.activeTab]}
          onPress={() => setActiveTab('archived')}
        >
          <Text style={[styles.tabText, activeTab === 'archived' && styles.activeTabText]}>
            المؤرشفة ({archivedChats.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#02B7B4" />
          <Text style={styles.loadingText}>جاري تحميل المحادثات...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>خطأ في التحميل</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadChatRooms}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.chatList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {activeTab === 'active' ? (
            activeChats.length > 0 ? (
              activeChats.map(renderChatCard)
            ) : (
              renderEmptyState()
            )
          ) : (
            archivedChats.length > 0 ? (
              archivedChats.map(renderChatCard)
            ) : (
              renderEmptyState()
            )
          )}
        </ScrollView>
      )}
    </View>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#02B7B4',
  },
  tabText: {
    fontSize: 16,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#02B7B4',
    fontWeight: 'bold',
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
  chatList: {
    flex: 1,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  chatAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  defaultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e1e8ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultAvatarText: {
    fontSize: 24,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  lastMessageTime: {
    fontSize: 12,
    color: '#95a5a6',
  },
  chatDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  petName: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  lastMessage: {
    fontSize: 12,
    color: '#95a5a6',
  },
  chatArrow: {
    marginLeft: 10,
  },
  arrowText: {
    fontSize: 18,
    color: '#bdc3c7',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 20,
    color: '#bdc3c7',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default ChatListScreen;
