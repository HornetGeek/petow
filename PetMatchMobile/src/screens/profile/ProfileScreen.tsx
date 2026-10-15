import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import { apiService, User, Pet } from '../../services/api';
import AddPetScreen from '../pets/AddPetScreen';
import MyPetsScreen from '../my-pets/MyPetsScreen';
import FavoritesScreen from '../favorites/FavoritesScreen';
import ChatListScreen from '../chat/ChatListScreen';
import ChatScreen from '../chat/ChatScreen';
import SettingsScreen from './SettingsScreen';
import EditAccountScreen from './EditAccountScreen';
import PrivacyPolicyScreen from '../legal/PrivacyPolicyScreen';
import TermsScreen from '../legal/TermsScreen';
import VerificationScreen from './VerificationScreen';
import AdoptionRequestsScreen from '../adoption-request/AdoptionRequestsScreen';
import ShareCardGeneratorScreen from '../share/ShareCardGeneratorScreen';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { getFloatingTabBarContentPadding } from '../../utils/tabBarLayout';
import AppIcon from '../../components/icons/AppIcon';

interface ProfileScreenProps {
  onSetTabBarVisible?: (visible: boolean) => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onSetTabBarVisible }) => {
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [userPets, setUserPets] = useState<Pet[]>([]);
  const [userPetsCount, setUserPetsCount] = useState<number>(0);
  const [favoritesCount, setFavoritesCount] = useState<number>(0);
  const [breedingRequestsCount, setBreedingRequestsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showAddPet, setShowAddPet] = useState(false);
  const [showMyPets, setShowMyPets] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  // Phone verification flow removed
  const [showVerification, setShowVerification] = useState(false);
  const [showAdoptionRequests, setShowAdoptionRequests] = useState(false);
  const [showShareCardGenerator, setShowShareCardGenerator] = useState(false);
  const [notifyBreedingRequests, setNotifyBreedingRequests] = useState(true);
  const [notifyAdoptionPets, setNotifyAdoptionPets] = useState(true);
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);
  const hasNestedFullscreenFlow =
    showAddPet ||
    showMyPets ||
    showFavorites ||
    showChatList ||
    (showChat && !!selectedChatId) ||
    showSettings ||
    showPrivacyPolicy ||
    showTerms ||
    showEdit ||
    showVerification ||
    showAdoptionRequests ||
    showShareCardGenerator;

  useEffect(() => {
    loadUserProfile();
    loadUserPets();
    loadCounts();
  }, []);

  useEffect(() => {
    if (!onSetTabBarVisible) return;
    onSetTabBarVisible(!hasNestedFullscreenFlow);
    return () => onSetTabBarVisible(true);
  }, [hasNestedFullscreenFlow, onSetTabBarVisible]);

  const loadUserProfile = async () => {
    try {
      const response = await apiService.getUserProfile();
      if (response.success && response.data) {
        setUserProfile(response.data);
        // Initialize notification preferences from user profile
        setNotifyBreedingRequests(response.data.notify_breeding_requests ?? true);
        setNotifyAdoptionPets(response.data.notify_adoption_pets ?? true);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadUserPets = async () => {
    try {
      const response = await apiService.getUserPets();
      if (response.success && response.data) {
        const data: any = response.data as any;
        const asArray: Pet[] = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
        setUserPets(asArray);
        const count = Array.isArray(data) ? data.length : (typeof data?.count === 'number' ? data.count : (Array.isArray(data?.results) ? data.results.length : asArray.length));
        setUserPetsCount(count);
      }
    } catch (error) {
      console.error('Error loading user pets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const [favResp, myReqResp, recReqResp] = await Promise.all([
        apiService.getFavorites(),
        apiService.getMyBreedingRequests(),
        apiService.getReceivedBreedingRequests(),
      ]);

      if (favResp.success && Array.isArray(favResp.data)) {
        setFavoritesCount(favResp.data.length);
      } else {
        setFavoritesCount(0);
      }

      const myCount = (myReqResp.success && Array.isArray(myReqResp.data)) ? myReqResp.data.length : 0;
      const recCount = (recReqResp.success && Array.isArray(recReqResp.data)) ? recReqResp.data.length : 0;
      setBreedingRequestsCount(myCount + recCount);
    } catch (e) {
      setFavoritesCount(0);
      setBreedingRequestsCount(0);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد من تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تسجيل الخروج', onPress: logout },
      ]
    );
  };

  const handleNotificationToggle = async (type: 'breeding' | 'adoption', value: boolean) => {
    try {
      setSavingNotifPrefs(true);

      const newBreeding = type === 'breeding' ? value : notifyBreedingRequests;
      const newAdoption = type === 'adoption' ? value : notifyAdoptionPets;

      const response = await apiService.updateNotificationPreferences(newBreeding, newAdoption);

      if (response.success) {
        if (type === 'breeding') {
          setNotifyBreedingRequests(value);
        } else {
          setNotifyAdoptionPets(value);
        }
      } else {
        Alert.alert('خطأ', 'فشل في تحديث إعدادات الإشعارات');
      }
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      Alert.alert('خطأ', 'فشل في تحديث إعدادات الإشعارات');
    } finally {
      setSavingNotifPrefs(false);
    }
  };

  const showAddPetScreen = () => setShowAddPet(true);
  const hideAddPetScreen = () => {
    setShowAddPet(false);
    loadUserPets();
  };

  const showMyPetsScreen = () => setShowMyPets(true);
  const hideMyPetsScreen = () => setShowMyPets(false);
  const showFavoritesScreen = () => setShowFavorites(true);
  const hideFavoritesScreen = () => setShowFavorites(false);
  const showChatListScreen = () => setShowChatList(true);
  const hideChatListScreen = () => setShowChatList(false);

  const openChat = (firebaseChatId: string) => {
    setSelectedChatId(firebaseChatId);
    setShowChat(true);
  };
  const closeChat = () => {
    setShowChat(false);
    setSelectedChatId(null);
  };

  const showSettingsScreen = () => setShowSettings(true);
  const hideSettingsScreen = () => setShowSettings(false);
  const openPrivacyPolicy = () => {
    setShowSettings(false);
    setShowPrivacyPolicy(true);
  };
  const closePrivacyPolicy = () => setShowPrivacyPolicy(false);
  const openTermsScreen = () => {
    setShowSettings(false);
    setShowTerms(true);
  };
  const closeTermsScreen = () => setShowTerms(false);
  const openEdit = () => setShowEdit(true);
  const closeEdit = () => setShowEdit(false);
  // Phone verification flow removed
  const openVerification = () => setShowVerification(true);
  const closeVerification = () => {
    setShowVerification(false);
    loadUserProfile(); // Refresh profile to get updated verification status
  };
  const openAdoptionRequests = () => setShowAdoptionRequests(true);
  const closeAdoptionRequests = () => setShowAdoptionRequests(false);
  const openShareCardGenerator = () => setShowShareCardGenerator(true);
  const closeShareCardGenerator = () => setShowShareCardGenerator(false);

  const performDeleteAccount = async () => {
    if (deletePending) return;
    try {
      setDeletePending(true);
      const response = await apiService.deleteAccount();
      if (response.success) {
        Alert.alert('تم حذف الحساب', response.data?.message || 'تم حذف حسابك بنجاح.');
        logout();
      } else {
        Alert.alert('خطأ', response.error || 'تعذر حذف الحساب الآن.');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء حذف الحساب. حاول مرة أخرى.');
    } finally {
      setDeletePending(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'حذف الحساب',
      'سيتم حذف حسابك وجميع بياناتك نهائيًا. هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: performDeleteAccount }
      ]
    );
  };

  if (showAddPet) {
    return <AddPetScreen onClose={hideAddPetScreen} />;
  }
  if (showMyPets) {
    return <MyPetsScreen onClose={hideMyPetsScreen} />;
  }
  if (showFavorites) {
    return <FavoritesScreen onClose={hideFavoritesScreen} />;
  }
  if (showChatList) {
    return <ChatListScreen onClose={hideChatListScreen} />;
  }
  if (showChat && selectedChatId) {
    return <ChatScreen firebaseChatId={selectedChatId} onClose={closeChat} reserveTabBarSpace={false} />;
  }
  if (showEdit && userProfile) {
    return (
      <EditAccountScreen
        current={userProfile}
        onClose={closeEdit}
        onUpdated={(u) => setUserProfile(u)}
      />
    );
  }
  if (showPrivacyPolicy) {
    return <PrivacyPolicyScreen onClose={closePrivacyPolicy} />;
  }
  if (showTerms) {
    return <TermsScreen onClose={closeTermsScreen} />;
  }
  // Phone verification screen removed

  if (showVerification) {
    return <VerificationScreen onClose={closeVerification} onVerificationSubmitted={closeVerification} />;
  }
  if (showAdoptionRequests) {
    return <AdoptionRequestsScreen onClose={closeAdoptionRequests} />;
  }
  if (showShareCardGenerator) {
    return <ShareCardGeneratorScreen onClose={closeShareCardGenerator} />;
  }
  if (showSettings) {
    return (
      <SettingsScreen
        onClose={hideSettingsScreen}
        onOpenPrivacyPolicy={openPrivacyPolicy}
        onOpenTerms={openTermsScreen}
        onDeleteAccount={() => {
          hideSettingsScreen();
          confirmDeleteAccount();
        }}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#02B7B4" />
          <Text style={styles.loadingText}>جاري تحميل الملف الشخصي...</Text>
        </View>
      </View>
    );
  }

  // Use a neutral, gender-agnostic default avatar
  const fallbackAvatar = 'https://www.gravatar.com/avatar/?d=mp&s=200';
  const avatarUri = (() => {
    const raw = userProfile?.profile_picture;
    if (!raw || typeof raw !== 'string' || !raw.trim().length) return fallbackAvatar;
    return resolveMediaUrl(raw, fallbackAvatar);
  })();
  const joinDateLabel = userProfile?.date_joined
    ? new Date(userProfile.date_joined).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
    : null;

  const stats = [
    { key: 'pets', iconName: 'paw' as const, iconColor: '#FF6B35', label: 'حيواناتي', value: String(userPetsCount) },
    { key: 'requests', iconName: 'heart' as const, iconColor: '#FF4D6D', iconFilled: true, label: 'طلبات التزاوج', value: String(breedingRequestsCount) },
    { key: 'favorites', iconName: 'heart' as const, iconColor: '#FF4D6D', iconFilled: true, label: 'المفضلة', value: String(favoritesCount) },
  ];

  const phoneVerified = false; // Phone verification removed from UI
  const identityVerified = !!userProfile?.is_verified;

  // Phone verification UI removed

  const getIdentityVerificationIcon = (): React.ReactElement => {
    return <AppIcon name="shield-check" size={22} color={identityVerified ? '#4CAF50' : '#14B8A6'} />;
  };

  const getIdentityVerificationLabel = () => {
    return identityVerified ? 'توثيق الهوية مكتمل' : 'توثيق الهوية (اختياري)';
  };

  const quickActions: { key: string; label: string; icon: string | React.ReactElement; onPress: () => void; danger?: boolean; verified?: boolean }[] = [
    { key: 'add', label: 'إضافة حيوان', icon: <AppIcon name="plus" size={22} color="#02B7B4" />, onPress: showAddPetScreen },
    { key: 'mypets', label: 'حيواناتي', icon: <AppIcon name="paw" size={22} color="#FF6B35" />, onPress: showMyPetsScreen },
    // { key: 'shareCard', label: 'كروت المشاركة', icon: '🎨', onPress: openShareCardGenerator },
    { key: 'favorites', label: 'المفضلة', icon: <AppIcon name="heart" size={22} color="#FF4D6D" filled />, onPress: showFavoritesScreen },
    { key: 'chat', label: 'المحادثات', icon: <AppIcon name="chat" size={22} color="#3B82F6" />, onPress: showChatListScreen },
    { key: 'adoption', label: 'طلبات التبني', icon: <AppIcon name="home" size={22} color="#FF6B35" />, onPress: openAdoptionRequests },
    // phone verification quick action removed
    {
      key: 'identityVerification',
      label: getIdentityVerificationLabel(),
      icon: getIdentityVerificationIcon(),
      onPress: openVerification,
      verified: identityVerified
    },
    {
      key: 'support', label: 'الدعم', icon: <AppIcon name="chat" size={22} color="#25D366" />, onPress: async () => {
        const raw = '+201272011482';
        const phone = raw.replace(/[^\d]/g, '');
        const text = encodeURIComponent('مرحباً، أحتاج إلى دعم من داخل تطبيق PetMatch');
        const appUrl = `whatsapp://send?phone=${phone}&text=${text}`;
        const webUrl = `https://wa.me/${phone}?text=${text}`;
        try {
          // Try opening WhatsApp app first
          const appSupported = await Linking.canOpenURL(appUrl);
          if (appSupported) {
            await Linking.openURL(appUrl);
            return;
          }
        } catch { }
        try {
          // Fallback to web (browser)
          await Linking.openURL(webUrl);
        } catch (e) {
          Alert.alert('تعذر الفتح', 'لا يمكن فتح واتساب على هذا الجهاز.');
        }
      }
    },
    { key: 'edit', label: 'تعديل البيانات', icon: <AppIcon name="document" size={22} color="#3B82F6" />, onPress: openEdit },
    { key: 'settings', label: 'الإعدادات', icon: <AppIcon name="settings" size={22} color="#7f8c8d" />, onPress: showSettingsScreen },
    { key: 'delete', label: 'حذف الحساب', icon: <AppIcon name="trash" size={22} color="#E74C3C" />, onPress: confirmDeleteAccount, danger: true },
  ];
  const profileBottomSafePadding = getFloatingTabBarContentPadding(insets.bottom, 8);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: profileBottomSafePadding }]}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.avatarWrapper}>
            <Image source={{ uri: avatarUri }} style={styles.heroAvatar} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>
              {userProfile?.first_name} {userProfile?.last_name}
            </Text>
            {joinDateLabel ? (
              <Text style={styles.heroSubtitle}>عضو منذ {joinDateLabel}</Text>
            ) : null}
            {/* Phone verification badge removed */}
            {identityVerified ? (
              <View style={[styles.heroBadge, styles.heroBadgeSecondary]}>
                <Text style={styles.heroBadgeText}>توثيق الهوية</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={openEdit} style={styles.heroEditButton}>
            <Text style={styles.heroEditText}>تعديل</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Phone verification alert removed */}

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.key} style={styles.statCard}>
            <AppIcon name={stat.iconName} size={22} color={stat.iconColor} filled={stat.iconFilled ?? false} />
            <Text style={styles.statNumber}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Notification Preferences Section */}
      <View style={styles.sectionCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppIcon name="bell" size={18} color="#F59E0B" />
          <Text style={styles.sectionTitle}>إعدادات الإشعارات</Text>
        </View>
        <Text style={styles.sectionSubtitle}>تحكم في الإشعارات التي تصلك</Text>

        <View style={styles.notificationPrefsContainer}>
          {/* Breeding Notifications */}
          <TouchableOpacity
            style={styles.notificationPrefRow}
            onPress={() => handleNotificationToggle('breeding', !notifyBreedingRequests)}
            disabled={savingNotifPrefs}
          >
            <View style={styles.notificationPrefInfo}>
              <View style={styles.notificationPrefIcon}>
                <AppIcon name="heart" size={28} color="#FF4D6D" filled />
              </View>
              <View style={styles.notificationPrefText}>
                <Text style={styles.notificationPrefTitle}>إشعارات طلبات التزاوج</Text>
                <Text style={styles.notificationPrefDesc}>تلقي إشعارات عند وجود طلبات تزاوج جديدة</Text>
              </View>
            </View>
            <View style={[styles.toggle, notifyBreedingRequests && styles.toggleActive]}>
              <View style={[styles.toggleThumb, notifyBreedingRequests && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>

          {/* Adoption Notifications */}
          <TouchableOpacity
            style={styles.notificationPrefRow}
            onPress={() => handleNotificationToggle('adoption', !notifyAdoptionPets)}
            disabled={savingNotifPrefs}
          >
            <View style={styles.notificationPrefInfo}>
              <View style={styles.notificationPrefIcon}>
                <AppIcon name="home" size={28} color="#FF6B35" />
              </View>
              <View style={styles.notificationPrefText}>
                <Text style={styles.notificationPrefTitle}>إشعارات التبني الجديدة</Text>
                <Text style={styles.notificationPrefDesc}>تلقي إشعارات عند إضافة حيوانات متاحة للتبني</Text>
              </View>
            </View>
            <View style={[styles.toggle, notifyAdoptionPets && styles.toggleActive]}>
              <View style={[styles.toggleThumb, notifyAdoptionPets && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.actionCard,
                (index % 2 === 1) ? styles.actionCardRight : null,
                action.danger ? styles.actionCardDanger : null,
                action.verified ? styles.actionCardVerified : null,
              ]}
              onPress={action.onPress}
              disabled={action.key === 'delete' && deletePending}
            >
              {typeof action.icon === 'string' ? (
                <Text style={[
                  styles.actionIcon,
                  action.danger ? styles.actionIconDanger : null,
                  action.verified ? styles.actionIconVerified : null
                ]}>
                  {action.icon}
                </Text>
              ) : (
                <View style={styles.actionIconContainer}>
                  {action.icon}
                </View>
              )}
              <Text style={[
                styles.actionLabel,
                action.danger ? styles.actionLabelDanger : null,
                action.verified ? styles.actionLabelVerified : null
              ]}>
                {action.key === 'delete' && deletePending ? 'جارٍ الحذف…' : action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 10,
    color: '#7f8c8d',
    fontSize: 16,
  },
  heroCard: {
    margin: 16,
    backgroundColor: '#02B7B4',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eef2f8',
    padding: 4,
    marginRight: 16,
  },
  heroAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  heroSubtitle: {
    marginTop: 4,
    color: '#e8fbf8',
    fontSize: 14,
  },
  heroBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#0ba360',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  heroBadgeSecondary: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#1c344d',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  heroBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  heroEditButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 16,
  },
  heroEditText: {
    color: '#fff',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 18,
    marginHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1c344d',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#5f6c7b',
  },
  sectionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c344d',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  notificationPrefsContainer: {
    marginTop: 16,
  },
  notificationPrefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 12,
  },
  notificationPrefInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationPrefIcon: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationPrefText: {
    flex: 1,
  },
  notificationPrefTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  notificationPrefDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#cbd5e1',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#02B7B4',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#f7f9fc',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
  },
  actionCardRight: {
    marginLeft: '4%',
  },
  actionCardDanger: {
    backgroundColor: '#fff4f4',
    borderColor: '#ffd6d6',
  },
  actionCardVerified: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  actionIconContainer: {
    marginBottom: 8,
  },
  actionIconDanger: {
    color: '#e74c3c',
  },
  actionIconVerified: {
    color: '#4CAF50',
  },
  actionLabel: {
    fontSize: 14,
    color: '#1c344d',
    fontWeight: '600',
    textAlign: 'center',
  },
  actionLabelDanger: {
    color: '#e74c3c',
    fontWeight: '700',
    textAlign: 'center',
  },
  actionLabelVerified: {
    color: '#2E7D32',
    fontWeight: '700',
    textAlign: 'center',
  },
  logoutButton: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    backgroundColor: '#e74c3c',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Removed phone alert styles
});

export default ProfileScreen;
