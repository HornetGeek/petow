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
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import HomeScreen from '../screens/main/HomeScreen';
import PetsScreen from '../screens/pets/PetsScreen';
import AdoptionPetsScreen from '../screens/pets/AdoptionPetsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PetMapScreen from '../screens/pets/PetMapScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import GoogleProfileCompletionScreen from '../screens/auth/GoogleProfileCompletionScreen';
import AppIcon, { AppIconName, IconSize } from '../components/icons/AppIcon';

type RootTabParamList = {
  home: undefined;
  adoption: undefined;
  matches: undefined;
  map: undefined;
  profile: undefined;
};

type TabName = keyof RootTabParamList;
type TabBarVisibilityState = Record<TabName, boolean>;

const TAB_ICONS: Record<TabName, AppIconName> = {
  home: 'home',
  adoption: 'paw',
  matches: 'heart',
  map: 'map',
  profile: 'user',
};
const DEFAULT_TAB_BAR_VISIBILITY: TabBarVisibilityState = {
  home: true,
  adoption: true,
  matches: true,
  map: true,
  profile: true,
};

const USE_BOTTOM_TABS = true; // feature flag to switch navigation implementations
const Tab = createBottomTabNavigator<RootTabParamList>();

const AppNavigator: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [showRegister, setShowRegister] = useState(false);
  const [showGoogleCompletion, setShowGoogleCompletion] = useState(false);
  const [googlePicture, setGooglePicture] = useState<string | undefined>(undefined);
  const [addPetTrigger, setAddPetTrigger] = useState<number | null>(null);
  const [breedingRequestsTrigger, setBreedingRequestsTrigger] = useState<number | null>(null);
  const [notificationsTrigger, setNotificationsTrigger] = useState<number | null>(null);
  const [adoptionRequestsTrigger, setAdoptionRequestsTrigger] = useState<number | null>(null);
  const [petDetailsTrigger, setPetDetailsTrigger] = useState<number | null>(null);
  const [petDetailsId, setPetDetailsId] = useState<number | null>(null);
  const [adoptionSearchQuery, setAdoptionSearchQuery] = useState<string>('');
  const [matchesSearchQuery, setMatchesSearchQuery] = useState<string>('');
  const [adoptionScreenKey, setAdoptionScreenKey] = useState(0);
  const [matchesScreenKey, setMatchesScreenKey] = useState(0);
  const [clinicChatFirebaseId, setClinicChatFirebaseId] = useState<string | null>(null);
  const [tabBarVisibility, setTabBarVisibility] = useState<TabBarVisibilityState>(
    DEFAULT_TAB_BAR_VISIBILITY
  );

  const navigationRef = useNavigationContainerRef<RootTabParamList>();
  const insets = useSafeAreaInsets();
  const backPressTimestamp = useRef<number>(0);

  const setTabBarVisibleForTab = useCallback((tabName: TabName, visible: boolean) => {
    setTabBarVisibility(prev => {
      if (prev[tabName] === visible) {
        return prev;
      }
      return { ...prev, [tabName]: visible };
    });
  }, []);

  const setHomeTabBarVisible = useCallback(
    (visible: boolean) => setTabBarVisibleForTab('home', visible),
    [setTabBarVisibleForTab]
  );
  const setMapTabBarVisible = useCallback(
    (visible: boolean) => setTabBarVisibleForTab('map', visible),
    [setTabBarVisibleForTab]
  );
  const setProfileTabBarVisible = useCallback(
    (visible: boolean) => setTabBarVisibleForTab('profile', visible),
    [setTabBarVisibleForTab]
  );

  const renderTabIcon = (tabName: TabName, active: boolean) => (
    <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
      <View style={styles.tabIcon}>
        <AppIcon
          name={TAB_ICONS[tabName]}
          size={IconSize.md}
          color={active ? '#02B7B4' : '#6f8090'}
          filled={tabName === 'matches' && active}
          accessibilityLabel={tabName}
        />
      </View>
    </View>
  );

  const getQueryParam = (link: string, key: string): string | null => {
    const regex = new RegExp(`[?&]${key}=([^&]+)`, 'i');
    const match = regex.exec(link);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const parsePositiveId = (value: string | null): number | null => {
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.floor(parsed);
  };

  const handleOpenAdoption = useCallback((searchQuery?: string) => {
    const normalized = typeof searchQuery === 'string' ? searchQuery.trim() : '';
    setAdoptionSearchQuery(normalized);
    setAdoptionScreenKey(prev => prev + 1);
    setActiveTab('adoption');
    if (USE_BOTTOM_TABS && navigationRef.current) {
      navigationRef.current.navigate('adoption');
    }
  }, []);

  const handleOpenMatches = useCallback((searchQuery?: string) => {
    const normalized = typeof searchQuery === 'string' ? searchQuery.trim() : '';
    setMatchesSearchQuery(normalized);
    setMatchesScreenKey(prev => prev + 1);
    setActiveTab('matches');
    if (USE_BOTTOM_TABS && navigationRef.current) {
      navigationRef.current.navigate('matches');
    }
  }, []);

  const handleDeepLink = useCallback((incoming?: string | null) => {
    if (!incoming) return;
    try {
      const url = incoming.trim();
      if (!url) return;
      const normalized = url.toLowerCase();
      if (normalized.startsWith('petow://clinic-chat')) {
        const firebaseId =
          getQueryParam(url, 'firebase_chat_id') ||
          getQueryParam(url, 'chat_id') ||
          getQueryParam(url, 'chat_room_id');
        if (firebaseId) {
          setActiveTab('home');
          if (USE_BOTTOM_TABS && navigationRef.current) {
            navigationRef.current.navigate('home');
          }
          setClinicChatFirebaseId(firebaseId);
        }
        return;
      }

      if (normalized.startsWith('petow://add-pet')) {
        setActiveTab('home');
        if (USE_BOTTOM_TABS && navigationRef.current) {
          navigationRef.current.navigate('home');
        }
        setAddPetTrigger(Date.now());
      } else if (normalized.startsWith('petow://breeding-requests')) {
        setActiveTab('home');
        if (USE_BOTTOM_TABS && navigationRef.current) {
          navigationRef.current.navigate('home');
        }
        setBreedingRequestsTrigger(Date.now());
      } else if (normalized.startsWith('petow://adoption-requests')) {
        setActiveTab('home');
        if (USE_BOTTOM_TABS && navigationRef.current) {
          navigationRef.current.navigate('home');
        }
        setAdoptionRequestsTrigger(Date.now());
      } else if (normalized.startsWith('petow://notifications')) {
        setActiveTab('home');
        if (USE_BOTTOM_TABS && navigationRef.current) {
          navigationRef.current.navigate('home');
        }
        setNotificationsTrigger(Date.now());
      } else if (normalized.startsWith('petow://pet-details')) {
        const incomingPetId =
          parsePositiveId(getQueryParam(url, 'pet_id')) ||
          parsePositiveId(getQueryParam(url, 'id'));
        setActiveTab('home');
        if (USE_BOTTOM_TABS && navigationRef.current) {
          navigationRef.current.navigate('home');
        }
        if (incomingPetId) {
          setPetDetailsId(incomingPetId);
          setPetDetailsTrigger(Date.now());
        } else {
          setNotificationsTrigger(Date.now());
        }
      } else if (normalized.startsWith('petow://profile')) {
        setActiveTab('profile');
        if (USE_BOTTOM_TABS && navigationRef.current) {
          navigationRef.current.navigate('profile');
        }
      }
    } catch (error) {
      console.warn('Deep link handling error:', error);
    }
  }, []);

  useEffect(() => {
    if (USE_BOTTOM_TABS) return; // handled separately below
    const onBackPress = () => {
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

      return false;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [activeTab]);

  useEffect(() => {
    if (!USE_BOTTOM_TABS) return;
    const onBackPress = () => {
      const current = navigationRef.getCurrentRoute()?.name as TabName | undefined;
      if (current === 'home') {
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
        return false;
      }
      if (navigationRef.current) {
        navigationRef.current.navigate('home');
        return true;
      }
      return false;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [navigationRef]);

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
    if (showGoogleCompletion) {
      return (
        <GoogleProfileCompletionScreen
          googlePicture={googlePicture}
          onComplete={() => {
            setShowGoogleCompletion(false);
            setGooglePicture(undefined);
          }}
        />
      );
    }
    if (showRegister) {
      return (
        <RegisterScreen
          onNavigateToLogin={() => setShowRegister(false)}
          onGoogleNewUser={(pic) => {
            setGooglePicture(pic);
            setShowGoogleCompletion(true);
          }}
        />
      );
    }
    return (
      <LoginScreen
        onNavigateToRegister={() => setShowRegister(true)}
        onGoogleNewUser={(pic) => {
          setGooglePicture(pic);
          setShowGoogleCompletion(true);
        }}
      />
    );
  }

  if (USE_BOTTOM_TABS) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <NavigationContainer
          ref={navigationRef}
          onStateChange={() => {
            const current = navigationRef.getCurrentRoute()?.name as TabName | undefined;
            if (current) setActiveTab(current);
          }}
        >
          <Tab.Navigator
            initialRouteName="home"
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: '#02B7B4',
              tabBarInactiveTintColor: '#7f8c8d',
              tabBarStyle: [
                styles.tabBarNav,
                {
                  paddingBottom: Platform.OS === 'ios' ? 12 : Math.max(insets.bottom, 12),
                  height: Platform.OS === 'ios' ? 74 : 74 + insets.bottom,
                  bottom: Platform.OS === 'ios' ? 8 : insets.bottom + 8,
                  display: tabBarVisibility[route.name as TabName] ? 'flex' : 'none',
                },
              ],
              tabBarItemStyle: {
                borderRadius: 16,
                marginHorizontal: 6,
              },
              tabBarLabelStyle: {
                fontSize: 11,
                fontWeight: '600',
                marginBottom: 2,
              },
              tabBarIcon: ({ focused }) => renderTabIcon(route.name as TabName, focused),
            })}
          >
            <Tab.Screen
              name="home"
              options={{ tabBarLabel: 'الرئيسية' }}
            >
              {() => (
                <HomeScreen
                  triggerAddPet={addPetTrigger}
                  onAddPetHandled={() => setAddPetTrigger(null)}
                  triggerBreedingOverview={breedingRequestsTrigger}
                  onBreedingOverviewHandled={() => setBreedingRequestsTrigger(null)}
                  triggerNotifications={notificationsTrigger}
                  onNotificationsHandled={() => setNotificationsTrigger(null)}
                  triggerAdoptionRequests={adoptionRequestsTrigger}
                  onAdoptionRequestsHandled={() => setAdoptionRequestsTrigger(null)}
                  triggerPetDetails={petDetailsTrigger}
                  triggerPetDetailsId={petDetailsId}
                  onPetDetailsHandled={() => setPetDetailsTrigger(null)}
                  onOpenAdoption={handleOpenAdoption}
                  onOpenMatches={handleOpenMatches}
                  clinicChatFirebaseId={clinicChatFirebaseId}
                  onClinicChatHandled={() => setClinicChatFirebaseId(null)}
                  onOpenProfileTab={() => navigationRef.current?.navigate('profile')}
                  onSetTabBarVisible={setHomeTabBarVisible}
                />
              )}
            </Tab.Screen>

            <Tab.Screen
              name="adoption"
              options={{ tabBarLabel: 'تبني' }}
            >
              {() => (
                <AdoptionPetsScreen
                  key={`adoption-${adoptionScreenKey}`}
                  initialSearchQuery={adoptionSearchQuery}
                />
              )}
            </Tab.Screen>

            <Tab.Screen
              name="matches"
              options={{ tabBarLabel: 'تزاوج' }}
            >
              {() => (
                <PetsScreen
                  key={`matches-${matchesScreenKey}`}
                  initialSearchQuery={matchesSearchQuery}
                />
              )}
            </Tab.Screen>

            <Tab.Screen
              name="map"
              options={{ tabBarLabel: 'الخريطة' }}
            >
              {() => (
                <PetMapScreen
                  onSetTabBarVisible={setMapTabBarVisible}
                />
              )}
            </Tab.Screen>

            <Tab.Screen
              name="profile"
              options={{ tabBarLabel: 'الملف الشخصي' }}
            >
              {() => (
                <ProfileScreen
                  onSetTabBarVisible={setProfileTabBarVisible}
                />
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaView>
    );
  }

  // Fallback to legacy manual tab bar (flag disabled)
  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            triggerAddPet={addPetTrigger}
            onAddPetHandled={() => setAddPetTrigger(null)}
            triggerBreedingOverview={breedingRequestsTrigger}
            onBreedingOverviewHandled={() => setBreedingRequestsTrigger(null)}
            triggerNotifications={notificationsTrigger}
            onNotificationsHandled={() => setNotificationsTrigger(null)}
            triggerAdoptionRequests={adoptionRequestsTrigger}
            onAdoptionRequestsHandled={() => setAdoptionRequestsTrigger(null)}
            triggerPetDetails={petDetailsTrigger}
            triggerPetDetailsId={petDetailsId}
            onPetDetailsHandled={() => setPetDetailsTrigger(null)}
            onOpenAdoption={handleOpenAdoption}
            onOpenMatches={handleOpenMatches}
            clinicChatFirebaseId={clinicChatFirebaseId}
            onClinicChatHandled={() => setClinicChatFirebaseId(null)}
            onOpenProfileTab={() => setActiveTab('profile')}
            onSetTabBarVisible={setHomeTabBarVisible}
          />
        );
      case 'adoption':
        return (
          <AdoptionPetsScreen
            key={`adoption-${adoptionScreenKey}`}
            initialSearchQuery={adoptionSearchQuery}
          />
        );
      case 'matches':
        return (
          <PetsScreen
            key={`matches-${matchesScreenKey}`}
            initialSearchQuery={matchesSearchQuery}
          />
        );
      case 'map':
        return <PetMapScreen onSetTabBarVisible={setMapTabBarVisible} />;
      case 'profile':
        return <ProfileScreen onSetTabBarVisible={setProfileTabBarVisible} />;
      default:
        return (
          <HomeScreen
            triggerAddPet={addPetTrigger}
            onAddPetHandled={() => setAddPetTrigger(null)}
            triggerBreedingOverview={breedingRequestsTrigger}
            onBreedingOverviewHandled={() => setBreedingRequestsTrigger(null)}
            triggerNotifications={notificationsTrigger}
            onNotificationsHandled={() => setNotificationsTrigger(null)}
            triggerAdoptionRequests={adoptionRequestsTrigger}
            onAdoptionRequestsHandled={() => setAdoptionRequestsTrigger(null)}
            triggerPetDetails={petDetailsTrigger}
            triggerPetDetailsId={petDetailsId}
            onPetDetailsHandled={() => setPetDetailsTrigger(null)}
            onOpenAdoption={handleOpenAdoption}
            onOpenMatches={handleOpenMatches}
            clinicChatFirebaseId={clinicChatFirebaseId}
            onClinicChatHandled={() => setClinicChatFirebaseId(null)}
            onOpenProfileTab={() => setActiveTab('profile')}
            onSetTabBarVisible={setHomeTabBarVisible}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <View style={styles.container}>
        {renderScreen()}
        <View style={[styles.tabBar, !tabBarVisibility[activeTab] && styles.tabBarHidden]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'home' && styles.activeTab]}
            onPress={() => setActiveTab('home')}
          >
            {renderTabIcon('home', activeTab === 'home')}
            <Text style={[styles.tabLabel, activeTab === 'home' && styles.activeTabLabel]}>
              الرئيسية
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'adoption' && styles.activeTab]}
            onPress={() => setActiveTab('adoption')}
          >
            {renderTabIcon('adoption', activeTab === 'adoption')}
            <Text style={[styles.tabLabel, activeTab === 'adoption' && styles.activeTabLabel]}>
              تبني
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'matches' && styles.activeTab]}
            onPress={() => setActiveTab('matches')}
          >
            {renderTabIcon('matches', activeTab === 'matches')}
            <Text style={[styles.tabLabel, activeTab === 'matches' && styles.activeTabLabel]}>
              تزاوج
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'map' && styles.activeTab]}
            onPress={() => setActiveTab('map')}
          >
            {renderTabIcon('map', activeTab === 'map')}
            <Text style={[styles.tabLabel, activeTab === 'map' && styles.activeTabLabel]}>
              الخريطة
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
            onPress={() => setActiveTab('profile')}
          >
            {renderTabIcon('profile', activeTab === 'profile')}
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
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 0 : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  tabBarHidden: {
    display: 'none',
  },
  tabBarNav: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    elevation: 16,
  },
  iconWrap: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: '#e6faf9',
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
    width: 20,
    height: 20,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  activeTabLabel: {
    color: '#02B7B4',
    fontWeight: 'bold',
  },
});

export default AppNavigator;
