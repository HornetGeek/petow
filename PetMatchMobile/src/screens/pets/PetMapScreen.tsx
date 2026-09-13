import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
  PermissionsAndroid,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT , Region } from 'react-native-maps';
import FastImage from 'react-native-fast-image';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiService, ClinicMapPoint, MapCluster, PetMapPoint } from '../../services/api';
import { useFeatureFlags } from '../../services/featureFlags';
// Screens
import PetDetailsScreen from './PetDetailsScreen';
import BreedingRequestScreen from '../breeding-request/BreedingRequestScreen';
import AdoptionRequestScreen from '../adoption-request/AdoptionRequestScreen';
import AddPetScreen from './AddPetScreen';
import ClinicDetailsScreen from '../clinics/ClinicDetailsScreen';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { getFloatingTabBarContentPadding } from '../../utils/tabBarLayout';
import AppIcon from '../../components/icons/AppIcon';

const DEFAULT_CENTER: Region = {
  latitude: 31.2001,
  longitude: 29.9187,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=400&q=80';
const DEFAULT_CLINIC_LOGO = 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png';
const DEFAULT_CLINIC_ACCENT = '#0EA5A4';

// Filter options
const PET_TYPE_OPTIONS: Array<{ id: 'all' | 'dogs' | 'cats'; label: string }> = [
  { id: 'all', label: 'الكل' },
  { id: 'dogs', label: 'كلاب' },
  { id: 'cats', label: 'قطط' },
];

const GENDER_OPTIONS: Array<{ id: 'all' | 'male' | 'female'; label: string }> = [
  { id: 'all', label: 'الجميع' },
  { id: 'male', label: 'ذكور' },
  { id: 'female', label: 'إناث' },
];

const AGE_RANGES: Record<'all' | 'puppy' | 'adult' | 'senior', { label: string; min?: number; max?: number }> = {
  all: { label: 'كل الأعمار' },
  puppy: { label: 'أقل من سنة', max: 11 },
  adult: { label: 'من 1 إلى 3 سنوات', min: 12, max: 36 },
  senior: { label: 'أكبر من 3 سنوات', min: 37 },
};

const AGE_OPTIONS = [
  { id: 'all', label: AGE_RANGES.all.label },
  { id: 'puppy', label: AGE_RANGES.puppy.label },
  { id: 'adult', label: AGE_RANGES.adult.label },
  { id: 'senior', label: AGE_RANGES.senior.label },
] as const;

type MapMode = 'breeding' | 'adoption' | 'clinics';
const SERVER_FETCH_DEBOUNCE_MS = 450;
const REGION_REFETCH_CENTER_THRESHOLD_RATIO = 0.2;
const REGION_REFETCH_MIN_ZOOM_DELTA = 1;

type MarkerData = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  type: 'pet' | 'clinic';
  subtitle?: string;
  meta?: string;
  image?: string;
  distanceLabel?: string;
  originalItem: PetMapPoint | ClinicMapItem;
};
type Clustered = MarkerData & { cluster?: number; clusterId?: string };

type ClinicMapItem = {
  id: number;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
  isActive?: boolean;
  latitude?: number;
  longitude?: number;
  // Use optional+undefined (not nullable) so this shape matches what
  // ClinicDetailsScreen expects and can be passed directly to its prop.
  distanceValue?: number;
  distanceLabel?: string;
  accentColor?: string;
  logoUrl?: string;
  serviceTags?: string[];
  serviceCategoryKeys?: string[];
};

interface PetMapScreenProps {
  onSetTabBarVisible?: (visible: boolean) => void;
}

const getLimitPointsForZoom = (zoom: number): number => {
  if (zoom <= 14) return 60;
  if (zoom === 15) return 90;
  if (zoom === 16) return 130;
  return 180;
};

const getImageUrl = (url?: string) => {
  return resolveMediaUrl(url, DEFAULT_IMAGE);
};

const getClinicLogoUrl = (url?: string | null) => {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return DEFAULT_CLINIC_LOGO;
  }
  return getImageUrl(url);
};

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  return '';
};

// ... (Keep existing helpers: parseServiceTags, SERVICE_CATEGORY_LABELS, etc.)
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

