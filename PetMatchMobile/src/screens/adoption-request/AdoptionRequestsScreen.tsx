import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { apiService, AdoptionRequest } from '../../services/api';
import ChatListScreen from '../chat/ChatListScreen';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import AppIcon from '../../components/icons/AppIcon';

interface AdoptionRequestsScreenProps {
  onClose: () => void;
}

type TabType = 'sent' | 'received';

const AdoptionRequestsScreen: React.FC<AdoptionRequestsScreenProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [sentRequests, setSentRequests] = useState<AdoptionRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<AdoptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [chatLoadingId, setChatLoadingId] = useState<number | null>(null);
  const [showChatList, setShowChatList] = useState(false);
  const [initialChatFirebaseId, setInitialChatFirebaseId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const [sentResponse, receivedResponse] = await Promise.all([
        apiService.getMyAdoptionRequests(),
        apiService.getReceivedAdoptionRequests(),
      ]);

      if (sentResponse.success && sentResponse.data) {
        setSentRequests(sentResponse.data);
      }

      if (receivedResponse.success && receivedResponse.data) {
        setReceivedRequests(receivedResponse.data);
      }
    } catch (error) {
      console.error('Error loading adoption requests:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل الطلبات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRequests();
  };

  const handleRespond = async (requestId: number, action: 'approve' | 'reject') => {
    const actionText = action === 'approve' ? 'قبول' : 'رفض';
    
    Alert.alert(
      `${actionText} الطلب`,
      `هل أنت متأكد من ${actionText} طلب التبني؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: actionText,
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setActionLoading(requestId);
              const result = await apiService.respondToAdoptionRequest(requestId, action);
              
              if (result.success) {
                Alert.alert(
                  'تم بنجاح',
                  `تم ${actionText} طلب التبني بنجاح`,
                  [{ text: 'حسناً', onPress: loadRequests }]
                );
              } else {
                Alert.alert('خطأ', result.error || `فشل ${actionText} الطلب`);
              }
            } catch (error) {
              console.error('Error responding to adoption request:', error);
              Alert.alert('خطأ', `حدث خطأ أثناء ${actionText} الطلب`);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleStartChat = async (request: AdoptionRequest) => {
    try {
      setChatLoadingId(request.id);
      let firebaseId: string | undefined;

      const existing = await apiService.getChatRoomByAdoptionRequest(request.id);
      if (existing.success && existing.data && existing.data.firebase_chat_id) {
        firebaseId = existing.data.firebase_chat_id;
      } else if (existing.status === 404 || (existing.error && existing.error.includes('لا توجد'))) {
        const created = await apiService.createAdoptionChatRoom(request.id);
        if (created.success && created.data?.chat_room?.firebase_chat_id) {
          firebaseId = created.data.chat_room.firebase_chat_id;
        } else {
          Alert.alert('خطأ', created.error || 'تعذر إنشاء المحادثة');
          return;
        }
      } else if (!existing.success) {
        Alert.alert('خطأ', existing.error || 'تعذر تحميل المحادثة');
        return;
      }

      if (firebaseId) {
        setInitialChatFirebaseId(firebaseId);
        setShowChatList(true);
      } else {
        Alert.alert('خطأ', 'تعذر تحديد معرف المحادثة');
      }
    } catch (error) {
      console.error('Error starting adoption chat:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء محاولة فتح المحادثة');
    } finally {
      setChatLoadingId(null);
    }
  };

  const getImageUrl = (url?: string) => {
    return resolveMediaUrl(url, 'https://via.placeholder.com/400x300?text=No+Image');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FF9800';
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#f44336';
      case 'completed':
        return '#2196F3';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'قيد المراجعة';
      case 'approved':
        return 'مقبول';
      case 'rejected':
        return 'مرفوض';
      case 'completed':
        return 'مكتمل';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const renderRequest = (request: AdoptionRequest, isSent: boolean) => {
    const isExpanded = expandedId === request.id;
    const pet = request.pet;
    const isActionPending = actionLoading === request.id;

    return (
      <View key={request.id} style={styles.requestCard}>
        {/* Header */}
        <TouchableOpacity
          style={styles.requestHeader}
          onPress={() => setExpandedId(isExpanded ? null : request.id)}
          activeOpacity={0.7}
        >
          <Image source={{ uri: getImageUrl(pet?.main_image) }} style={styles.petImage} />
          
          <View style={styles.requestInfo}>
            <Text style={styles.petName}>{pet?.name || 'حيوان'}</Text>
            <Text style={styles.requesterName}>
              {isSent ? `المالك: ${pet?.owner_name || 'غير معروف'}` : `الطالب: ${request.adopter_name}`}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
                <Text style={styles.statusText}>{getStatusLabel(request.status)}</Text>
              </View>
              <Text style={styles.dateText}>{formatDate(request.created_at)}</Text>
            </View>
          </View>

          <Text style={styles.expandIcon}>{isExpanded ? '▼' : '◀'}</Text>
        </TouchableOpacity>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={styles.requestDetails}>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>معلومات شخصية</Text>
              <Text style={styles.detailText}>العمر: {request.adopter_age} سنة</Text>
              <Text style={styles.detailText}>المهنة: {request.adopter_occupation}</Text>
              <Text style={styles.detailText}>نوع السكن: {
                request.housing_type === 'apartment' ? 'شقة' :
                request.housing_type === 'house' ? 'منزل' : 'فيلا'
              }</Text>
              <Text style={styles.detailText}>أفراد العائلة: {request.family_members}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>الخبرة والوقت</Text>
              <Text style={styles.detailText}>مستوى الخبرة: {
                request.experience_level === 'none' ? 'لا يوجد' :
                request.experience_level === 'basic' ? 'مبتدئ' : 'متمرس'
              }</Text>
              <Text style={styles.detailText}>الوقت المتاح: {
                request.time_availability === 'low' ? 'قليل' :
                request.time_availability === 'medium' ? 'متوسط' : 'كثير'
              }</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>سبب التبني</Text>
              <Text style={styles.detailTextMultiline}>{request.reason_for_adoption}</Text>
            </View>

            {request.feeding_plan && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>خطة التغذية</Text>
                <Text style={styles.detailTextMultiline}>{request.feeding_plan}</Text>
              </View>
            )}

            {request.exercise_plan && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>خطة التمارين</Text>
                <Text style={styles.detailTextMultiline}>{request.exercise_plan}</Text>
              </View>
            )}

            {request.vet_care_plan && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>خطة الرعاية البيطرية</Text>
                <Text style={styles.detailTextMultiline}>{request.vet_care_plan}</Text>
              </View>
            )}

            {request.emergency_plan && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>خطة الطوارئ</Text>
                <Text style={styles.detailTextMultiline}>{request.emergency_plan}</Text>
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>الموافقات</Text>
              <Text style={styles.detailText}>
                {request.family_agreement ? '✓' : '✗'} موافقة العائلة
              </Text>
              <Text style={styles.detailText}>
                {request.agrees_to_follow_up ? '✓' : '✗'} زيارات المتابعة
              </Text>
              <Text style={styles.detailText}>
                {request.agrees_to_vet_care ? '✓' : '✗'} الرعاية البيطرية
              </Text>
              <Text style={styles.detailText}>
                {request.agrees_to_training ? '✓' : '✗'} التدريب
              </Text>
            </View>

            {request.notes && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>ملاحظات</Text>
                <Text style={styles.detailTextMultiline}>{request.notes}</Text>
              </View>
            )}

            {(['approved', 'completed'].includes(request.status)) && (
              <TouchableOpacity
                style={styles.chatButton}
                onPress={() => handleStartChat(request)}
                disabled={chatLoadingId === request.id}
              >
                {chatLoadingId === request.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.chatButtonText}>💬 بدء المحادثة</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Action Buttons for Received Pending Requests */}
            {!isSent && request.status === 'pending' && (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={() => handleRespond(request.id, 'approve')}
                  disabled={isActionPending}
                >
                  {isActionPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.actionButtonText}>✓ قبول</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => handleRespond(request.id, 'reject')}
                  disabled={isActionPending}
                >
                  {isActionPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.actionButtonText}>✗ رفض</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderContent = () => {
    const requests = activeTab === 'sent' ? sentRequests : receivedRequests;

    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      );
    }

    if (requests.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <AppIcon name="document" size={64} color="#bbb" />
          <Text style={styles.emptyTitle}>
            {activeTab === 'sent' ? 'لا توجد طلبات مُرسلة' : 'لا توجد طلبات مُستلمة'}
          </Text>
          <Text style={styles.emptyText}>
            {activeTab === 'sent'
              ? 'لم تقم بإرسال أي طلبات تبني بعد'
              : 'لم تستلم أي طلبات تبني لحيواناتك'}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
        }
      >
        {requests.map((request) => renderRequest(request, activeTab === 'sent'))}
        <View style={styles.bottomPadding} />
      </ScrollView>
    );
  };

  if (showChatList) {
    return (
      <ChatListScreen
        initialFirebaseChatId={initialChatFirebaseId || undefined}
        onChatOpened={() => setInitialChatFirebaseId(null)}
        onClose={() => {
          setShowChatList(false);
          setInitialChatFirebaseId(null);
          loadRequests();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>طلبات التبني</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            المُستلمة ({receivedRequests.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            المُرسلة ({sentRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  requestCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  requestHeader: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  petImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  requestInfo: {
    flex: 1,
    marginLeft: 12,
  },
  petName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  requesterName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },
  expandIcon: {
    fontSize: 20,
    color: '#999',
    marginLeft: 8,
  },
  requestDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    padding: 16,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  detailTextMultiline: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  chatButton: {
    marginTop: 12,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 20,
  },
});

export default AdoptionRequestsScreen;
