import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
  Modal,
  TouchableWithoutFeedback,
  InteractionManager,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, PaginatedResponse, Pet, UserChatStatus } from '../../services/api';
import PetDetailsScreen from '../pets/PetDetailsScreen';
import AddPetScreen from '../pets/AddPetScreen';
import ChatListScreen from '../chat/ChatListScreen';
import NotificationListScreen from '../notifications/NotificationListScreen';
import AdoptionRequestsScreen from '../adoption-request/AdoptionRequestsScreen';
import ClinicsScreen from '../clinics/ClinicsScreen';
import ServicesScreen from '../services/ServicesScreen';
import {
  ServiceCategoryKey,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_EMOJI,
  HOME_FEATURED_CATEGORIES,
} from '../../utils/serviceCategories';
import NotificationPermissionModal from '../../components/NotificationPermissionModal';
import FastImage from 'react-native-fast-image';
import { getAndRegisterFcmToken } from '../../services/notifications';
import { useFeatureFlags } from '../../services/featureFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildMediaCandidates as buildResolvedMediaCandidates } from '../../utils/mediaUrl';
import { getFloatingTabBarContentPadding } from '../../utils/tabBarLayout';
import AppIcon, { AppIconName, IconSize } from '../../components/icons/AppIcon';

type PetFilterType = 'all' | 'cats' | 'dogs';
type RequestOwner = 'sent' | 'received';

interface BreedingRequestPreview {
  id?: number;
  status?: string;
  status_display?: string;
  created_at?: string;
  meeting_date?: string;
  message?: string;
  contact_phone?: string;
  response_message?: string;
  requester_name?: string;
  receiver_name?: string;
  target_pet?: { name?: string } | null;
  requester_pet?: { name?: string } | null;
  target_pet_name?: string;
  requester_pet_name?: string;
  target_owner_name?: string;
  requester_owner_name?: string;
  target_pet_details?: {
    id?: number;
    name?: string;
    main_image?: string;
    pet_type_display?: string;
    gender_display?: string;
    breed_name?: string;
  } | null;
  requester_pet_details?: {
    id?: number;
    name?: string;
    main_image?: string;
    pet_type_display?: string;
    gender_display?: string;
    breed_name?: string;
  } | null;
  veterinary_clinic_details?: { name?: string } | null;
}

