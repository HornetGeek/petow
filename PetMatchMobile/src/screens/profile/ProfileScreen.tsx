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


const ProfileScreen: React.FC = () => {
  const { logout } = useAuth();
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

  useEffect(() => {
    loadUserProfile();
    loadUserPets();
    loadCounts();
  }, []);

  const loadUserProfile = async () => {
    try {
      const response = await apiService.getUserProfile();
      if (response.success && response.data) {
        setUserProfile(response.data);
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
    return <ChatScreen firebaseChatId={selectedChatId} onClose={closeChat} />;
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
    let u = raw.trim().replace('http://', 'https://');
    if (u.startsWith('https:/') && !u.startsWith('https://')) u = u.replace('https:/', 'https://');
    if (u.includes('https:/.petow.app')) u = u.replace(/https:\/\/.?petow\.app/g, 'https://api.petow.app');
    if (!/^https?:\/\//i.test(u)) u = `https://api.petow.app${u.startsWith('/') ? '' : '/'}${u}`;
    if (u.includes('/api/media/')) u = u.replace('/api/media/', '/media/');
    return u || fallbackAvatar;
  })();
  const joinDateLabel = userProfile?.date_joined
    ? new Date(userProfile.date_joined).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
    : null;

  const stats = [
    { key: 'pets', icon: '🐾', label: 'حيواناتي', value: String(userPetsCount) },
    { key: 'requests', icon: '💞', label: 'طلبات التزاوج', value: String(breedingRequestsCount) },
    { key: 'favorites', icon: '❤️', label: 'المفضلة', value: String(favoritesCount) },
  ];

  const quickActions = [
    { key: 'add', label: 'إضافة حيوان', icon: '➕', onPress: showAddPetScreen },
    { key: 'mypets', label: 'حيواناتي', icon: '🐶', onPress: showMyPetsScreen },
    { key: 'favorites', label: 'المفضلة', icon: '❤️', onPress: showFavoritesScreen },
    { key: 'chat', label: 'المحادثات', icon: '💬', onPress: showChatListScreen },
    { key: 'support', label: 'الدعم', icon: '🟢', onPress: async () => {
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
        } catch {}
        try {
          // Fallback to web (browser)
          await Linking.openURL(webUrl);
        } catch (e) {
          Alert.alert('تعذر الفتح', 'لا يمكن فتح واتساب على هذا الجهاز.');
        }
      } },
    { key: 'edit', label: 'تعديل البيانات', icon: '📝', onPress: openEdit },
    { key: 'settings', label: 'الإعدادات', icon: '⚙️', onPress: showSettingsScreen },
    { key: 'delete', label: 'حذف الحساب', icon: '🗑️', onPress: confirmDeleteAccount, danger: true },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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
            {userProfile?.is_verified ? (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>حساب موثَّق</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={openEdit} style={styles.heroEditButton}>
            <Text style={styles.heroEditText}>تعديل</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.key} style={styles.statCard}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={styles.statNumber}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
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
              ]}
              onPress={action.onPress}
              disabled={action.key === 'delete' && deletePending}
            >
              <Text style={[styles.actionIcon, action.danger ? styles.actionIconDanger : null]}>{action.icon}</Text>
              <Text style={[styles.actionLabel, action.danger ? styles.actionLabelDanger : null]}>
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  heroBadgeText: {
    color: '#fff',
    fontWeight: '600',
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
  actionIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  actionIconDanger: {
    color: '#e74c3c',
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
});

export default ProfileScreen;
