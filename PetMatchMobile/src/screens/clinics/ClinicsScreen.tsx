import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Platform,
  Image,
  PermissionsAndroid,
  SafeAreaView,
  StatusBar,
  Dimensions,
  I18nManager,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { apiService, Clinic } from '../../services/api';
import ClinicDetailsScreen from './ClinicDetailsScreen';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const { width } = Dimensions.get('window');

type ClinicItem = {
  id: number;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
  isActive: boolean;
  latitude?: number;
  longitude?: number;
  distanceValue?: number | null;
  distanceLabel?: string;
  accentColor: string;
  logoUrl?: string;
  hasDashboard: boolean;
  serviceTags?: string[];
  serviceCategoryKeys?: string[];
  isOpenNow?: boolean | null;
};

type ClinicsScreenProps = {
  onClose: () => void;
};

// --- Helper Functions ---
const requestLocationPermission = async () => {
  if (Platform.OS === 'ios') {
    const auth = await Geolocation.requestAuthorization('whenInUse');
    return auth === 'granted';
  }

  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'إذن الموقع مطلوب',
        message: 'نحتاج إلى الوصول إلى موقعك لعرض أقرب العيادات إليك.',
        buttonNeutral: 'اسألني لاحقاً',
        buttonNegative: 'إلغاء',
        buttonPositive: 'موافق',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return false;
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  return '';
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeHexColor = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return null;
  const expanded = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  return `#${expanded.toUpperCase()}`;
};

const getOpenNowFromHours = (value?: string): boolean | null => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (/(24\s*\/\s*7|24\s*ساعة|24\s*ساعه|24h)/i.test(normalized)) {
    return true;
  }

  const match = normalized.match(
    /(\d{1,2})\s*:\s*(\d{2})\s*(am|pm|ص|م)?\s*-\s*(\d{1,2})\s*:\s*(\d{2})\s*(am|pm|ص|م)?/i
  );
  if (!match) return null;

  const parseTime = (hourText: string, minuteText: string, period?: string) => {
    let hour = Number(hourText);
    const minute = Number(minuteText);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (period) {
      const normalizedPeriod = period.toLowerCase();
      const isPm = normalizedPeriod.includes('pm') || normalizedPeriod.includes('م');
      const isAm = normalizedPeriod.includes('am') || normalizedPeriod.includes('ص');
      if (isPm && hour < 12) hour += 12;
      if (isAm && hour === 12) hour = 0;
    }
    if (hour < 0 || hour >= 24 || minute < 0 || minute >= 60) return null;
    return hour * 60 + minute;
  };

  const start = parseTime(match[1], match[2], match[3] || undefined);
  const end = parseTime(match[4], match[5], match[6] || undefined);

  if (start === null || end === null) {
    return null;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (start === end) return true;
  if (end > start) return nowMinutes >= start && nowMinutes <= end;
  return nowMinutes >= start || nowMinutes <= end;
};

const parseServiceTags = (value?: string): string[] => {
  if (!value) return [];
  const parts = value
    .split(/[,،|•]/g)
    .map(part => part.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, 3);
};

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  general: 'فحص عام',
  vaccination: 'تطعيم',
  surgery: 'جراحة',
  grooming: 'تنظيف وتجميل',
  dental: 'عناية الأسنان',
  breeding: 'استشارات تزاوج',
  boarding: 'إقامة ورعاية',
  emergency: 'طوارئ',
  diagnostic: 'فحوصات تشخيصية',
  prescription: 'وصفات طبية',
  other: 'خدمات أخرى',
};

const SERVICE_CATEGORY_KEYS = [
  'general',
  'vaccination',
  'surgery',
  'grooming',
  'dental',
  'breeding',
  'boarding',
  'emergency',
  'diagnostic',
  'prescription',
  'other',
];

const mapServiceCategoryLabel = (value: string) => {
  const normalized = value.trim();
  return SERVICE_CATEGORY_LABELS[normalized] || normalized;
};