interface BreedingRequestsOverviewProps {
  myRequests: BreedingRequestPreview[];
  receivedRequests: BreedingRequestPreview[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  onRespond: (request: BreedingRequestPreview, action: 'approve' | 'reject') => void;
  onOpenChat: (request: BreedingRequestPreview) => void;
  onOpenPetDetails: (petId: number) => void;
}

interface QuickAction {
  key: string;
  label: string;
  icon: AppIconName;
  iconColor: string;
  filled?: boolean;
  onPress: () => void;
  isFilter?: boolean;
  filterType?: PetFilterType;
}

type HomeScreenProps = {
  triggerAddPet?: number | null;
  onAddPetHandled?: () => void;
  triggerBreedingOverview?: number | null;
  onBreedingOverviewHandled?: () => void;
  triggerNotifications?: number | null;
  onNotificationsHandled?: () => void;
  triggerAdoptionRequests?: number | null;
  onAdoptionRequestsHandled?: () => void;
  triggerPetDetails?: number | null;
  triggerPetDetailsId?: number | null;
  onPetDetailsHandled?: () => void;
  onOpenAdoption?: (searchQuery?: string) => void;
  onOpenMatches?: (searchQuery?: string) => void;
  clinicChatFirebaseId?: string | null;
  onClinicChatHandled?: () => void;
  onOpenProfileTab?: () => void;
  onSetTabBarVisible?: (visible: boolean) => void;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد المراجعة',
  accepted: 'تم القبول',
  approved: 'تم القبول',
  rejected: 'تم الرفض',
  cancelled: 'ملغي',
  completed: 'مكتمل',
};

const MAX_PREVIEW_ITEMS = 3;
const REQUEST_PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=200&q=80';
const PET_PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80';
const AVAILABLE_PET_STATUS_KEYS = new Set([
  'available',
  'available_for_adoption',
  'available_for_breeding',
  'active',
]);

type PetStatusAppearance = {
  label: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  icon?: string;
  isUnavailable: boolean;
};

const DEFAULT_STATUS_APPEARANCE: PetStatusAppearance = {
  label: 'غير متاح',
  textColor: '#fff',
  backgroundColor: 'rgba(108, 117, 125, 0.85)',
  borderColor: 'rgba(108, 117, 125, 0.35)',
  icon: 'ℹ️',
  isUnavailable: true,
};

const buildImageCandidates = (raw?: string | null, fallback: string = PET_PLACEHOLDER_IMAGE): string[] => {
  return buildResolvedMediaCandidates(raw, fallback);
};

const getPetStatusAppearance = (status?: string | null, statusDisplay?: string | null): PetStatusAppearance => {
  const normalized = (status || '').toLowerCase().trim();
  const label = statusDisplay || status || DEFAULT_STATUS_APPEARANCE.label;

  const unavailableAppearance: PetStatusAppearance = {
    label,
    textColor: '#fff',
    backgroundColor: 'rgba(192, 57, 43, 0.85)',
    borderColor: 'rgba(192, 57, 43, 0.25)',
    icon: '⛔',
    isUnavailable: true,
  };

  if (!normalized) {
    return { ...DEFAULT_STATUS_APPEARANCE, label };
  }

  const isExplicitlyAvailable =
    (normalized.includes('available') && !normalized.includes('unavailable')) ||
    AVAILABLE_PET_STATUS_KEYS.has(normalized) ||
    normalized === 'ready_for_adoption' ||
    normalized === 'adoption_pending';

  if (
    normalized.includes('unavailable') ||
    normalized.includes('inactive') ||
    normalized.includes('closed') ||
    normalized.includes('hidden') ||
    normalized.includes('paused') ||
    normalized.includes('disabled')
  ) {
    return unavailableAppearance;
  }

  if (isExplicitlyAvailable) {
    return {
      label,
      textColor: '#0f5132',
      backgroundColor: 'rgba(46, 204, 113, 0.18)',
      borderColor: 'rgba(46, 204, 113, 0.35)',
      icon: '✅',
      isUnavailable: false,
    };
  }

  if (
    normalized.includes('pending') ||
    normalized.includes('review') ||
    normalized.includes('processing') ||
    normalized.includes('verifying') ||
    normalized.includes('waiting')
  ) {
    return {
      label,
      textColor: '#3d2f0f',
      backgroundColor: 'rgba(243, 156, 18, 0.2)',
      borderColor: 'rgba(243, 156, 18, 0.35)',
      icon: '⏳',
      isUnavailable: true,
    };
  }

  if (
    normalized === 'adopted' ||
    normalized.includes('adopted') ||
    normalized.includes('sold') ||
    normalized.includes('matched') ||
    normalized.includes('reserved') ||
    normalized.includes('completed')
  ) {
    return {
      label,
      textColor: '#fff',
      backgroundColor: 'rgba(155, 89, 182, 0.85)',
      borderColor: 'rgba(155, 89, 182, 0.25)',
      icon: '🎉',
      isUnavailable: true,
    };
  }

  return { ...DEFAULT_STATUS_APPEARANCE, label };
};

const formatDate = (value?: string) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

const getStatusLabel = (request: BreedingRequestPreview) => {
  if (request.status_display) {
    return request.status_display;
  }
  if (request.status && STATUS_LABELS[request.status]) {
    return STATUS_LABELS[request.status];
  }
  return 'جارٍ المتابعة';
};

const getStatusColor = (status?: string) => {
  switch (status) {
    case 'accepted':
    case 'approved':
    case 'completed':
      return '#2ecc71';
    case 'rejected':
    case 'cancelled':
      return '#e74c3c';
    case 'pending':
    default:
      return '#f1c40f';
  }
};

const extractPartnerName = (request: BreedingRequestPreview, owner: RequestOwner) => {
  if (owner === 'sent') {
    return (
      request.target_pet?.name ||
      request.target_pet_name ||
      request.target_owner_name ||
      'الطرف الآخر'
    );
  }

  return (
    request.requester_pet?.name ||
    request.requester_pet_name ||
    request.requester_owner_name ||
    'الطرف الآخر'
  );
};

const BreedingRequestsOverview: React.FC<BreedingRequestsOverviewProps> = ({
  myRequests,
  receivedRequests,
  onClose,
  onRefresh,
  refreshing,
  onRespond,
  onOpenChat,
  onOpenPetDetails,
}) => {
  const renderRequestCard = (
    request: BreedingRequestPreview,
    owner: RequestOwner,
    index: number,
  ) => {
    const statusColor = getStatusColor(request.status);
    const statusLabel = getStatusLabel(request);
    const status = request.status || 'pending';
    const partnerPet = owner === 'sent' ? request.target_pet_details : request.requester_pet_details;
    const myPet = owner === 'sent' ? request.requester_pet_details : request.target_pet_details;
    const partnerName = extractPartnerName(request, owner);
    const partnerImageRaw = partnerPet?.main_image || '';
    const partnerImage = buildImageCandidates(partnerImageRaw, REQUEST_PLACEHOLDER_IMAGE)[0];
    const createdAt = formatDate(request.created_at);
    const meetingDate = formatDate(request.meeting_date);
    const clinicName = request.veterinary_clinic_details?.name;
    const contactPhone = request.contact_phone;

    return (
      <View key={`${owner}-${request.id ?? index}`} style={styles.requestCard}>
        <View style={styles.requestCardHeader}>
          <View style={styles.requestHeaderText}>
            <Text style={styles.requestCardTitle}>{partnerName}</Text>
            <Text style={styles.requestCardSubtitle}>
              {owner === 'sent' ? `حيوانك: ${myPet?.name || '—'}` : `حيوان الطرف الآخر: ${partnerPet?.name || '—'}`}
            </Text>
          </View>
          <View style={[styles.requestStatusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.requestStatusText}>{statusLabel}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.requestCardBody}
          activeOpacity={0.85}
          onPress={() => {
            const partnerId = partnerPet?.id;
            if (typeof partnerId === 'number') {
              onOpenPetDetails(partnerId);
            }
          }}
        >
          <Image source={{ uri: partnerImage }} style={styles.requestAvatar} />
          <View style={styles.requestInfo}>
            <Text style={styles.requestMetaText}>أُنشئ في: {createdAt}</Text>
            {request.meeting_date ? (
              <Text style={styles.requestMetaText}>موعد المقابلة: {meetingDate}</Text>
            ) : null}
            {clinicName ? (
              <Text style={styles.requestMetaText}>العيادة: {clinicName}</Text>
            ) : null}
            {status !== 'pending' && contactPhone ? (
              <Text style={styles.requestMetaText}>هاتف التواصل: {contactPhone}</Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {request.message ? (
          <Text style={styles.requestMessage} numberOfLines={3}>
            {request.message}
          </Text>
        ) : null}
        {status === 'rejected' && request.response_message ? (
          <View style={styles.requestNoteBlock}>
            <Text style={styles.requestNoteLabel}>سبب الرفض:</Text>
            <Text style={styles.requestNoteText}>{request.response_message}</Text>
          </View>
        ) : null}

        {owner === 'received' && status === 'pending' ? (
          <View style={styles.requestActionsRow}>
            <TouchableOpacity
              style={[styles.requestActionButton, styles.rejectButton]}
              onPress={() => onRespond(request, 'reject')}
            >
              <Text style={[styles.requestActionText, styles.rejectButtonText]}>رفض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.requestActionButton, styles.acceptButton]}
              onPress={() => onRespond(request, 'approve')}
            >
              <Text style={[styles.requestActionText, styles.acceptButtonText]}>قبول</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {status !== 'pending' ? (
          <View style={styles.requestActionsRow}>
            <TouchableOpacity
              style={[styles.requestActionButton, styles.chatButton]}
              onPress={() => onOpenChat(request)}
            >
              <Text style={[styles.requestActionText, styles.chatButtonText]}>فتح المحادثة</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.overlayWrapper}
      contentContainerStyle={styles.overlayContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.overlayHeader}>
        <TouchableOpacity style={styles.closeIconButton} onPress={onClose} accessibilityLabel="إغلاق">
          <AppIcon name="close" size={IconSize.md} color="#64748B" accessibilityLabel="إغلاق" />
        </TouchableOpacity>
        <Text style={styles.overlayTitle}>طلبات التزاوج</Text>
        <View style={styles.overlaySpacer} />
      </View>

      <Text style={styles.overlaySubtitle}>تابع طلباتك الحالية وتعرف على الطلبات الجديدة بسهولة.</Text>

      <View style={styles.overlaySection}>
        <Text style={styles.overlaySectionTitle}>الطلبات المرسلة</Text>
        {myRequests.length === 0 ? (
          <Text style={styles.overlayEmptyText}>لا توجد طلبات أرسلتها بعد.</Text>
        ) : (
          myRequests.map((request, index) =>
            renderRequestCard(request, 'sent', index)
          )
        )}
      </View>

      <View style={styles.overlaySection}>
        <Text style={styles.overlaySectionTitle}>الطلبات المستلمة</Text>
        {receivedRequests.length === 0 ? (
          <Text style={styles.overlayEmptyText}>لم تستلم أي طلبات جديدة حالياً.</Text>
        ) : (
          receivedRequests.map((request, index) =>
            renderRequestCard(request, 'received', index)
          )
        )}
      </View>
    </ScrollView>
  );
};

const HomeScreen: React.FC<HomeScreenProps> = ({
  triggerAddPet,
  onAddPetHandled,
  triggerBreedingOverview,
  onBreedingOverviewHandled,
  triggerNotifications,
  onNotificationsHandled,
  triggerAdoptionRequests,
  onAdoptionRequestsHandled,
  triggerPetDetails,
  triggerPetDetailsId,
  onPetDetailsHandled,
  onOpenAdoption,
  onOpenMatches,
  clinicChatFirebaseId,
  onClinicChatHandled,
  onOpenProfileTab,
  onSetTabBarVisible,
}) => {
  const { logout, shouldShowNotificationModal, setShouldShowNotificationModal } = useAuth();
  const { clinicHomeEnabled, requestChatV2Enabled, refreshFlags } = useFeatureFlags();
  const insets = useSafeAreaInsets();
  const [popularPets, setPopularPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [showAddPet, setShowAddPet] = useState(false);
  const [activeType, setActiveType] = useState<PetFilterType>('all');
  const [showChatList, setShowChatList] = useState(false);
  const [initialChatFirebaseId, setInitialChatFirebaseId] = useState<string | null>(null);
  const [showBreedingOverview, setShowBreedingOverview] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAdoptionRequests, setShowAdoptionRequests] = useState(false);
  const [showClinics, setShowClinics] = useState(false);
  const [servicesCategory, setServicesCategory] = useState<ServiceCategoryKey | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [myBreedingRequests, setMyBreedingRequests] = useState<BreedingRequestPreview[]>([]);
  const [receivedBreedingRequests, setReceivedBreedingRequests] = useState<BreedingRequestPreview[]>([]);
  const [chatStatus, setChatStatus] = useState<UserChatStatus | null>(null);
  const [responseDialog, setResponseDialog] = useState<{ request: BreedingRequestPreview; mode: 'approve' | 'reject' } | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [responding, setResponding] = useState(false);
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [petImageCandidateIndex, setPetImageCandidateIndex] = useState<Record<number, number>>({});
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null);
  const mainScrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const addPetTriggerRef = useRef<number | null>(null);
  const breedingOverviewTriggerRef = useRef<number | null>(null);
  const notificationsTriggerRef = useRef<number | null>(null);
  const adoptionRequestsTriggerRef = useRef<number | null>(null);
  const petDetailsTriggerRef = useRef<number | null>(null);
  const hasNestedFullscreenFlow =
    selectedPetId !== null ||
    showAddPet ||
    showChatList ||
    showBreedingOverview ||
    showNotifications ||
    showAdoptionRequests ||
    showClinics;

  useEffect(() => {
    if (!onSetTabBarVisible) return;
    onSetTabBarVisible(!hasNestedFullscreenFlow);
    return () => onSetTabBarVisible(true);
  }, [hasNestedFullscreenFlow, onSetTabBarVisible]);

  // Handle notification permission granted
  const handleNotificationPermissionGranted = async () => {
    try {
      await getAndRegisterFcmToken();
      console.log('✅ FCM token registered after permission granted');
    } catch (error) {
      console.log('⚠️ Failed to register FCM token after permission:', error);
    }
  };

  useEffect(() => {
    loadPopularPets();
    loadDashboardData();
  }, []);

  useEffect(() => {
    setPetImageCandidateIndex({});
  }, [popularPets]);

  const loadPopularPets = async (
    type: PetFilterType = activeType,
    query?: string,
  ) => {
    try {
      setLoading(true);
      console.log('🏠 HomeScreen - Loading popular pets...');
      const searchValue = (typeof query === 'string' ? query : searchQuery).trim();

      const response = await apiService.getPets({
        ordering: '-created_at',
        page_size: 6,
        pet_type: type === 'all' ? undefined : type,
        search: searchValue ? searchValue : undefined,
      });

      if (response.success && response.data) {
        console.log(' HomeScreen - Popular pets loaded:', response.data.results);
        setPopularPets(response.data.results);
      } else {
        console.log(' HomeScreen - Failed to load pets:', response.error);
        setPopularPets([]);
      }
    } catch (error) {
      console.error(' HomeScreen - Error loading pets:', error);
      setPopularPets([]);
    } finally {
      setLoading(false);
    }
  };

  const parseBreedingData = (data: any): BreedingRequestPreview[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  };

  const loadDashboardData = async () => {
    try {
      setDashboardLoading(true);

      const [
        myRequestsResult,
        receivedRequestsResult,
        chatStatusResult,
        unreadCountResult,
        myPetsResult,
      ] = await Promise.allSettled([
        apiService.getMyBreedingRequests(),
        apiService.getReceivedBreedingRequests(),
        apiService.getUserChatStatus(),
        apiService.getUnreadNotificationsCount(),
        apiService.getMyPets(),
      ]);

      // Debug: Log the results
      console.log('🔍 Dashboard Data Loading Results:', {
        myRequests: myRequestsResult.status === 'fulfilled' ? {
          success: myRequestsResult.value.success,
          dataType: typeof myRequestsResult.value.data,
          isArray: Array.isArray(myRequestsResult.value.data),
        } : { error: myRequestsResult.status === 'rejected' ? myRequestsResult.reason : 'Failed' },
        receivedRequests: receivedRequestsResult.status === 'fulfilled' ? {
          success: receivedRequestsResult.value.success,
          dataType: typeof receivedRequestsResult.value.data,
          isArray: Array.isArray(receivedRequestsResult.value.data),
        } : { error: receivedRequestsResult.status === 'rejected' ? receivedRequestsResult.reason : 'Failed' },
      });

      if (
        myRequestsResult.status === 'fulfilled' &&
        myRequestsResult.value.success
      ) {
        console.log('🔍 Raw My Breeding Requests data:', myRequestsResult.value.data);
        const parsed = parseBreedingData(myRequestsResult.value.data as any);
        console.log('✅ Parsed My Breeding Requests:', parsed.length, 'requests');
        console.log('✅ First request preview:', parsed[0] ? {
          id: parsed[0].id,
          status: parsed[0].status,
          requester_name: parsed[0].requester_name,
          target_pet_name: parsed[0].target_pet_details?.name,
        } : 'No requests');
        setMyBreedingRequests(parsed);
      } else {
        setMyBreedingRequests([]);
      }

      if (
        receivedRequestsResult.status === 'fulfilled' &&
        receivedRequestsResult.value.success
      ) {
        console.log('🔍 Raw Received Breeding Requests data:', receivedRequestsResult.value.data);
        const parsed = parseBreedingData(receivedRequestsResult.value.data as any);
        console.log('✅ Parsed Received Breeding Requests:', parsed.length, 'requests');
        console.log('✅ First received request preview:', parsed[0] ? {
          id: parsed[0].id,
          status: parsed[0].status,
          requester_name: parsed[0].requester_name,
          requester_pet_name: parsed[0].requester_pet_details?.name,
        } : 'No requests');
        setReceivedBreedingRequests(parsed);
      } else {
        console.warn('⚠️ Failed to load received breeding requests:',
          receivedRequestsResult.status === 'rejected' ? receivedRequestsResult.reason : receivedRequestsResult.value);
        setReceivedBreedingRequests([]);
      }

      if (
        chatStatusResult.status === 'fulfilled' &&
        chatStatusResult.value.success
      ) {
        setChatStatus(chatStatusResult.value.data || null);
      } else {
        setChatStatus(null);
      }

      if (
        unreadCountResult.status === 'fulfilled' &&
        unreadCountResult.value.success
      ) {
        const raw = unreadCountResult.value.data as any;
        const count = (raw && typeof raw === 'object' && (raw.count ?? raw.unread_count)) || 0;
        setUnreadNotifications(Number(count) || 0);
      } else {
        setUnreadNotifications(0);
      }

      if (myPetsResult.status === 'fulfilled' && myPetsResult.value.success) {
        const responseData = myPetsResult.value.data;
        let petsList: Pet[] = [];

        if (responseData) {
          if (Array.isArray((responseData as PaginatedResponse<Pet>).results)) {
            petsList = (responseData as PaginatedResponse<Pet>).results;
          } else if (Array.isArray(responseData)) {
            petsList = responseData as Pet[];
          }
        }

        setMyPets(petsList);
      } else {
        setMyPets([]);
      }
    } catch (error) {
      console.error('❌ HomeScreen - Error loading dashboard data:', error);
    } finally {
      setDashboardLoading(false);
    }
  };

  const filterAndLoad = (type: PetFilterType, queryOverride?: string) => {
    const normalizedQuery = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim();
    setActiveType(type);
    loadPopularPets(type, normalizedQuery);
  };

  const executeSearch = () => {
    const trimmed = searchQuery.trim();
    setSearchQuery(trimmed);
    // If there's a search query, navigate to pets screen with the query
    if (trimmed && onOpenAdoption) {
      onOpenAdoption(trimmed);
    } else {
      // Otherwise, just filter the current screen
      filterAndLoad('all', trimmed);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadPopularPets(activeType, searchQuery.trim()),
      loadDashboardData(),
      refreshFlags(),
    ]);
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', onPress: logout },
    ]);
  };

  const captureScrollPosition = () => {
    setSavedScrollPosition(scrollOffsetRef.current);
    setShouldRestoreScroll(true);
  };

  const resetOverlayScreens = () => {
    setSelectedPetId(null);
    setShowAddPet(false);
    setShowBreedingOverview(false);
    setShowChatList(false);
    setShowNotifications(false);
    setShowAdoptionRequests(false);
    setShowClinics(false);
    setServicesCategory(null);
    setResponseDialog(null);
    setResponseNotes('');
  };

  const showPetDetails = (petId: number) => {
    captureScrollPosition();
    setSelectedPetId(petId);
  };

  const hidePetDetails = () => {
    setSelectedPetId(null);
  };

  const showAddPetScreen = () => {
    captureScrollPosition();
    setShowAddPet(true);
  };

  const hideAddPetScreen = () => {
    setShowAddPet(false);
    filterAndLoad(activeType);
  };

  useEffect(() => {
    if (triggerAddPet && triggerAddPet !== addPetTriggerRef.current) {
      showAddPetScreen();
      addPetTriggerRef.current = triggerAddPet;
      onAddPetHandled?.();
    }
  }, [triggerAddPet, onAddPetHandled]);

  const openChatList = () => {
    captureScrollPosition();
    resetOverlayScreens();
    setInitialChatFirebaseId(null);
    setShowChatList(true);
  };

  const openBreedingOverview = () => {
    captureScrollPosition();
    resetOverlayScreens();
    loadDashboardData();
    setShowBreedingOverview(true);
  };

  const openClinics = () => {
    captureScrollPosition();
    resetOverlayScreens();
    setShowClinics(true);
  };

  const openServices = (category?: ServiceCategoryKey) => {
    captureScrollPosition();
    resetOverlayScreens();
    setServicesCategory(category || HOME_FEATURED_CATEGORIES[0]);
  };

  useEffect(() => {
    if (
      triggerBreedingOverview &&
      triggerBreedingOverview !== breedingOverviewTriggerRef.current
    ) {
      openBreedingOverview();
      breedingOverviewTriggerRef.current = triggerBreedingOverview;
      onBreedingOverviewHandled?.();
    }
  }, [triggerBreedingOverview, onBreedingOverviewHandled]);

  useEffect(() => {
    if (
      triggerNotifications &&
      triggerNotifications !== notificationsTriggerRef.current
    ) {
      openNotifications();
      notificationsTriggerRef.current = triggerNotifications;
      onNotificationsHandled?.();
    }
  }, [triggerNotifications, onNotificationsHandled]);

  useEffect(() => {
    if (
      triggerAdoptionRequests &&
      triggerAdoptionRequests !== adoptionRequestsTriggerRef.current
    ) {
      captureScrollPosition();
      resetOverlayScreens();
      setShowAdoptionRequests(true);
      adoptionRequestsTriggerRef.current = triggerAdoptionRequests;
      onAdoptionRequestsHandled?.();
    }
  }, [triggerAdoptionRequests, onAdoptionRequestsHandled]);

  useEffect(() => {
    if (
      triggerPetDetails &&
      triggerPetDetails !== petDetailsTriggerRef.current
    ) {
      if (
        typeof triggerPetDetailsId === 'number' &&
        Number.isFinite(triggerPetDetailsId) &&
        triggerPetDetailsId > 0
      ) {
        resetOverlayScreens();
        showPetDetails(triggerPetDetailsId);
      }
      petDetailsTriggerRef.current = triggerPetDetails;
      onPetDetailsHandled?.();
    }
  }, [triggerPetDetails, triggerPetDetailsId, onPetDetailsHandled]);

  useEffect(() => {
    if (clinicChatFirebaseId) {
      captureScrollPosition();
      resetOverlayScreens();
      setInitialChatFirebaseId(clinicChatFirebaseId);
      setShowChatList(true);
      onClinicChatHandled?.();
    }
  }, [clinicChatFirebaseId, onClinicChatHandled]);

  const openNotifications = () => {
    captureScrollPosition();
    resetOverlayScreens();
    setUnreadNotifications(0);
    setShowNotifications(true);
  };

  const openAdoptionRequests = () => {
    captureScrollPosition();
    resetOverlayScreens();
    setShowAdoptionRequests(true);
  };

  const handleRespondToRequest = (request: BreedingRequestPreview, action: 'approve' | 'reject') => {
    if (!request?.id) return;
    setResponseDialog({ request, mode: action });
    setResponseNotes('');
  };

  const submitResponseDecision = async () => {
    if (!responseDialog?.request?.id) {
      setResponseDialog(null);
      return;
    }
    try {
      setResponding(true);
      const apiResponse = await apiService.respondToBreedingRequest(
        responseDialog.request.id,
        responseDialog.mode,
        responseDialog.mode === 'reject' ? responseNotes.trim() : undefined,
      );
      if (apiResponse.success) {
        Alert.alert('تم', responseDialog.mode === 'approve' ? 'تم قبول الطلب' : 'تم رفض الطلب');
        setResponseDialog(null);
        setResponseNotes('');
        await loadDashboardData();
      } else {
        Alert.alert('خطأ', apiResponse.error || 'تعذر تحديث حالة الطلب');
      }
    } catch (error) {
      console.error('respondToBreedingRequest', error);
      Alert.alert('خطأ', 'تعذر تحديث حالة الطلب');
    } finally {
      setResponding(false);
    }
  };

  const closeResponseDialog = () => {
    if (responding) return;
    setResponseDialog(null);
    setResponseNotes('');
  };

  const handleOpenChatForRequest = async (request: BreedingRequestPreview) => {
    if (request?.id) {
      try {
        const existing = await apiService.getChatRoomByBreedingRequest(request.id);
        if (!existing.success) {
          await apiService.createChatRoom(request.id);
        }
      } catch (error) {
        console.log('handleOpenChatForRequest fallback', error);
      }
    }
    setShowBreedingOverview(false);
    setResponseDialog(null);
    setResponseNotes('');
    setShowChatList(true);
  };

  const latestSentRequests = useMemo(
    () => myBreedingRequests.slice(0, MAX_PREVIEW_ITEMS),
    [myBreedingRequests]
  );

  const latestReceivedRequests = useMemo(
    () => receivedBreedingRequests.slice(0, MAX_PREVIEW_ITEMS),
    [receivedBreedingRequests]
  );

  const totalBreedingRequests = myBreedingRequests.length + receivedBreedingRequests.length;
  const unreadMessagesCount =
    (typeof chatStatus?.unread_messages_count === 'number' && chatStatus.unread_messages_count >= 0
      ? chatStatus.unread_messages_count
      : undefined) ??
    (chatStatus?.has_unread_messages ? 1 : 0);
  const unavailablePets = useMemo(() => {
    return myPets.filter((p) => getPetStatusAppearance(p.status, p.status_display).isUnavailable);
  }, [myPets]);
  const unavailablePetsCount = unavailablePets.length;
  const shouldShowClinicsAction = clinicHomeEnabled;
  const homeBottomSafePadding = getFloatingTabBarContentPadding(insets.bottom, 8);

  // Simplified design: no personal pet cards on home; only a reminder if any are unavailable

  const renderPetCard = (pet: Pet) => {
    if (!pet) {
      console.log('⚠️ HomeScreen - Pet is undefined, skipping render');
      return null;
    }

    console.log('🖼️ HomeScreen - Rendering pet card for:', pet.id, 'main_image:', pet.main_image);

    const imageCandidates = buildImageCandidates(pet.main_image, PET_PLACEHOLDER_IMAGE);
    const currentCandidateIndex = petImageCandidateIndex[pet.id] ?? 0;
    const safeCandidateIndex = Math.min(currentCandidateIndex, imageCandidates.length - 1);
    const imageUrl = imageCandidates[safeCandidateIndex];
    const appearance = getPetStatusAppearance(pet.status, pet.status_display);
    const isUnavailable = appearance.isUnavailable;

    return (
      <TouchableOpacity
        key={pet.id}
        style={styles.petCard}
        onPress={() => showPetDetails(pet.id)}
      >
        <View style={styles.petImageWrapper}>
          <FastImage
            source={{ uri: imageUrl, priority: FastImage.priority.normal }}
            style={[styles.petImage, isUnavailable && styles.petImageDimmed]}
            resizeMode={FastImage.resizeMode.cover}
            onError={() => {
              const hasNextCandidate = safeCandidateIndex < imageCandidates.length - 1;
              if (hasNextCandidate) {
                setPetImageCandidateIndex((prev) => ({
                  ...prev,
                  [pet.id]: safeCandidateIndex + 1,
                }));
              }
            }}
          />
          {isUnavailable && (
            <>
              <View style={styles.petImageOverlay} />
              <View style={styles.petStatusBadge}>
                <Text style={styles.petStatusText}>{appearance.label}</Text>
              </View>
            </>
          )}
        </View>
        <View style={styles.petInfo}>
          <Text style={styles.petName}>{pet.name || 'غير محدد'}</Text>
          <Text style={styles.petBreed}>{pet.breed_name || 'غير محدد'}</Text>
          <Text style={styles.petAge}>{pet.age_display || 'غير محدد'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRequestPreviewItem = (
    request: BreedingRequestPreview,
    owner: RequestOwner,
    index: number,
  ) => {
    const partnerName = extractPartnerName(request, owner);
    const statusLabel = getStatusLabel(request);
    const statusColor = getStatusColor(request.status);

    return (
      <View key={`${owner}-preview-${request.id ?? index}`} style={styles.previewItem}>
        <View style={styles.previewItemHeader}>
          <Text style={styles.previewItemTitle}>{partnerName}</Text>
          <Text style={[styles.previewStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.previewItemMeta}>
          {owner === 'sent' ? 'أُرسل في ' : 'وُرد في '} {formatDate(request.created_at)}
        </Text>
      </View>
    );
  };

  useEffect(() => {
    const onBackPress = () => {
      if (responseDialog) {
        if (!responding) {
          setResponseDialog(null);
          setResponseNotes('');
        }
        return true;
      }
      if (showBreedingOverview) {
        setShowBreedingOverview(false);
        return true;
      }
      if (showChatList) {
        setShowChatList(false);
        return true;
      }
      if (showNotifications) {
        setShowNotifications(false);
        return true;
      }
      if (showAdoptionRequests) {
        setShowAdoptionRequests(false);
        return true;
      }
      if (showClinics) {
        setShowClinics(false);
        return true;
      }
      if (showAddPet) {
        setShowAddPet(false);
        return true;
      }
      if (selectedPetId) {
        setSelectedPetId(null);
        return true;
      }
      return false;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [responseDialog, responding, showBreedingOverview, showChatList, showNotifications, showAdoptionRequests, showClinics, showAddPet, selectedPetId]);

  useEffect(() => {
    if (
      shouldRestoreScroll &&
      savedScrollPosition !== null &&
      !selectedPetId &&
      !showAddPet &&
      !showChatList &&
      !showBreedingOverview &&
      !showNotifications &&
      !showAdoptionRequests &&
      !showClinics
    ) {
      const handle = InteractionManager.runAfterInteractions(() => {
        if (mainScrollRef.current) {
          mainScrollRef.current.scrollTo({ y: savedScrollPosition, animated: false });
        }
        setShouldRestoreScroll(false);
      });

      return () => handle.cancel();
    }
  }, [shouldRestoreScroll, savedScrollPosition, selectedPetId, showAddPet, showChatList, showBreedingOverview, showNotifications, showAdoptionRequests, showClinics]);

  const quickActions: QuickAction[] = useMemo(() => [
    {
      key: 'adoption',
      label: 'تبني الآن',
      icon: 'home' as AppIconName,
      iconColor: '#FF6B35',
      onPress: () => onOpenAdoption && onOpenAdoption(),
    },
    {
      key: 'matches',
      label: 'مطابقة التزاوج',
      icon: 'heart' as AppIconName,
      iconColor: '#FF4D6D',
      filled: true,
      onPress: () => onOpenMatches && onOpenMatches(),
    },
    {
      key: 'add',
      label: 'إضافة حيوان',
      icon: 'plus' as AppIconName,
      iconColor: '#02B7B4',
      onPress: showAddPetScreen,
    },
    {
      key: 'breeding',
      label: 'طلبات التزاوج',
      icon: 'calendar' as AppIconName,
      iconColor: '#3B82F6',
      onPress: openBreedingOverview,
    },
    {
      key: 'adoption_requests',
      label: 'طلبات التبني',
      icon: 'envelope' as AppIconName,
      iconColor: '#8B5CF6',
      onPress: openAdoptionRequests,
    },
    ...(shouldShowClinicsAction ? [{
      key: 'clinics',
      label: 'الخدمات',
      icon: 'shield-check' as AppIconName,
      iconColor: '#14B8A6',
      onPress: openClinics,
    }] : []),
    // Removed species filters from main nav per UX request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onOpenAdoption, onOpenMatches, shouldShowClinicsAction]);

  if (selectedPetId) {
    return (
      <PetDetailsScreen
        petId={selectedPetId}
        onClose={hidePetDetails}
        onAddPet={showAddPetScreen}
        onOpenChat={(firebaseChatId) => {
          setInitialChatFirebaseId(firebaseChatId);
          setShowChatList(true);
        }}
      />
    );
  }

  if (showAddPet) {
    return <AddPetScreen onClose={hideAddPetScreen} />;
  }

  if (showChatList) {
    return (
      <ChatListScreen
        initialFirebaseChatId={initialChatFirebaseId}
        onChatOpened={() => setInitialChatFirebaseId(null)}
        onClose={() => {
          setShowChatList(false);
          setInitialChatFirebaseId(null);
          loadDashboardData();
        }}
      />
    );
  }

  if (showNotifications) {
    return (
      <NotificationListScreen
        onClose={() => {
          setShowNotifications(false);
          loadDashboardData();
        }}
        onMarkedAsRead={() => {
          setUnreadNotifications(0);
          loadDashboardData();
        }}
        onOpenPetDetails={(pid) => showPetDetails(pid)}
        onOpenBreedingOverview={() => openBreedingOverview()}
        onOpenChatList={() => openChatList()}
        onOpenChatByFirebaseId={(firebaseId) => {
          captureScrollPosition();
          setInitialChatFirebaseId(firebaseId);
          setShowNotifications(false);
          setShowChatList(true);
        }}
      />
    );
  }

  if (showClinics) {
    return (
      <ClinicsScreen
        onClose={() => setShowClinics(false)}
      />
    );
  }

  if (servicesCategory) {
    return (
      <ServicesScreen
        initialCategory={servicesCategory}
        onClose={() => setServicesCategory(null)}
      />
    );
  }

  if (showAdoptionRequests) {
    return (
      <AdoptionRequestsScreen
        onClose={() => {
          setShowAdoptionRequests(false);
          loadDashboardData();
        }}
      />
    );
  }

  if (showBreedingOverview) {
    return (
      <>
        {!requestChatV2Enabled ? (
          <BreedingRequestsOverview
            myRequests={myBreedingRequests}
            receivedRequests={receivedBreedingRequests}
            onClose={() => setShowBreedingOverview(false)}
            onRefresh={loadDashboardData}
            refreshing={dashboardLoading}
            onRespond={handleRespondToRequest}
            onOpenChat={handleOpenChatForRequest}
            onOpenPetDetails={(pid) => showPetDetails(pid)}
          />
        ) : null}
        {responseDialog ? (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={closeResponseDialog}
          >
            <View style={styles.responseModalOverlay}>
              <TouchableWithoutFeedback onPress={closeResponseDialog}>
                <View style={styles.responseModalOverlay} />
              </TouchableWithoutFeedback>
              <View style={styles.responseModalCard}>
                <Text style={styles.responseModalTitle}>
                  {responseDialog.mode === 'approve' ? 'تأكيد قبول الطلب' : 'رفض الطلب'}
                </Text>
                {responseDialog.mode === 'reject' ? (
                  <>
                    <Text style={styles.responseModalSubtitle}>يمكنك إضافة رسالة للطرف الآخر (اختياري)</Text>
                    <TextInput
                      style={styles.responseModalInput}
                      placeholder="سبب الرفض (اختياري)"
                      placeholderTextColor="#95a5a6"
                      value={responseNotes}
                      onChangeText={setResponseNotes}
                      multiline
                    />
                  </>
                ) : (
                  <Text style={styles.responseModalSubtitle}>سيتم إشعار الطرف الآخر بالموافقة.</Text>
                )}
                <View style={styles.responseModalActions}>
                  <TouchableOpacity
                    style={styles.responseSecondaryButton}
                    onPress={closeResponseDialog}
                    disabled={responding}
                  >
                    <Text style={styles.responseSecondaryText}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.responsePrimaryButton, responding && styles.responsePrimaryButtonDisabled]}
                    onPress={submitResponseDecision}
                    disabled={responding}
                  >
                    <Text style={styles.responsePrimaryText}>{responding ? 'جارٍ...' : 'تأكيد'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </>
    );
  }

  return (
    <ScrollView
      ref={mainScrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: homeBottomSafePadding }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
    >
      <View style={styles.header}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconButton} onPress={openNotifications} accessibilityLabel="الإشعارات">
            <AppIcon name="bell" size={IconSize.lg} color="#F59E0B" accessibilityLabel="إشعارات" />
            {unreadNotifications > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconButton} onPress={openChatList} accessibilityLabel="المحادثات">
            <AppIcon name="chat" size={IconSize.lg} color="#3B82F6" accessibilityLabel="محادثات" />
            {unreadMessagesCount > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unreadMessagesCount > 99 ? '99+' : String(unreadMessagesCount)}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerIconButton} onPress={handleLogout} accessibilityLabel="تسجيل الخروج">
            <AppIcon name="logout" size={IconSize.lg} color="#64748B" accessibilityLabel="خروج" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="ابحث بالسلالة أو النوع..."
          placeholderTextColor="#95a5a6"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={executeSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={executeSearch} accessibilityLabel="بحث">
          <AppIcon name="search" size={IconSize.md} color="#fff" accessibilityLabel="بحث" />
        </TouchableOpacity>
      </View>

      <View style={styles.quickActionsContainer}>
        <View style={styles.navGrid}>
          {quickActions.map((action) => {
            const isActiveFilter = action.isFilter && action.filterType === activeType;
            return (
              <TouchableOpacity
                key={action.key}
                style={[
                  styles.navItem,
                  isActiveFilter && styles.navItemActive,
                ]}
                onPress={action.onPress}
                activeOpacity={0.9}
                accessibilityLabel={action.label}
              >
                <View style={styles.navIconWrap}>
                  <AppIcon name={action.icon} size={IconSize.lg} color={isActiveFilter ? '#02B7B4' : action.iconColor} filled={action.filled} accessibilityLabel={action.label} />
                </View>
                <Text style={[styles.navLabel, isActiveFilter && styles.navLabelActive]}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {unavailablePetsCount > 0 ? (
        <View style={styles.section}>
          <View style={styles.simpleUnavailableCard}>
            <Text style={styles.simpleUnavailableTitle}>تذكير: لديك حيوانات غير متاحة</Text>
            <Text style={styles.simpleUnavailableBody}>
              يمكنك تعديل حالة الحيوان من الملف الشخصي ← حيواناتي.
            </Text>
            <View style={styles.simpleUnavailableList}>
              {unavailablePets.slice(0, 3).map((p) => (
                <View key={`unavail-${p.id}`} style={styles.simpleUnavailablePill}>
                  <Text style={styles.simpleUnavailablePillText} numberOfLines={1}>
                    {p.name || 'حيوان بدون اسم'}
                  </Text>
                </View>
              ))}
              {unavailablePetsCount > 3 ? (
                <View style={styles.simpleUnavailablePillMore}>
                  <Text style={styles.simpleUnavailablePillMoreText}>+{unavailablePetsCount - 3}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.simpleUnavailableActions}>
              {/* Single CTA — the dedicated "إضافة حيوان" tile in the
                  quick-actions grid covers that path; opening the profile
                  lets the user manage existing pets directly. */}
              <TouchableOpacity
                style={styles.simpleActionPrimary}
                onPress={() => onOpenProfileTab && onOpenProfileTab()}
              >
                <Text style={styles.simpleActionPrimaryText}>إدارة حيواناتي</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {shouldShowClinicsAction ? (
        <View style={styles.servicesStripSection}>
          <Text style={styles.sectionTitle}>الخدمات البيطرية</Text>
          <Text style={styles.servicesStripHint}>اختر نوع الخدمة لعرض العيادات القريبة</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.servicesStripContent}
          >
            {HOME_FEATURED_CATEGORIES.map(category => (
              <TouchableOpacity
                key={category}
                style={styles.serviceTile}
                onPress={() => openServices(category)}
                accessibilityRole="button"
                accessibilityLabel={SERVICE_CATEGORY_LABELS[category]}
              >
                <Text style={styles.serviceTileEmoji}>{SERVICE_CATEGORY_EMOJI[category]}</Text>
                <Text style={styles.serviceTileLabel} numberOfLines={1}>
                  {SERVICE_CATEGORY_LABELS[category]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.adoptionPromo}
        activeOpacity={0.85}
        onPress={() => {
          if (onOpenAdoption) {
            onOpenAdoption();
          }
        }}
      >
        <View style={styles.adoptionPromoContent}>
          <Text style={styles.adoptionPromoTitle}>ابحث عن صديق للتبني</Text>
          <Text style={styles.adoptionPromoSubtitle}>
            اكتشف الحيوانات التي تنتظر منزلاً الآن
          </Text>
          <View style={styles.adoptionPromoButton}>
            <Text style={styles.adoptionPromoButtonText}>استكشف التبني</Text>
          </View>
        </View>
        <View style={styles.adoptionPromoIcon}>
          <AppIcon name="house-color" size={72} accessibilityLabel="تبني" />
        </View>
      </TouchableOpacity>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>الحيوانات المتاحة</Text>
          <TouchableOpacity onPress={() => loadPopularPets(activeType, searchQuery.trim())}>
            <Text style={styles.seeAllText}>تحديث</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#02B7B4" />
            <Text style={styles.loadingText}>جاري تحميل الحيوانات...</Text>
          </View>
        ) : popularPets.length === 0 ? (
          <Text style={styles.emptyPetsText}>لا توجد حيوانات مطابقة لبحثك حالياً.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.petsContainer}>{popularPets.map(renderPetCard)}</View>
          </ScrollView>
        )}
      </View>

      {latestSentRequests.length > 0 || latestReceivedRequests.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>آخر نشاط في التزاوج</Text>
            <TouchableOpacity onPress={openBreedingOverview}>
              <Text style={styles.seeAllText}>عرض الكل</Text>
            </TouchableOpacity>
          </View>
          {latestSentRequests.length > 0 ? (
            <View style={styles.previewBlock}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>أحدث الطلبات المرسلة</Text>
              </View>
              {latestSentRequests.map((request, index) =>
                renderRequestPreviewItem(request, 'sent', index)
              )}
            </View>
          ) : null}

          {latestReceivedRequests.length > 0 ? (
            <View style={styles.previewBlock}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>آخر الطلبات المستلمة</Text>
              </View>
              {latestReceivedRequests.map((request, index) =>
                renderRequestPreviewItem(request, 'received', index)
              )}
            </View>
          ) : null}

          <TouchableOpacity style={styles.overviewButton} onPress={openBreedingOverview}>
            <Text style={styles.overviewButtonText}>
              عرض جميع الطلبات ({totalBreedingRequests})
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Notification Permission Modal */}
      <NotificationPermissionModal
        visible={shouldShowNotificationModal}
        onClose={() => setShouldShowNotificationModal(false)}
        onPermissionGranted={handleNotificationPermissionGranted}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    marginLeft: 12,
    backgroundColor: '#f0f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    position: 'relative',
  },
  headerIcon: {
    fontSize: 18,
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#e74c3c',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    marginRight: 10,
    fontSize: 16,
    color: '#2c3e50',
  },
  searchButton: {
    backgroundColor: '#02B7B4',
    padding: 15,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  quickActionsContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  simpleUnavailableCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1d5d3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  simpleUnavailableTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#c0392b',
    marginBottom: 6,
  },
  simpleUnavailableBody: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 12,
    lineHeight: 19,
  },
  simpleUnavailableList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  simpleUnavailablePill: {
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    borderColor: 'rgba(231, 76, 60, 0.18)',
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  simpleUnavailablePillText: {
    fontSize: 12,
    color: '#c0392b',
    fontWeight: '700',
    maxWidth: 160,
  },
  simpleUnavailablePillMore: {
    backgroundColor: 'rgba(52, 73, 94, 0.08)',
    borderColor: 'rgba(52, 73, 94, 0.18)',
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  simpleUnavailablePillMoreText: {
    fontSize: 12,
    color: '#34495e',
    fontWeight: '700',
  },
  simpleUnavailableActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  simpleActionPrimary: {
    backgroundColor: '#02B7B4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  simpleActionPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  simpleActionLink: {
    color: '#0f6c6a',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyMyPetsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6ecf1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  emptyMyPetsEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyMyPetsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 6,
  },
  emptyMyPetsSubtitle: {
    fontSize: 13,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyMyPetsButton: {
    backgroundColor: '#02B7B4',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  emptyMyPetsButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  myPetsAlertCard: {
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    borderColor: 'rgba(231, 76, 60, 0.18)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  myPetsAlertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#c0392b',
    marginBottom: 4,
  },
  myPetsAlertSubtitle: {
    fontSize: 13,
    color: '#c0392b',
    opacity: 0.8,
    lineHeight: 18,
  },
  myPetsContainer: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingRight: 6,
  },
  myPetCard: {
    width: 220,
    marginRight: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ecf1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  myPetImageWrapper: {
    position: 'relative',
    width: '100%',
    height: 130,
  },
  myPetImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#dfe6e9',
  },
  myPetImageDimmed: {
    opacity: 0.55,
  },
  myPetStatusChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  myPetStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  myPetInfo: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  myPetInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  myPetName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    flex: 1,
  },
  myPetMeta: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 10,
  },
  myPetStatusNote: {
    backgroundColor: 'rgba(52, 73, 94, 0.06)',
    borderRadius: 10,
    padding: 10,
  },
  myPetStatusNoteText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5d6d7e',
  },
  navItem: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#f7fafb',
    borderWidth: 1,
    borderColor: '#e6eef0',
    marginBottom: 10,
  },
  navItemActive: {
    backgroundColor: '#e8fbfa',
    borderColor: '#02B7B4',
  },
  navIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    marginBottom: 6,
  },
  navIcon: { fontSize: 22 },
  navIconActive: {},
  navLabel: { fontSize: 12, color: '#243b53', fontWeight: '700' },
  navLabelActive: { color: '#0e7f7c' },
  servicesStripSection: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
  },
  servicesStripHint: {
    fontSize: 12,
    color: '#5f6c7b',
    marginTop: 4,
    marginBottom: 10,
  },
  servicesStripContent: {
    paddingVertical: 4,
    gap: 10,
  },
  serviceTile: {
    width: 92,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5edf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTileEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  serviceTileLabel: {
    fontSize: 12,
    color: '#1c344d',
    fontWeight: '700',
    textAlign: 'center',
  },
  adoptionPromo: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#c9edef',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  adoptionPromoContent: {
    flex: 1,
  },
  adoptionPromoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#026b6a',
    marginBottom: 6,
  },
  adoptionPromoSubtitle: {
    fontSize: 14,
    color: '#4f6f72',
    marginBottom: 12,
    lineHeight: 20,
  },
  adoptionPromoButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#02B7B4',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  adoptionPromoButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  adoptionPromoIcon: {
    marginLeft: 16,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#fff',
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  seeAllText: {
    color: '#02B7B4',
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 10,
    color: '#7f8c8d',
  },
  emptyPetsText: {
    color: '#7f8c8d',
    textAlign: 'center',
    fontSize: 14,
  },
  petsContainer: {
    flexDirection: 'row',
  },
  petCard: {
    width: 160,
    marginRight: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    overflow: 'hidden',
  },
  petImageWrapper: {
    position: 'relative',
    width: '100%',
    height: 120,
  },
  petImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#e1e8ed',
    borderRadius: 0,
  },
  petImageDimmed: {
    opacity: 0.85,
  },
  petImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(28, 52, 77, 0.45)',
  },
  petStatusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(12, 31, 50, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  petStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  petInfo: {
    padding: 12,
  },
  petName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  petBreed: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 2,
  },
  petAge: {
    fontSize: 12,
    color: '#95a5a6',
    marginTop: 2,
  },
  previewBlock: {
    marginTop: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  previewItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  previewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34495e',
  },
  previewStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewItemMeta: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 6,
  },
  overviewButton: {
    marginTop: 12,
    backgroundColor: '#02B7B4',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  overviewButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
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
    marginBottom: 10,
  },
  closeIconButton: {
    backgroundColor: '#ecf0f1',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    fontSize: 18,
    color: '#64748B',
  },
  overlayTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
  },
  overlaySpacer: {
    width: 36,
  },
  overlaySubtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  overlaySection: {
    marginBottom: 24,
  },
  overlaySectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34495e',
    marginBottom: 12,
  },
  overlayEmptyText: {
    fontSize: 14,
    color: '#95a5a6',
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  requestCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  requestCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c344d',
  },
  requestCardSubtitle: {
    marginTop: 4,
    color: '#5f6c7b',
    fontSize: 13,
  },
  requestStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  requestStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  requestCardBody: {
    flexDirection: 'row',
    marginTop: 12,
  },
  requestAvatar: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: '#eef2f8',
    marginRight: 12,
  },
  requestInfo: {
    flex: 1,
  },
  requestMetaText: {
    color: '#5f6c7b',
    fontSize: 13,
    marginBottom: 4,
  },
  requestMessage: {
    marginTop: 12,
    color: '#34495e',
    lineHeight: 20,
  },
  requestNoteBlock: {
    marginTop: 12,
    backgroundColor: '#fcecea',
    padding: 12,
    borderRadius: 12,
  },
  requestNoteLabel: {
    color: '#c0392b',
    fontWeight: '700',
    marginBottom: 4,
  },
  requestNoteText: {
    color: '#c0392b',
    lineHeight: 18,
  },
  requestActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  requestActionButton: {
    borderWidth: 1,
    borderColor: '#d7dce5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 10,
    marginTop: 8,
  },
  requestActionText: {
    fontWeight: '700',
    fontSize: 14,
  },
  acceptButton: {
    backgroundColor: '#27ae60',
    borderColor: '#27ae60',
  },
  acceptButtonText: {
    color: '#fff',
  },
  rejectButton: {
    borderColor: '#e74c3c',
  },
  rejectButtonText: {
    color: '#e74c3c',
  },
  chatButton: {
    borderColor: '#0a84ff',
  },
  chatButtonText: {
    color: '#0a84ff',
  },
  responseModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  responseModalCard: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
  },
  responseModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c344d',
    textAlign: 'center',
    marginBottom: 12,
  },
  responseModalSubtitle: {
    fontSize: 14,
    color: '#5f6c7b',
    textAlign: 'center',
    marginBottom: 12,
  },
  responseModalInput: {
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 90,
    textAlignVertical: 'top',
    color: '#1c344d',
  },
  responseModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  responseSecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dce5',
  },
  responseSecondaryText: {
    color: '#1c344d',
    fontWeight: '600',
  },
  responsePrimaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#02B7B4',
  },
  responsePrimaryButtonDisabled: {
    opacity: 0.6,
  },
  responsePrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default HomeScreen;
