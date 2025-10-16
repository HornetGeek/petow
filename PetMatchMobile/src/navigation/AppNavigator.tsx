import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  BackHandler,
  ToastAndroid,
  Platform,
  SafeAreaView,
  StatusBar,
  Linking,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import HomeScreen from '../screens/main/HomeScreen';
import PetsScreen from '../screens/pets/PetsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PetMapScreen from '../screens/pets/PetMapScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

type TabName = 'home' | 'map' | 'pets' | 'profile';

const AppNavigator: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [showRegister, setShowRegister] = useState(false);
  const [addPetTrigger, setAddPetTrigger] = useState<number | null>(null);
  const [breedingRequestsTrigger, setBreedingRequestsTrigger] = useState<number | null>(null);
  const [petsSearchQuery, setPetsSearchQuery] = useState<string>('');
  const [clinicChatFirebaseId, setClinicChatFirebaseId] = useState<string | null>(null);

  const backPressTimestamp = useRef<number>(0);

  const getQueryParam = (link: string, key: string): string | null => {
    const regex = new RegExp(`[?&]${key}=([^&]+)`, 'i');
    const match = regex.exec(link);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const handleNavigateToPets = useCallback((searchQuery?: string) => {
    if (searchQuery) {
      setPetsSearchQuery(searchQuery);
    }
    setActiveTab('pets');
  }, []);

  const handleDeepLink = useCallback((incoming?: string | null) => {
    if (!incoming) return;
    try {
      const url = incoming.trim();
      if (!url) return;
      const normalized = url.toLowerCase();
      if (normalized.startsWith('petow://clinic-chat')) {
        const firebaseId = getQueryParam(url, 'firebase_chat_id')
          || getQueryParam(url, 'chat_id')
          || getQueryParam(url, 'chat_room_id');
        if (firebaseId) {
          setActiveTab('home');
          setClinicChatFirebaseId(firebaseId);
        }
        return;
      }

      if (normalized.startsWith('petow://add-pet')) {
        setActiveTab('home');
        setAddPetTrigger(Date.now());
      } else if (normalized.startsWith('petow://breeding-requests')) {
        setActiveTab('home');
        setBreedingRequestsTrigger(Date.now());
      }
    } catch (error) {
      console.warn('Deep link handling error:', error);
    }
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      // Don't intercept back button - let individual screens handle it
      // Only handle back button when in home tab for exit functionality
      if (activeTab === 'home') {
        if (Platform.OS === 'android') {
          const now = Date.now();
          if (now - (backPressTimestamp.current || 0) < 2000) {
            BackHandler.exitApp();
            return true;
          }
          backPressTimestamp.current = now;
          ToastAndroid.show('اضغط مرة أخرى للخروج', ToastAndroid.SHORT);
          return true;
        }
      }

      // Let other screens handle back button naturally
      return false;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [activeTab]);

  useEffect(() => {
    const fetchInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        handleDeepLink(initialUrl);
      } catch (error) {
        console.warn('Failed to fetch initial deep link:', error);
      }
    };

    fetchInitialUrl();
    const subscription = Linking.addEventListener('url', event => handleDeepLink(event.url));
    return () => subscription.remove();
  }, [handleDeepLink]);



  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>جاري التحميل...</Text>
      </View>
    );
  }

  if (!user) {
    if (showRegister) {
      return (
        <RegisterScreen onNavigateToLogin={() => setShowRegister(false)} />
      );
    }
    return (
      <LoginScreen onNavigateToRegister={() => setShowRegister(true)} />
    );
  }
  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            triggerAddPet={addPetTrigger}
            onAddPetHandled={() => setAddPetTrigger(null)}
            triggerBreedingOverview={breedingRequestsTrigger}
            onBreedingOverviewHandled={() => setBreedingRequestsTrigger(null)}
            onNavigateToPets={handleNavigateToPets}
            clinicChatFirebaseId={clinicChatFirebaseId}
            onClinicChatHandled={() => setClinicChatFirebaseId(null)}
          />
        );
      case 'map':
        return <PetMapScreen />;
      case 'pets':
        return <PetsScreen initialSearchQuery={petsSearchQuery} />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return (
          <HomeScreen
            triggerAddPet={addPetTrigger}
            onAddPetHandled={() => setAddPetTrigger(null)}
            triggerBreedingOverview={breedingRequestsTrigger}
            onBreedingOverviewHandled={() => setBreedingRequestsTrigger(null)}
            onNavigateToPets={handleNavigateToPets}
            clinicChatFirebaseId={clinicChatFirebaseId}
            onClinicChatHandled={() => setClinicChatFirebaseId(null)}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <View style={styles.container}>
        {renderScreen()}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'home' && styles.activeTab]}
            onPress={() => setActiveTab('home')}
          >
            <Text style={styles.tabIcon}>🏠</Text>
            <Text style={[styles.tabLabel, activeTab === 'home' && styles.activeTabLabel]}>
              الرئيسية
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'map' && styles.activeTab]}
            onPress={() => setActiveTab('map')}
          >
            <Text style={styles.tabIcon}>🗺️</Text>
            <Text style={[styles.tabLabel, activeTab === 'map' && styles.activeTabLabel]}>
              الخريطة
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pets' && styles.activeTab]}
            onPress={() => setActiveTab('pets')}
          >
            <Text style={styles.tabIcon}>🐕</Text>
            <Text style={[styles.tabLabel, activeTab === 'pets' && styles.activeTabLabel]}>
              الحيوانات
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
            onPress={() => setActiveTab('profile')}
          >
            <Text style={styles.tabIcon}>👤</Text>
            <Text style={[styles.tabLabel, activeTab === 'profile' && styles.activeTabLabel]}>
              الملف الشخصي
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: Platform.OS === 'android' ? 25 : 0, // Add extra padding for Android status bar
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 0 : 0, // SafeAreaView handles this now
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  activeTabLabel: {
    color: '#02B7B4',
    fontWeight: 'bold',
  },
});

export default AppNavigator;
