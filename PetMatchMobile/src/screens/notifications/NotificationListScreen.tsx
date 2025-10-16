import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { apiService } from '../../services/api';

interface NotificationListScreenProps {
  onClose: () => void;
  onMarkedAsRead?: () => void;
  onOpenPetDetails?: (petId: number) => void;
  onOpenBreedingOverview?: () => void;
  onOpenChatList?: () => void;
  onOpenChatByFirebaseId?: (firebaseId: string) => void;
}

interface AppNotification {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  time_ago?: string;
  type_display?: string;
  type?: string; // Backend notification type
  // Optional targeting fields (backend may provide some of these)
  pet_id?: number;
  pet?: { id?: number };
  target_type?: string;
  target_id?: number;
  breeding_request_id?: number;
  chat_id?: number;
  chat_firebase_id?: string;
  url?: string;
  extra_data?: any; // Backend extra_data field
}

const NotificationListScreen: React.FC<NotificationListScreenProps> = ({
  onClose,
  onMarkedAsRead,
  onOpenPetDetails,
  onOpenBreedingOverview,
  onOpenChatList,
  onOpenChatByFirebaseId,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(null);
  const [handledInvites, setHandledInvites] = useState<Set<string>>(new Set());

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const response = await apiService.getNotifications();
      if (response.success && response.data) {
        const raw = response.data as any;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
        
        // Filter out clinic invites that have already been handled
        // This is a safety measure in case the backend still returns them
        const filteredList = await Promise.all(
          list.map(async (notification: AppNotification) => {
            if (notification.type === 'clinic_invite') {
              const extra = notification.extra_data || {};
              const token = extra.invite_token || extra.inviteToken;
              
              // If we know this invite was already handled in this session, filter it out
              if (token && handledInvites.has(token)) {
                return null;
              }
              
              // Verify the invite status from the backend
              if (token) {
                try {
                  const invitesResponse = await apiService.getClinicInvites('all');
                  if (invitesResponse.success && Array.isArray(invitesResponse.data)) {
                    const invite = invitesResponse.data.find((inv: any) => inv.token === token);
                    // Filter out if invite is not pending
                    if (invite && invite.status !== 'pending') {
                      setHandledInvites(prev => new Set(prev).add(token));
                      return null;
                    }
                  }
                } catch (inviteErr) {
                  console.warn('Failed to verify invite status:', inviteErr);
                  // Continue showing the notification if we can't verify
                }
              }
            }
            return notification;
          })
        );
        
        // Remove null entries (filtered invites)
        const validNotifications = filteredList.filter((n): n is AppNotification => n !== null);
        setNotifications(validNotifications);
      } else {
        setNotifications([]);
        setError(response.error || 'تعذر تحميل الإشعارات');
      }
    } catch (err) {
      console.error('NotificationListScreen - loadNotifications error:', err);
      setError('حدث خطأ غير متوقع');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [handledInvites]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadNotifications();
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await apiService.markAllNotificationsAsRead();
      if (response.success) {
        await loadNotifications();
        onMarkedAsRead?.();
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      console.error('NotificationListScreen - markAll error:', err);
      setError('تعذر تحديث حالة الإشعارات');
    }
  };

  const resolveTarget = (n: AppNotification): { kind: 'pet' | 'breeding' | 'chat' | 'url' | 'none'; id?: number; url?: string } => {
    // Handle "حيوان جديد بالقرب منك" notifications specifically
    if (n.type === 'pet_nearby' || n.title?.includes('حيوان جديد بالقرب منك')) {
      // Check extra_data for pet_id (backend sends this)
      if (n.extra_data && typeof n.extra_data === 'object' && n.extra_data.pet_id) {
        const petId = typeof n.extra_data.pet_id === 'number' ? n.extra_data.pet_id : parseInt(n.extra_data.pet_id.toString(), 10);
        if (Number.isFinite(petId)) return { kind: 'pet', id: petId };
      }
      
      // Check if there's a pet object with ID
      if (n.pet && typeof n.pet === 'object' && 'id' in n.pet && n.pet.id !== undefined) {
        const petId = typeof n.pet.id === 'number' ? n.pet.id : parseInt(String(n.pet.id), 10);
        if (Number.isFinite(petId)) return { kind: 'pet', id: petId };
      }
    }
    
    // General case: try different possible fields for pet ID
    const petId = n.pet_id || n.pet?.id || (typeof n.target_type === 'string' && n.target_type.toLowerCase() === 'pet' ? n.target_id : undefined);
    if (typeof petId === 'number') return { kind: 'pet', id: petId };
    
    // Check extra_data for pet_id (general case)
    if (n.extra_data && typeof n.extra_data === 'object' && n.extra_data.pet_id) {
      const petId = typeof n.extra_data.pet_id === 'number' ? n.extra_data.pet_id : parseInt(n.extra_data.pet_id.toString(), 10);
      if (Number.isFinite(petId)) return { kind: 'pet', id: petId };
    }
    
    if (typeof n.breeding_request_id === 'number' || (typeof n.target_type === 'string' && n.target_type.toLowerCase().includes('breeding'))) {
      return { kind: 'breeding' };
    }
    if (n.chat_firebase_id || typeof n.chat_id === 'number' || (typeof n.target_type === 'string' && n.target_type.toLowerCase().includes('chat'))) {
      return { kind: 'chat' };
    }
    if (n.url && typeof n.url === 'string' && n.url.length) {
      // Try to extract pet id from url like /pets/123/
      const m = n.url.match(/\/pets\/(\d+)\//);
      if (m) return { kind: 'pet', id: Number(m[1]) };
      return { kind: 'url', url: n.url };
    }
    // Fallback: try to extract ID from text if backend didn't include fields
    const text = `${n.title || ''} ${n.message || ''}`;
    const m2 = text.match(/(?:حيوان|pets?)\s*(?:رقم|#)?\s*(\d{1,8})/i);
    if (m2) {
      const idNum = Number(m2[1]);
      if (Number.isFinite(idNum)) return { kind: 'pet', id: idNum };
    }
    return { kind: 'none' };
  };

  const handleNotificationPress = async (item: AppNotification) => {
    try {
      if (!item.is_read) {
        // Optimistic update
        setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
        await apiService.markNotificationAsRead(item.id);
        onMarkedAsRead?.();
      }
    } catch (_e) {
      // ignore
    }
    const target = resolveTarget(item);
    // Navigate based on target
    if (target.kind === 'pet' && typeof target.id === 'number') {
      onClose();
      onOpenPetDetails?.(target.id);
      return;
    }
    if (target.kind === 'breeding') {
      onClose();
      onOpenBreedingOverview?.();
      return;
    }
    if (target.kind === 'chat') {
      const firebaseId = (item as any).chat_firebase_id
        || (item.extra_data && (item.extra_data.firebase_chat_id || item.extra_data.chat_id || item.extra_data.chat_room_id));
      onClose();
      if (firebaseId && typeof firebaseId === 'string') {
        if (typeof onOpenChatByFirebaseId === 'function') {
          onOpenChatByFirebaseId(firebaseId);
        } else if (typeof onOpenChatList === 'function') {
          onOpenChatList();
        }
      } else {
        onOpenChatList?.();
      }
      return;
    }
    // Default: just close
    onClose();
  };

  const handleInviteAction = async (item: AppNotification, action: 'accept' | 'decline') => {
    const extra = item.extra_data || {};
    const token: string | undefined = extra.invite_token || extra.inviteToken;
    if (!token) {
      console.warn('Clinic invite notification missing token payload', item);
      return;
    }

    const actionKey = `${token}:${action}`;
    setError(null);
    try {
      setInviteActionLoading(actionKey);
      const response = await apiService.respondToClinicInvite(token, action);
      if (!response.success && response.error) {
        // Check if the error indicates the invite was already handled
        const errorMsg = response.error.toLowerCase();
        if (errorMsg.includes('already') || errorMsg.includes('بالفعل') || 
            errorMsg.includes('accepted') || errorMsg.includes('declined') ||
            errorMsg.includes('قبول') || errorMsg.includes('رفض')) {
          // Invite was already handled, remove the notification silently
          setHandledInvites(prev => new Set(prev).add(token));
          setNotifications((prev) => prev.filter((n) => n.id !== item.id));
        } else {
          setError(response.error);
        }
      } else {
        // Mark invite as handled in local state
        setHandledInvites(prev => new Set(prev).add(token));
        // Optimistically remove the notification once handled
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
        if (!item.is_read) {
          try {
            await apiService.markNotificationAsRead(item.id);
            onMarkedAsRead?.();
          } catch (markErr) {
            console.warn('Failed to mark invite notification as read', markErr);
          }
        }
      }
    } catch (err) {
      console.error('handleInviteAction error:', err);
      setError('تعذر تحديث حالة الدعوة');
    } finally {
      setInviteActionLoading(null);
    }
  };

  const renderNotificationCard = (item: AppNotification) => {
    const extra = item.extra_data || {};
    const inviteToken: string | undefined = extra.invite_token || extra.inviteToken;
    const isInvite = item.type === 'clinic_invite' && !!inviteToken;
    const acceptKey = inviteToken ? `${inviteToken}:accept` : null;
    const declineKey = inviteToken ? `${inviteToken}:decline` : null;

    return (
      <TouchableOpacity
        key={item.id}
        onPress={isInvite ? undefined : () => handleNotificationPress(item)}
        activeOpacity={isInvite ? 1 : 0.85}
        style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
      >
      <View style={styles.notificationHeader}>
        <Text style={styles.notificationTitle}>{item.title || 'إشعار'}</Text>
        <Text style={styles.notificationTime}>{item.time_ago || ''}</Text>
      </View>
      {item.type_display ? (
        <Text style={styles.notificationType}>{item.type_display}</Text>
      ) : null}
      <Text style={styles.notificationMessage}>{item.message}</Text>
      {isInvite ? (
        <View style={styles.inviteActions}>
          <TouchableOpacity
            style={[styles.inviteButton, styles.inviteDeclineButton, inviteActionLoading === declineKey && styles.inviteButtonDisabled]}
            onPress={() => handleInviteAction(item, 'decline')}
            disabled={inviteActionLoading === declineKey}
            activeOpacity={0.8}
          >
            <Text style={[styles.inviteButtonText, styles.inviteDeclineText]}>رفض</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inviteButton, styles.inviteAcceptButton, inviteActionLoading === acceptKey && styles.inviteButtonDisabled]}
            onPress={() => handleInviteAction(item, 'accept')}
            disabled={inviteActionLoading === acceptKey}
            activeOpacity={0.8}
          >
            <Text style={styles.inviteButtonText}>قبول</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

  return (
    <ScrollView
      style={styles.overlayWrapper}
      contentContainerStyle={styles.overlayContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.overlayHeader}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.overlayTitle}>الإشعارات</Text>
        <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllRead}>
          <Text style={styles.markAllText}>تعيين كمقروء</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#02B7B4" />
          <Text style={styles.loadingText}>جاري تحميل الإشعارات...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>لا توجد إشعارات حالياً.</Text>
        </View>
      ) : (
        notifications.map(renderNotificationCard)
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  overlayWrapper: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  overlayContent: {
    padding: 20,
    paddingBottom: 40,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ecf0f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#34495e',
  },
  overlayTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#02B7B4',
  },
  markAllText: {
    color: '#fff',
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    color: '#7f8c8d',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#7f8c8d',
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  unreadCard: {
    borderWidth: 1,
    borderColor: '#02B7B4',
    backgroundColor: '#f0f9ff',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  notificationTime: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  notificationType: {
    fontSize: 12,
    color: '#02B7B4',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#34495e',
    lineHeight: 20,
  },
  inviteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  inviteButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginLeft: 12,
  },
  inviteAcceptButton: {
    backgroundColor: '#02B7B4',
  },
  inviteDeclineButton: {
    backgroundColor: '#ecf0f1',
    borderWidth: 1,
    borderColor: '#d0d7de',
  },
  inviteButtonDisabled: {
    opacity: 0.6,
  },
  inviteButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  inviteDeclineText: {
    color: '#34495e',
  },
  errorText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#e74c3c',
  },
});

export default NotificationListScreen;