const SERVICE_CATEGORY_LABEL_TO_KEY = Object.entries(SERVICE_CATEGORY_LABELS).reduce<Record<string, string>>(
  (acc, [key, label]) => {
    acc[label] = key;
    return acc;
  },
  {}
);

const resolveCategoryKey = (value: string) => {
  if (!value || value === 'all') return null;
  if (SERVICE_CATEGORY_LABELS[value]) return value;
  return SERVICE_CATEGORY_LABEL_TO_KEY[value] || null;
};

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'الكل' },
  ...SERVICE_CATEGORY_KEYS.map((key) => ({
    key,
    label: mapServiceCategoryLabel(key),
  })),
];

const CLINICS_PAGE_SIZE = 20;

const ACCENT_PALETTE = ['#0EA5A4', '#2563EB', '#F97316', '#10B981', '#7C3AED', '#EF4444'];
const DEFAULT_BRAND = '#0EA5A4';
const DEFAULT_SERVICE_TAGS = ['تطعيمات', 'كشف'];

const pickAccentColor = (value: string): string => {
  if (!value) return ACCENT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1000;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
};

const getInitials = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return 'CL';
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1]?.slice(0, 1) || ''}`.toUpperCase();
};

const getImageUrl = (value?: string) => {
  return resolveMediaUrl(value);
};

const normalizeClinic = (item: any, userLat?: number, userLon?: number): ClinicItem => {
  const workingHours =
    normalizeString(item.working_hours) ||
    normalizeString(item.workingHours) ||
    normalizeString(item.opening_hours) ||
    normalizeString(item.working_hours_display);

  const lat = normalizeNumber(item.latitude);
  const lon = normalizeNumber(item.longitude);

  let distanceValue =
    normalizeNumber(item.distance) ??
    normalizeNumber(item.distance_km);

  if (distanceValue === null && userLat !== undefined && userLat !== null && userLon !== undefined && userLon !== null && lat !== null && lon !== null) {
    distanceValue = calculateDistance(userLat, userLon, lat, lon);
  }

  const distanceLabel = normalizeString(item.distance_display) ||
    (distanceValue !== null ? `${distanceValue.toFixed(1)} كم` : '');

  const dashboardFlag =
    typeof item.has_dashboard === 'boolean'
      ? item.has_dashboard
      : typeof item.is_dashboard === 'boolean'
        ? item.is_dashboard
        : typeof item.dashboard_enabled === 'boolean'
          ? item.dashboard_enabled
          : typeof item.has_storefront === 'boolean'
            ? item.has_storefront
            : typeof item.has_dashboard_access === 'boolean'
              ? item.has_dashboard_access
              : true;

  const logoUrl = normalizeString(item.logo) || normalizeString(item.logo_url) || undefined;
  const accentColor = normalizeHexColor(item.storefront_primary_color) || pickAccentColor(normalizeString(item.name));
  const rawCategories = Array.isArray(item.service_categories)
    ? item.service_categories.map((tag: unknown) => normalizeString(tag)).filter(Boolean)
    : [];
  const serviceCategoryKeys = Array.from(new Set(rawCategories));
  const mappedCategories = serviceCategoryKeys.map(mapServiceCategoryLabel).filter(Boolean);
  const serviceTags = mappedCategories.length
    ? Array.from(new Set(mappedCategories)).slice(0, 3)
    : parseServiceTags(normalizeString(item.services));
  const isOpenNow = getOpenNowFromHours(workingHours);

  return {
    id: typeof item.id === 'number' ? item.id : Number(item.id || 0),
    name: normalizeString(item.name) || 'عيادة بيطرية',
    code: normalizeString(item.code) || undefined,
    address: normalizeString(item.address) || undefined,
    city: normalizeString(item.city) || undefined,
    phone: normalizeString(item.phone) || undefined,
    email: normalizeString(item.email) || undefined,
    workingHours: workingHours || undefined,
    isActive: normalizeBoolean(item.is_active ?? item.isActive, true),
    latitude: lat ?? undefined,
    longitude: lon ?? undefined,
    distanceValue,
    distanceLabel: distanceLabel || undefined,
    accentColor,
    logoUrl,
    hasDashboard: dashboardFlag,
    serviceTags,
    serviceCategoryKeys,
    isOpenNow,
  };
};

const ClinicsScreen: React.FC<ClinicsScreenProps> = ({ onClose }) => {
  const [clinics, setClinics] = useState<ClinicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<ClinicItem | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const fetchLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (hasPermission) {
      Geolocation.getCurrentPosition(
        (position) => {
          setUserLocation(position.coords);
        },
        (error) => {
          console.log('Location error:', error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    }
  };

  const loadClinics = async ({ reset = false } = {}) => {
    try {
      if (reset) {
        setLoading(true);
        setClinics([]);
        setPage(1);
        setHasNextPage(true);
      } else {
        setIsLoadingMore(true);
      }
      setErrorMessage(null);
      const categoryKey = resolveCategoryKey(selectedCategory);
      const targetPage = reset ? 1 : page;
      const response = await apiService.getClinics({
        serviceCategory: categoryKey || undefined,
        page: targetPage,
        pageSize: CLINICS_PAGE_SIZE,
      });
      if (response.success && response.data) {
        const payload = response.data as any;
        const raw = Array.isArray(payload)
          ? payload
          : payload.results || [];
        const nextPage = Array.isArray(payload) ? null : payload.next;
        const normalized = raw.map((c: any) => normalizeClinic(c, userLocation?.latitude, userLocation?.longitude));
        if (reset) {
          setClinics(normalized);
        } else {
          setClinics((prev) => [...prev, ...normalized]);
        }
        setHasNextPage(Boolean(nextPage));
        setPage(targetPage + 1);
      } else {
        setErrorMessage(response.error || 'تعذر تحميل قائمة العيادات.');
      }
    } catch (error) {
      console.error('Error loading clinics:', error);
      setErrorMessage('حدث خطأ أثناء تحميل العيادات.');
    } finally {
      if (reset) {
        setLoading(false);
      }
      setRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  useEffect(() => {
    loadClinics({ reset: true });
  }, [selectedCategory]);

  useEffect(() => {
    if (!userLocation || clinics.length === 0) return;
    const needsUpdate = clinics.some(c => {
      const lat = c.latitude;
      const lon = c.longitude;
      return typeof lat === 'number' && typeof lon === 'number' && c.distanceValue == null;
    });
    if (!needsUpdate) return;

    setClinics(prev => prev.map(c => {
      const lat = c.latitude;
      const lon = c.longitude;
      if (typeof lat === 'number' && typeof lon === 'number' && c.distanceValue == null) {
        const dist = calculateDistance(userLocation.latitude, userLocation.longitude, lat, lon);
        return {
          ...c,
          distanceValue: dist,
          distanceLabel: `${dist.toFixed(1)} كم`,
        };
      }
      return c;
    }));
  }, [userLocation, clinics]);

  const processedClinics = useMemo(() => {
    let list = [...clinics];
    const query = searchQuery.trim().toLowerCase();

    // Filter by Dashboard
    list = list.filter(clinic => clinic.hasDashboard);

    // Filter by Search Query
    if (query) {
      list = list.filter(clinic => {
        const tagTokens = [
          ...(clinic.serviceTags || []),
          ...(clinic.serviceCategoryKeys || []),
        ];
        const haystack = [
          clinic.name,
          clinic.address,
          clinic.city,
          clinic.phone,
          ...tagTokens,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    if (selectedCategory !== 'all') {
      const resolvedKey = resolveCategoryKey(selectedCategory);
      const label = mapServiceCategoryLabel(resolvedKey || selectedCategory);
      const labelLower = label.toLowerCase();
      list = list.filter((clinic) => {
        if (clinic.serviceCategoryKeys?.includes(selectedCategory)) return true;
        if (resolvedKey && clinic.serviceCategoryKeys?.includes(resolvedKey)) return true;

        if (!labelLower) return false;
        const tags = clinic.serviceTags || [];
        return tags.some((tag) => normalizeString(tag).toLowerCase().includes(labelLower));
      });
    }

    // Sort
    list.sort((a, b) => {
      const distA = typeof a.distanceValue === 'number' ? a.distanceValue : null;
      const distB = typeof b.distanceValue === 'number' ? b.distanceValue : null;
      if (distA !== null && distB !== null) {
        if (Math.abs(distA - distB) > 0.1) return distA - distB;
      } else if (distA !== null) {
        return -1;
      } else if (distB !== null) {
        return 1;
      }

      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [clinics, searchQuery, selectedCategory]);


  const handleRefresh = () => {
    setRefreshing(true);
    fetchLocation();
    loadClinics({ reset: true });
  };

  const handleDirections = (clinic: ClinicItem) => {
    const coordsAvailable = typeof clinic.latitude === 'number' && typeof clinic.longitude === 'number';
    const query = coordsAvailable
      ? `${clinic.latitude},${clinic.longitude}`
      : clinic.address || clinic.city || clinic.name;

    if (!query) {
      Alert.alert('تنبيه', 'لا يوجد موقع مسجل لهذه العيادة.');
      return;
    }

    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${encodeURIComponent(query)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

    Linking.openURL(url).catch(() => Alert.alert('خطأ', 'تعذر فتح الخرائط.'));
  };

  const DEFAULT_CLINIC_LOGO = 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png'; // Generic Vet Icon

  const renderClinic = ({ item }: { item: ClinicItem }) => {
    const initials = getInitials(item.name);
    // Use default logo if no URL is provided
    const logoSource = item.logoUrl ? { uri: getImageUrl(item.logoUrl) } : { uri: DEFAULT_CLINIC_LOGO };
    const serviceTags = item.serviceTags?.length ? item.serviceTags : DEFAULT_SERVICE_TAGS;
    const openNow = item.isOpenNow;
    const openLabel = openNow === null ? (item.isActive ? 'متاح' : 'غير متاح') : (openNow ? 'مفتوح الآن' : 'مغلق الآن');
    const openTagStyle = openNow === null
      ? (item.isActive ? styles.tagActive : styles.tagClosed)
      : (openNow ? styles.tagActive : styles.tagClosed);
    const openTextStyle = openNow === null
      ? (item.isActive ? styles.tagTextActive : styles.tagTextClosed)
      : (openNow ? styles.tagTextActive : styles.tagTextClosed);

    return (
      <TouchableOpacity
        style={styles.cardContainer}
        onPress={() => setSelectedClinic(item)}
        activeOpacity={0.9}
      >
        <View style={styles.cardMain}>
          {/* Right: Logo */}
          <View style={[styles.logoContainer, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1F5F9' }]}>
            <Image source={logoSource} style={styles.logoImage} resizeMode="contain" />
          </View>

          {/* Left: Info */}
          <View style={styles.infoContent}>
            <View style={styles.headerRow}>
              <Text style={styles.clinicName} numberOfLines={1}>{item.name}</Text>
            </View>

            <Text style={styles.addressText} numberOfLines={1}>
              {item.address || item.city || 'العنوان غير متوفر'}
            </Text>
            {item.distanceLabel ? (
              <Text style={styles.distanceText} numberOfLines={1}>
                يبعد {item.distanceLabel}
              </Text>
            ) : null}

            <View style={styles.tagsRow}>
              <View style={[styles.tag, openTagStyle]}>
                <Text style={openTextStyle}>{openLabel}</Text>
              </View>
              <View style={[styles.tag, item.distanceLabel ? styles.tagDistance : styles.tagMuted]}>
                <Text style={item.distanceLabel ? styles.tagText : styles.tagTextMuted}>
                  {item.distanceLabel ? `📍 ${item.distanceLabel}` : '📍 فعّل الموقع'}
                </Text>
              </View>
              {serviceTags.slice(0, 2).map((tag) => (
                <View key={`${item.id}-${tag}`} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Actions Footer */}
        <View style={styles.cardFooter}>
          <TouchableOpacity style={[styles.bookBtn, { backgroundColor: DEFAULT_BRAND }]} onPress={() => setSelectedClinic(item)}>
            <Text style={styles.bookBtnText}>ابحث وتواصل</Text>
            <Text style={styles.bookBtnIcon}>🗓️</Text>

          </TouchableOpacity>

          <TouchableOpacity style={styles.callIconBtn} onPress={() => item.phone && Linking.openURL(`tel:${item.phone}`)}>
            <Text style={{ fontSize: 18 }}>📞</Text>
          </TouchableOpacity>
        </View>

      </TouchableOpacity>
    );
  };

  if (selectedClinic) {
    return (
      <ClinicDetailsScreen
        clinic={{
          ...selectedClinic,
          distanceValue: selectedClinic.distanceValue ?? undefined, // Fix null vs undefined
        }}
        onClose={() => setSelectedClinic(null)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.wrapper}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Text style={styles.iconBtnText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>العيادات</Text>

          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>☰</Text>
          </TouchableOpacity>
        </View>


        {/* Search */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث عن عيادة / طبيب / خدمة"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity style={styles.searchActionBtn}>
              <Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filters */}
        <View style={styles.filtersWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
            {CATEGORY_OPTIONS.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  selectedCategory === filter.key && { backgroundColor: DEFAULT_BRAND, borderColor: DEFAULT_BRAND }
                ]}
                onPress={() => setSelectedCategory(filter.key)}
              >
                <Text style={[
                  styles.filterText,
                  selectedCategory === filter.key && { color: '#fff' }
                ]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List */}
        <FlatList
          data={processedClinics}
          keyExtractor={item => item.id.toString()}
          renderItem={renderClinic}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (loading || refreshing || isLoadingMore || !hasNextPage) return;
            loadClinics();
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[DEFAULT_BRAND]} />
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={DEFAULT_BRAND} />
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>لم يتم العثور على عيادات</Text>
              </View>
            )
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.paginationLoader}>
                <ActivityIndicator size="small" color={DEFAULT_BRAND} />
              </View>
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: Platform.OS === 'android' ? 10 : 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor: '#F8FAFC',
  },
  iconBtnText: {
    fontSize: 20,
    color: '#334155',
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC', // Very light gray
    borderRadius: 16,
    height: 54,
    paddingLeft: 6,
    paddingRight: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    textAlign: 'right', // Arabic
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  searchActionBtn: {
    width: 42,
    height: 42,
    backgroundColor: DEFAULT_BRAND,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  filtersWrapper: {
    height: 50,
    marginBottom: 10,
  },
  filtersContent: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  paginationLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  centerContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },

  // Card Styles
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 16,
    padding: 16,
    // Soft shadow
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardMain: {
    flexDirection: 'row-reverse', // Arabic layout: Logo on Right
    marginBottom: 16,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    marginLeft: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#00000008',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  infoContent: {
    flex: 1,
    alignItems: 'flex-end', // Right align content for Arabic
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  clinicName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right', // Arabic
    marginLeft: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starIcon: {
    fontSize: 10,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
  },
  addressText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right', // Arabic
    marginBottom: 10,
  },
  distanceText: {
    fontSize: 12,
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tagActive: {
    backgroundColor: '#ECFDF5',
  },
  tagClosed: {
    backgroundColor: '#FEF2F2',
  },
  tagMuted: {
    backgroundColor: '#F8FAFC',
  },
  tagDistance: {
    backgroundColor: '#EFF6FF',
  },
  tagText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  tagTextMuted: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  tagTextActive: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '700',
  },
  tagTextClosed: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  bookBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bookBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  bookBtnIcon: {
    color: '#fff',
    fontSize: 14,
  },
  callIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  }
});

export default ClinicsScreen;