const mapServiceCategoryLabel = (value: string) => {
  const normalized = value.trim();
  return SERVICE_CATEGORY_LABELS[normalized] || normalized;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalizeClinicForMap = (
  item: ClinicMapPoint,
  userLocation?: { lat: number; lng: number } | null
): ClinicMapItem => {
  const lat = normalizeNumber(item.latitude);
  const lng = normalizeNumber(item.longitude);
  let distanceValue: number | undefined = normalizeNumber(item.distance) ?? undefined;
  if (distanceValue === undefined && userLocation && lat !== null && lng !== null) {
    distanceValue = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
  }
  const distanceLabel =
    normalizeString(item.distance_display) ||
    (distanceValue !== undefined ? `${distanceValue.toFixed(1)} كم` : undefined);
  const workingHours =
    normalizeString((item as any).working_hours) ||
    normalizeString(item.opening_hours) ||
    normalizeString((item as any).workingHours);
  const logoUrl =
    normalizeString(item.logo as unknown as string) ||
    normalizeString((item as any).logo_url) ||
    undefined;
  const accentColor = normalizeHexColor(item.storefront_primary_color) || DEFAULT_CLINIC_ACCENT;
  const rawCategories = Array.isArray(item.service_categories)
    ? item.service_categories.map((tag) => normalizeString(tag)).filter(Boolean)
    : [];
  const serviceCategoryKeys = Array.from(new Set(rawCategories));
  const mappedCategories = serviceCategoryKeys.map(mapServiceCategoryLabel).filter(Boolean);
  const serviceTags = mappedCategories.length
    ? Array.from(new Set(mappedCategories)).slice(0, 3)
    : parseServiceTags(normalizeString(item.services));

  return {
    id: typeof item.id === 'number' ? item.id : Number(item.id || 0),
    name: normalizeString(item.name) || 'عيادة بيطرية',
    address: normalizeString(item.address) || undefined,
    city: normalizeString(item.city) || undefined,
    phone: normalizeString(item.phone) || undefined,
    email: normalizeString(item.email) || undefined,
    workingHours: workingHours || undefined,
    isActive: item.is_active,
    latitude: lat ?? undefined,
    longitude: lng ?? undefined,
    distanceValue,
    distanceLabel: distanceLabel || undefined,
    accentColor,
    logoUrl,
    serviceTags,
    serviceCategoryKeys,
  };
};

const requestLocationPermission = async () => {
  if (Platform.OS === 'ios') {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  }

  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'موقعك الحالي',
        message: 'نحتاج إلى إذنك لعرض الحيوانات القريبة منك على الخريطة',
        buttonPositive: 'موافقة',
        buttonNegative: 'رفض',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return false;
};

const ClusterMarker = React.memo(
  ({
    marker,
    onPress,
  }: {
    marker: Clustered;
    onPress: (marker: Clustered) => void;
  }) => {
    return (
      <Marker
        coordinate={{ latitude: marker.lat, longitude: marker.lng }}
        onPress={() => onPress(marker)}
        tracksViewChanges={false}
      >
        <View style={styles.clusterContainer}>
          <Text style={styles.clusterCount}>{marker.cluster}</Text>
        </View>
      </Marker>
    );
  }
);

const ClinicMarker = React.memo(
  ({
    marker,
    onPress,
  }: {
    marker: Clustered;
    onPress: (marker: MarkerData) => void;
  }) => {
    return (
      <Marker
        coordinate={{ latitude: marker.lat, longitude: marker.lng }}
        onPress={() => onPress(marker)}
        tracksViewChanges={false}
      >
        <View style={styles.clinicMarkerContainer}>
          <AppIcon name="shield-check" size={18} color="#fff" />
        </View>
      </Marker>
    );
  }
);

const PetImageMarker = React.memo(
  ({
    marker,
    onPress,
  }: {
    marker: Clustered;
    onPress: (marker: MarkerData) => void;
  }) => {
    // tracksViewChanges must be true while the image is loading so the map
    // captures the rasterized marker content; we flip it off the moment the
    // image resolves so future pan/zoom frames don't re-rasterize the marker.
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const lastImageUriRef = useRef(marker.image);

    useEffect(() => {
      // Only re-enable tracking when the image URL actually changes, not on
      // every re-render of the parent (markers array rebuilds even when
      // userLocation changes — see the H3 finding).
      if (lastImageUriRef.current !== marker.image) {
        lastImageUriRef.current = marker.image;
        setTracksViewChanges(true);
      }
    }, [marker.image]);

    const handleImageDone = useCallback(() => setTracksViewChanges(false), []);

    return (
      <Marker
        coordinate={{ latitude: marker.lat, longitude: marker.lng }}
        onPress={() => onPress(marker)}
        tracksViewChanges={tracksViewChanges}
      >
        <View style={styles.petMarkerContainer}>
          <FastImage
            source={{ uri: marker.image || DEFAULT_IMAGE, priority: FastImage.priority.low }}
            style={styles.petMarkerImage}
            resizeMode={FastImage.resizeMode.cover}
            onLoadEnd={handleImageDone}
            onError={handleImageDone}
          />
        </View>
      </Marker>
    );
  }
);

const PetMapScreen: React.FC<PetMapScreenProps> = ({ onSetTabBarVisible }) => {
  const { clinicMapEnabled, serverMapClusteringEnabled } = useFeatureFlags();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const [pets, setPets] = useState<PetMapPoint[]>([]);
  const [clinics, setClinics] = useState<ClinicMapItem[]>([]);
  const [serverClusters, setServerClusters] = useState<MapCluster[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshingMarkers, setIsRefreshingMarkers] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLocating, setIsLocating] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);


  const [focusedPet, setFocusedPet] = useState<PetMapPoint | null>(null);
  const [focusedClinic, setFocusedClinic] = useState<ClinicMapItem | null>(null);

  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<ClinicMapItem | null>(null);
  const [breedingPetId, setBreedingPetId] = useState<number | null>(null);
  const [adoptionPetId, setAdoptionPetId] = useState<number | null>(null);

  const [showAddPet, setShowAddPet] = useState(false);
  const [overlayCardHeight, setOverlayCardHeight] = useState(0);
  const [mapMode, setMapMode] = useState<MapMode>('breeding');
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [regionFetchTick, setRegionFetchTick] = useState(0);
  // Visible region is used to viewport-clip markers so off-screen markers
  // don't mount as <Marker> children. Updates on gesture settle only.
  const [visibleRegion, setVisibleRegion] = useState<Region | null>(null);

  // Filter states
  const [petType, setPetType] = useState<'all' | 'dogs' | 'cats'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [ageFilter, setAgeFilter] = useState<typeof AGE_OPTIONS[number]['id']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // appliedSearchQuery lags searchQuery by a short debounce so every keystroke
  // doesn't trigger a fetch — the fetch effect reads this, not searchQuery.
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCount, setFilterCount] = useState(0);

  // Debounce search input → applied search. 500ms matches the feel of other
  // typeahead experiences in the app.
  useEffect(() => {
    const id = setTimeout(() => setAppliedSearchQuery(searchQuery), 500);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const latestMapRequestRef = useRef(0);
  const currentRegionRef = useRef<Region | null>(null);
  const lastFetchedRegionRef = useRef<Region | null>(null);
  const hasLoadedMapDataRef = useRef(false);
  const immediateFetchRef = useRef(false);
  // Debounces regionFetchTick state bumps so rapid pan settles don't churn
  // the parent component (shouldRefetchForRegion may fire multiple times
  // during a long continuous pan as the 20% threshold is crossed).
  const regionTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNestedFullscreenFlow =
    showAddPet ||
    selectedPetId !== null ||
    selectedClinic !== null ||
    breedingPetId !== null ||
    adoptionPetId !== null;

  useEffect(() => {
    if (!onSetTabBarVisible) return;
    onSetTabBarVisible(!hasNestedFullscreenFlow);
    return () => onSetTabBarVisible(true);
  }, [hasNestedFullscreenFlow, onSetTabBarVisible]);

  useEffect(() => {
    if (mapMode === 'clinics') {
      setFilterCount(0);
      return;
    }
    let count = 0;
    if (petType !== 'all') count++;
    if (genderFilter !== 'all') count++;
    if (ageFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    setFilterCount(count);
  }, [petType, genderFilter, ageFilter, searchQuery, mapMode]);

  const clearAllFilters = useCallback(() => {
    setPetType('all');
    setGenderFilter('all');
    setAgeFilter('all');
    setSearchQuery('');
  }, []);

  // Marker geometry + labels deliberately do NOT depend on userLocation so GPS
  // ticks don't rebuild the whole marker array (and therefore don't invalidate
  // clusteredMarkers / visibleMarkers). Clinic distance labels come from the
  // server (normalizeClinicForMap already stamps them at fetch time using the
  // current userLocationRef). The focused-card overlay reads fresh values
  // straight off originalItem, so nothing visible depends on this memo
  // re-running on location change.
  const markers = useMemo<MarkerData[]>(() => {
    if (mapMode === 'clinics') {
      return clinics
        .map((clinic) => {
          const lat = clinic.latitude ?? NaN;
          const lng = clinic.longitude ?? NaN;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: clinic.id,
            name: clinic.name,
            subtitle: clinic.address || clinic.city || '',
            lat,
            lng,
            type: 'clinic',
            image: clinic.logoUrl ? getClinicLogoUrl(clinic.logoUrl) : undefined,
            distanceLabel: clinic.distanceLabel,
            originalItem: clinic,
          } as MarkerData;
        })
        .filter((marker): marker is MarkerData => Boolean(marker));
    }

    return pets
      .map((pet) => {
        let lat = pet.latitude !== undefined && pet.latitude !== null ? Number(pet.latitude) : NaN;
        let lng = pet.longitude !== undefined && pet.longitude !== null ? Number(pet.longitude) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          if (typeof pet.location === 'string') {
            const m = pet.location.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
            if (m) {
              lat = parseFloat(m[1]);
              lng = parseFloat(m[2]);
            }
          }
        }
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            id: pet.id,
            name: pet.name,
            subtitle: pet.breed_name || 'غير محدد',
            lat,
            lng,
            type: 'pet',
            image: getImageUrl(pet.main_image),
            originalItem: pet,
          } as MarkerData;
        }
        return null;
      })
      .filter((marker): marker is MarkerData => Boolean(marker));
  }, [pets, clinics, mapMode]);

  const clusteredMarkers = useMemo<Clustered[]>(() => {
    const clusterMarkers: Clustered[] = serverClusters
      .filter((cluster) => Number.isFinite(cluster.latitude) && Number.isFinite(cluster.longitude))
      .map((cluster, index) => {
        const numericId = Number(String(cluster.id).replace(/[^\d]/g, '')) || 900000 + index;
        return {
          id: numericId,
          clusterId: cluster.id,
          name: '',
          lat: cluster.latitude,
          lng: cluster.longitude,
          type: cluster.entity_type === 'clinic' ? 'clinic' : 'pet',
          originalItem: (cluster.entity_type === 'clinic' ? ({} as ClinicMapItem) : ({} as PetMapPoint)),
          cluster: cluster.count,
        };
      });
    return [...markers, ...clusterMarkers];
  }, [markers, serverClusters]);

  // Clip to the padded visible region so the map doesn't mount 180 <Marker>
  // children when only ~30 fit on screen. 20% padding prevents pop-in/out
  // for markers near the viewport edge during gentle pans.
  const visibleMarkers = useMemo<Clustered[]>(() => {
    if (!visibleRegion) return clusteredMarkers;
    const padLat = (visibleRegion.latitudeDelta / 2) * 1.2;
    const padLng = (visibleRegion.longitudeDelta / 2) * 1.2;
    const minLat = visibleRegion.latitude - padLat;
    const maxLat = visibleRegion.latitude + padLat;
    const minLng = visibleRegion.longitude - padLng;
    const maxLng = visibleRegion.longitude + padLng;
    return clusteredMarkers.filter(
      m => m.lat >= minLat && m.lat <= maxLat && m.lng >= minLng && m.lng <= maxLng,
    );
  }, [clusteredMarkers, visibleRegion]);

  const regionToBbox = useCallback((region: Region): string => {
    const halfLat = region.latitudeDelta / 2;
    const halfLng = region.longitudeDelta / 2;
    const minLat = Math.max(-90, region.latitude - halfLat);
    const maxLat = Math.min(90, region.latitude + halfLat);
    const minLng = Math.max(-180, region.longitude - halfLng);
    const maxLng = Math.min(180, region.longitude + halfLng);
    return `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`;
  }, []);

  const regionToZoom = useCallback((region: Region): number => {
    const normalizedDelta = Math.max(region.longitudeDelta, 0.000001);
    const estimatedZoom = Math.log2(360 / normalizedDelta);
    return Math.max(1, Math.min(20, Math.round(estimatedZoom)));
  }, []);

  const shouldRefetchForRegion = useCallback((nextRegion: Region): boolean => {
    const previousRegion = lastFetchedRegionRef.current;
    if (!previousRegion) return true;

    const latThreshold = Math.max(previousRegion.latitudeDelta * REGION_REFETCH_CENTER_THRESHOLD_RATIO, 0.0005);
    const lngThreshold = Math.max(previousRegion.longitudeDelta * REGION_REFETCH_CENTER_THRESHOLD_RATIO, 0.0005);
    const movedEnough =
      Math.abs(nextRegion.latitude - previousRegion.latitude) >= latThreshold ||
      Math.abs(nextRegion.longitude - previousRegion.longitude) >= lngThreshold;
    const zoomChangedEnough =
      Math.abs(regionToZoom(nextRegion) - regionToZoom(previousRegion)) >= REGION_REFETCH_MIN_ZOOM_DELTA;

    return movedEnough || zoomChangedEnough;
  }, [regionToZoom]);

  const handleRegionChangeComplete = useCallback((region: Region) => {
    currentRegionRef.current = region;
    setVisibleRegion(region);
    if (shouldRefetchForRegion(region)) {
      if (regionTickTimerRef.current) clearTimeout(regionTickTimerRef.current);
      regionTickTimerRef.current = setTimeout(() => {
        setRegionFetchTick((value) => value + 1);
        regionTickTimerRef.current = null;
      }, 200);
    }
  }, [shouldRefetchForRegion]);

  useEffect(() => {
    return () => {
      if (regionTickTimerRef.current) clearTimeout(regionTickTimerRef.current);
    };
  }, []);

  const loadServerMapData = useCallback(async (region: Region) => {
    const requestVersion = latestMapRequestRef.current + 1;
    latestMapRequestRef.current = requestVersion;
    const location = userLocationRef.current;
    const isFirstLoad = !hasLoadedMapDataRef.current;

    try {
      if (isFirstLoad) {
        setIsInitialLoading(true);
      } else {
        setIsRefreshingMarkers(true);
      }
      setErrorMessage('');

      const bbox = regionToBbox(region);
      const zoom = regionToZoom(region);
      const limitPoints = getLimitPointsForZoom(zoom);

      if (mapMode === 'clinics') {
        if (!clinicMapEnabled) {
          if (requestVersion === latestMapRequestRef.current) {
            setClinics([]);
            setServerClusters([]);
            setIsInitialLoading(false);
            setIsRefreshingMarkers(false);
          }
          return;
        }

        const response = await apiService.getClinicMapMarkers({
          bbox,
          zoom,
          cluster: serverMapClusteringEnabled,
          limit_points: limitPoints,
          user_lat: location?.lat,
          user_lng: location?.lng,
          search: appliedSearchQuery.trim() || undefined,
        });
        if (requestVersion !== latestMapRequestRef.current) return;

        if (response.success && response.data) {
          const normalized = (response.data.points || []).map((clinic) =>
            normalizeClinicForMap(clinic, userLocationRef.current)
          );
          setPets([]);
          setClinics(normalized);
          setServerClusters(serverMapClusteringEnabled ? (response.data.clusters || []) : []);
          hasLoadedMapDataRef.current = true;
          lastFetchedRegionRef.current = region;
        } else {
          setErrorMessage('تعذر تحميل الخدمات على الخريطة. حاول مرة أخرى لاحقاً.');
        }
        return;
      }

      const selectedAgeRange = AGE_RANGES[ageFilter];
      const gender = genderFilter === 'all' ? undefined : (genderFilter === 'male' ? 'M' : 'F');
      const response = await apiService.getPetMapMarkers({
        bbox,
        zoom,
        cluster: serverMapClusteringEnabled,
        limit_points: limitPoints,
        user_lat: location?.lat,
        user_lng: location?.lng,
        status: mapMode === 'adoption' ? 'available_for_adoption' : 'available',
        pet_type: petType === 'all' ? undefined : petType,
        gender,
        min_age_months: selectedAgeRange.min,
        max_age_months: selectedAgeRange.max,
        search: appliedSearchQuery.trim() || undefined,
      });
      if (requestVersion !== latestMapRequestRef.current) return;

      if (response.success && response.data) {
        setClinics([]);
        setPets(response.data.points || []);
        setServerClusters(serverMapClusteringEnabled ? (response.data.clusters || []) : []);
        hasLoadedMapDataRef.current = true;
        lastFetchedRegionRef.current = region;
      } else {
        setErrorMessage('تعذر تحميل الحيوانات على الخريطة. حاول مرة أخرى لاحقاً.');
      }
    } catch (error) {
      if (requestVersion !== latestMapRequestRef.current) return;
      console.error('Error loading server map data:', error);
      setErrorMessage('حدث خطأ أثناء تحميل البيانات. تحقق من الاتصال بالإنترنت.');
    } finally {
      if (requestVersion === latestMapRequestRef.current) {
        setIsInitialLoading(false);
        setIsRefreshingMarkers(false);
      }
    }
  }, [
    mapMode,
    clinicMapEnabled,
    serverMapClusteringEnabled,
    petType,
    genderFilter,
    ageFilter,
    appliedSearchQuery,
    regionToBbox,
    regionToZoom,
  ]);

  const fetchUserLocation = useCallback(async () => {
    try {
      setIsLocating(true);
      const granted = await requestLocationPermission();
      if (!granted) {
        setIsLocating(false);
        return;
      }
      Geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          userLocationRef.current = coords;
          setUserLocation(coords);
          const region = {
            latitude: coords.lat,
            longitude: coords.lng,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          };
          setInitialRegion((prev) => prev || region);
          currentRegionRef.current = region;
          if (mapRef.current) {
            mapRef.current.animateToRegion(region, 800);
          }
          setIsLocating(false);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          setIsLocating(false);
        },
        // Casual map viewing doesn't need sub-10m precision; false keeps the
        // GPS chip cool and drops battery cost significantly.
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    } catch (error) {
      console.error('Error requesting location permission:', error);
      setIsLocating(false);
    }
  }, []);

  useEffect(() => {
    if (mapMode === 'clinics' && !clinicMapEnabled) return;

    const queryRegion = currentRegionRef.current || initialRegion || DEFAULT_CENTER;
    const delayMs = immediateFetchRef.current ? 0 : SERVER_FETCH_DEBOUNCE_MS;
    immediateFetchRef.current = false;
    const timer = setTimeout(() => {
      loadServerMapData(queryRegion);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    mapMode,
    clinicMapEnabled,
    initialRegion,
    regionFetchTick,
    loadServerMapData,
  ]);

  useEffect(() => {
    if (!userLocationRef.current) fetchUserLocation();
  }, [fetchUserLocation]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  const handleRetryLoad = useCallback(() => {
    const queryRegion = currentRegionRef.current || initialRegion || DEFAULT_CENTER;
    loadServerMapData(queryRegion);
  }, [initialRegion, loadServerMapData]);

  const triggerImmediateFetch = useCallback(() => {
    immediateFetchRef.current = true;
    setRegionFetchTick((value) => value + 1);
  }, []);

  const handleMarkerPress = useCallback((marker: MarkerData) => {
    if (marker.type === 'pet') {
      setFocusedClinic(null);
      setFocusedPet(marker.originalItem as PetMapPoint);
    } else {
      setFocusedPet(null);
      setFocusedClinic({
        ...(marker.originalItem as ClinicMapItem),
        distanceLabel: marker.distanceLabel || (marker.originalItem as ClinicMapItem).distanceLabel,
      });
    }
    // Animate to marker
    mapRef.current?.animateToRegion({
      latitude: marker.lat,
      longitude: marker.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 500);
  }, []);

  const handleClusterPress = useCallback((marker: Clustered) => {
    const activeRegion = currentRegionRef.current || initialRegion || DEFAULT_CENTER;
    mapRef.current?.animateToRegion({
      ...activeRegion,
      latitude: marker.lat,
      longitude: marker.lng,
      latitudeDelta: activeRegion.latitudeDelta / 2,
      longitudeDelta: activeRegion.longitudeDelta / 2,
    }, 300);
  }, [initialRegion]);

  const handleRecenter = () => {
    if (userLocation) {
      mapRef.current?.animateToRegion({
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    } else {
      fetchUserLocation();
    }
  };

  const handleViewDetails = (pet: PetMapPoint) => {
    setFocusedPet(null);
    setSelectedPetId(pet.id);
  };

  const handlePrimaryAction = (pet: PetMapPoint) => {
    setFocusedPet(null);
    if (mapMode === 'clinics') return;
    if (mapMode === 'adoption') setAdoptionPetId(pet.id);
    else setBreedingPetId(pet.id);
  };

  const handleClinicDetails = (clinic: ClinicMapItem) => {
    setFocusedClinic(null);
    setSelectedClinic(clinic);
  };

  const handleClinicCall = (clinic: ClinicMapItem) => {
    if (!clinic.phone) {
      Alert.alert('تنبيه', 'لا يوجد رقم هاتف متاح.');
      return;
    }
    Linking.openURL(`tel:${clinic.phone}`).catch(() => {
      Alert.alert('خطأ', 'تعذر الاتصال.');
    });
  };

  const switchMapMode = (next: MapMode) => {
    if (next === 'clinics' && !clinicMapEnabled) return;
    if (mapMode === next) return;
    latestMapRequestRef.current += 1;
    immediateFetchRef.current = true;
    setFocusedPet(null);
    setFocusedClinic(null);
    setSelectedPetId(null);
    setSelectedClinic(null);
    setBreedingPetId(null);
    setAdoptionPetId(null);
    setServerClusters([]);
    if (next === 'clinics') {
      setPets([]);
    } else {
      setClinics([]);
    }
    setShowFilters(false);
    setMapMode(next);
  };

  useEffect(() => {
    if (!clinicMapEnabled && mapMode === 'clinics') {
      switchMapMode('breeding');
    }
  }, [clinicMapEnabled, mapMode]);

  const handleApplyFilters = useCallback(() => {
    setShowFilters(false);
    triggerImmediateFetch();
  }, [triggerImmediateFetch]);

  // These screens used to replace the map entirely (full-screen in-place
  // swap), which unmounted the MapView and caused a re-fetch/animate-back on
  // every detail view. They're now Modal overlays at the bottom of the main
  // return so the map stays mounted underneath.

  const showLocationLoading = isLocating && !userLocation;
  const loadingLabel = mapMode === 'clinics' ? 'جاري تحميل الخدمات القريبة...' : 'جاري تحميل الحيوانات القريبة...';
  const hasFocusedCard = !!focusedPet || !!focusedClinic;
  const mapCardBottomOffset = getFloatingTabBarContentPadding(insets.bottom, 8);
  const recenterBottomOffset = hasFocusedCard
    ? mapCardBottomOffset + Math.max(overlayCardHeight, 190) + 12
    : getFloatingTabBarContentPadding(insets.bottom, 12);

  return (
    <View style={styles.container}>
      {showLocationLoading ? (
        <View style={styles.locationLoading}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.locationLoadingText}>جاري تحديد موقعك...</Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
          style={styles.map}
          initialRegion={initialRegion || DEFAULT_CENTER}
          showsUserLocation={true}
          showsMyLocationButton={false} // Custom button used if needed, or rely on native
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {visibleMarkers.map((marker) => {
            const key = marker.clusterId ? marker.clusterId : `${marker.type}-${marker.id}`;
            if (marker.cluster && marker.cluster > 1) {
              return (
                <ClusterMarker
                  key={`cluster-${key}`}
                  marker={marker}
                  onPress={handleClusterPress}
                />
              );
            }

            if (marker.type === 'clinic') {
              return <ClinicMarker key={key} marker={marker} onPress={handleMarkerPress} />;
            }

            return <PetImageMarker key={key} marker={marker} onPress={handleMarkerPress} />;
          })}
        </MapView>
      )}

      {/* Recenter Button */}
      <TouchableOpacity
        style={[styles.recenterButton, { bottom: recenterBottomOffset }]}
        onPress={handleRecenter}
      >
        <AppIcon name="location" size={22} color="#1c344d" />
      </TouchableOpacity>

      {/* Top Controls */}
      <View style={styles.controlsContainer}>
        {/* Compact segmented switcher */}
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segment, mapMode === 'breeding' && styles.segmentActiveBreeding]}
            onPress={() => switchMapMode('breeding')}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentText, mapMode === 'breeding' && styles.segmentTextActive]}>تزاوج</Text>
            {mapMode === 'breeding' && (
              <View style={[styles.segmentCount, styles.segmentCountBreeding]}>
                <Text style={styles.segmentCountText}>{markers.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, mapMode === 'adoption' && styles.segmentActiveAdoption]}
            onPress={() => switchMapMode('adoption')}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentText, mapMode === 'adoption' && styles.segmentTextActive]}>تبني</Text>
            {mapMode === 'adoption' && (
              <View style={[styles.segmentCount, styles.segmentCountAdoption]}>
                <Text style={styles.segmentCountText}>{markers.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          {clinicMapEnabled && (
            <TouchableOpacity
              style={[styles.segment, mapMode === 'clinics' && styles.segmentActiveClinic]}
              onPress={() => switchMapMode('clinics')}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentText, mapMode === 'clinics' && styles.segmentTextActive]}>خدمات</Text>
              {mapMode === 'clinics' && (
                <View style={[styles.segmentCount, styles.segmentCountClinic]}>
                  <Text style={styles.segmentCountText}>{markers.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterBar}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={mapMode === 'clinics' ? 'ابحث عن خدمة أو عيادة...' : 'ابحث بالاسم أو السلالة...'}
              placeholderTextColor="#95a5a6"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <AppIcon name="search" size={16} color="#95a5a6" />
          </View>

          {mapMode !== 'clinics' && (
            <TouchableOpacity
              style={[styles.filterButton, filterCount > 0 && styles.filterButtonActive]}
              onPress={() => setShowFilters(true)}
            >
              <AppIcon name="settings" size={16} color="#1c344d" />
              <Text style={styles.filterText}>فلاتر</Text>
              {filterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{filterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Loading Overlay */}
      {isInitialLoading && !showLocationLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>{loadingLabel}</Text>
        </View>
      )}

      {isRefreshingMarkers && !showLocationLoading && !isInitialLoading && (
        <View style={styles.refreshingIndicator}>
          <ActivityIndicator size="small" color="#667eea" />
        </View>
      )}

      {/* Error Banner */}
      {!!errorMessage && !isInitialLoading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>⚠️ {errorMessage}</Text>
          <TouchableOpacity style={styles.bannerAction} onPress={handleRetryLoad}>
            <Text style={styles.bannerActionText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Modal */}
      {mapMode !== 'clinics' && (
        <Modal
          visible={showFilters}
          animationType="slide"
          transparent
          onRequestClose={() => setShowFilters(false)}
        >
          <View style={styles.modalContainer}>
            <TouchableWithoutFeedback onPress={() => setShowFilters(false)}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.filterModal}>
              <View style={styles.filterHeader}>
                <Text style={styles.filterTitle}>فلاتر البحث</Text>
                <TouchableOpacity onPress={() => setShowFilters(false)}>
                  <Text style={styles.filterCloseIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.filterContent} showsVerticalScrollIndicator={false}>
                {/* Pet Type */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>نوع الحيوان</Text>
                  <View style={styles.filterChips}>
                    {PET_TYPE_OPTIONS.map(option => (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.filterChip, petType === option.id && styles.filterChipActive]}
                        onPress={() => setPetType(option.id)}
                      >
                        <Text style={[styles.filterChipText, petType === option.id && styles.filterChipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Gender */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>الجنس</Text>
                  <View style={styles.filterChips}>
                    {GENDER_OPTIONS.map(option => (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.filterChip, genderFilter === option.id && styles.filterChipActive]}
                        onPress={() => setGenderFilter(option.id)}
                      >
                        <Text style={[styles.filterChipText, genderFilter === option.id && styles.filterChipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Age */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>العمر</Text>
                  <View style={styles.filterChips}>
                    {AGE_OPTIONS.map(option => (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.filterChip, ageFilter === option.id && styles.filterChipActive]}
                        onPress={() => setAgeFilter(option.id)}
                      >
                        <Text style={[styles.filterChipText, ageFilter === option.id && styles.filterChipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.filterActions}>
                <TouchableOpacity style={styles.clearButton} onPress={clearAllFilters}>
                  <Text style={styles.clearButtonText}>مسح الكل</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyButton} onPress={handleApplyFilters}>
                  <Text style={styles.applyButtonText}>تطبيق الفلاتر</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Pet Card Overlay */}
      {focusedPet && mapMode !== 'clinics' && (
        <View
          style={[styles.petCard, { bottom: mapCardBottomOffset }]}
          onLayout={(event) => setOverlayCardHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.cardHeader}>
            <FastImage
              source={{ uri: getImageUrl(focusedPet.main_image), priority: FastImage.priority.normal }}
              style={styles.petImage}
              resizeMode={FastImage.resizeMode.cover}
            />
            <View style={styles.cardInfo}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.petName}>{focusedPet.name}</Text>
                <TouchableOpacity onPress={() => setFocusedPet(null)}>
                  <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.petBreed}>{focusedPet.breed_name}</Text>
              <Text style={styles.petLocation}>{focusedPet.location || 'غير محدد'}</Text>
              <View style={styles.badgesRow}>
                <Text style={styles.badge}>{focusedPet.gender_display}</Text>
                <Text style={styles.badge}>{focusedPet.age_display}</Text>
                {focusedPet.distance_display ? (
                  <Text style={styles.badge}>{focusedPet.distance_display}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => handleViewDetails(focusedPet)}>
              <Text style={styles.secondaryButtonText}>عرض التفاصيل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, mapMode === 'adoption' ? styles.primaryButtonAdoption : styles.primaryButtonBreeding]}
              onPress={() => handlePrimaryAction(focusedPet)}
            >
              <Text style={styles.primaryButtonText}>{mapMode === 'adoption' ? 'طلب تبني' : 'طلب تزاوج'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Clinic Card Overlay */}
      {focusedClinic && mapMode === 'clinics' && (
        <View
          style={[styles.petCard, { bottom: mapCardBottomOffset }]}
          onLayout={(event) => setOverlayCardHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.cardHeader}>
            <FastImage
              source={{ uri: getClinicLogoUrl(focusedClinic.logoUrl), priority: FastImage.priority.normal }}
              style={styles.petImage}
              resizeMode={FastImage.resizeMode.contain}
            />
            <View style={styles.cardInfo}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.petName}>{focusedClinic.name}</Text>
                <TouchableOpacity onPress={() => setFocusedClinic(null)}>
                  <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.petBreed}>
                {focusedClinic.address || focusedClinic.city || 'العنوان غير متوفر'}
              </Text>
              {focusedClinic.distanceLabel ? (
                <Text style={styles.petLocation}>{focusedClinic.distanceLabel}</Text>
              ) : null}
              <View style={styles.badgesRow}>
                {focusedClinic.workingHours ? (
                  <Text style={styles.badge}>{focusedClinic.workingHours}</Text>
                ) : null}
                {typeof focusedClinic.isActive === 'boolean' ? (
                  <Text style={styles.badge}>{focusedClinic.isActive ? 'متاح' : 'غير متاح'}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => handleClinicDetails(focusedClinic)}>
              <Text style={styles.secondaryButtonText}>عرض التفاصيل</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, styles.primaryButtonClinic]} onPress={() => handleClinicCall(focusedClinic)}>
              <Text style={styles.primaryButtonText}>📞 اتصال</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Pet details overlay — keeps the map mounted beneath */}
      <Modal
        visible={!!selectedPetId}
        animationType="slide"
        onRequestClose={() => setSelectedPetId(null)}
      >
        <View style={styles.modalHost}>
          {selectedPetId ? (
            <PetDetailsScreen
              petId={selectedPetId}
              onClose={() => setSelectedPetId(null)}
              onAddPet={() => setShowAddPet(true)}
            />
          ) : null}
        </View>
      </Modal>

      {/* Clinic details overlay */}
      <Modal
        visible={!!selectedClinic}
        animationType="slide"
        onRequestClose={() => setSelectedClinic(null)}
      >
        <View style={styles.modalHost}>
          {selectedClinic ? (
            <ClinicDetailsScreen
              clinic={selectedClinic}
              onClose={() => setSelectedClinic(null)}
            />
          ) : null}
        </View>
      </Modal>

      {/* Breeding request overlay */}
      <Modal
        visible={!!breedingPetId}
        animationType="slide"
        onRequestClose={() => setBreedingPetId(null)}
      >
        <View style={styles.modalHost}>
          {breedingPetId ? (
            <BreedingRequestScreen
              petId={breedingPetId}
              onClose={() => setBreedingPetId(null)}
              onAddPet={() => setShowAddPet(true)}
              onOpenPetDetails={(pid) => {
                setBreedingPetId(null);
                setTimeout(() => setSelectedPetId(pid), 150);
              }}
            />
          ) : null}
        </View>
      </Modal>

      {/* Adoption request overlay */}
      <Modal
        visible={!!adoptionPetId}
        animationType="slide"
        onRequestClose={() => setAdoptionPetId(null)}
      >
        <View style={styles.modalHost}>
          {adoptionPetId ? (
            <AdoptionRequestScreen
              petId={adoptionPetId}
              onClose={() => setAdoptionPetId(null)}
              onSuccess={() => setAdoptionPetId(null)}
            />
          ) : null}
        </View>
      </Modal>

      {/* Add pet overlay */}
      <Modal
        visible={showAddPet}
        animationType="slide"
        onRequestClose={() => setShowAddPet(false)}
      >
        <View style={styles.modalHost}>
          {showAddPet ? (
            <AddPetScreen
              onClose={() => setShowAddPet(false)}
              onPetCreated={() => triggerImmediateFetch()}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHost: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  locationLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  locationLoadingText: {
    marginTop: 12,
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248,250,252,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 900,
  },
  loadingText: {
    marginTop: 16,
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshingIndicator: {
    position: 'absolute',
    top: 132,
    right: 24,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 960,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  errorBanner: {
    position: 'absolute',
    top: 130, // pushed down below controls
    left: 20,
    right: 20,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    zIndex: 950,
  },
  errorTitle: {
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  bannerAction: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bannerActionText: {
    color: '#fff',
    fontWeight: '600',
  },
  petCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 1000,
  },
  cardHeader: {
    flexDirection: 'row',
  },
  petImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginLeft: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  petName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeIcon: {
    fontSize: 16,
    color: '#94a3b8',
  },
  petBreed: {
    color: '#64748b',
    marginTop: 2,
    fontSize: 12,
  },
  petLocation: {
    color: '#475569',
    marginTop: 4,
    fontSize: 12,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  badge: {
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1e293b',
    fontWeight: '700',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonBreeding: {
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButtonAdoption: {
    backgroundColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButtonClinic: {
    backgroundColor: '#0ea5a4',
    shadowColor: '#0ea5a4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  // Top Controls
  controlsContainer: {
    position: 'absolute',
    top: 50, // Moved down for safe area if needed, or keeping explicit
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  segmentActiveBreeding: { backgroundColor: '#6366f1' },
  segmentActiveAdoption: { backgroundColor: '#0ea5e9' },
  segmentActiveClinic: { backgroundColor: '#0ea5a4' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  segmentTextActive: { color: '#fff' },
  segmentCount: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentCountBreeding: { backgroundColor: 'rgba(255,255,255,0.22)' },
  segmentCountAdoption: { backgroundColor: 'rgba(255,255,255,0.22)' },
  segmentCountClinic: { backgroundColor: 'rgba(255,255,255,0.22)' },
  segmentCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#0f172a',
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  searchIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
  filterButton: {
    width: 44,
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  filterButtonActive: {
    backgroundColor: '#6366f1',
  },
  filterIcon: {
    fontSize: 18,
  },
  filterText: {
    display: 'none',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  filterModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  filterCloseIcon: {
    fontSize: 20,
    color: '#94a3b8',
    padding: 4,
  },
  filterContent: {
    marginBottom: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 12,
    textAlign: 'left',
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    direction: 'rtl', // Ensure RTL layout for chips
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#6366f1',
  },
  filterChipIcon: {
    marginRight: 6,
    fontSize: 16,
  },
  filterChipText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#4338ca',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
  },
  clearButtonText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 15,
  },
  applyButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 14,
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Markers
  petMarkerContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petMarkerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  clusterContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4f46e5',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  clinicMarkerContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0ea5a4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  clinicMarkerIcon: {
    fontSize: 16,
    color: '#fff',
  },
  recenterButton: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 900,
  },
  recenterIcon: {
    fontSize: 22,
  },
});

export default PetMapScreen;
