import React, { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StatusBar,
  Platform,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
  InteractionManager,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService, Pet } from '../../services/api';
import { parseAgeToMonths, timeAgo, distanceKm, formatDistanceLabel, normalizeImageUrl } from '../../utils/formatters';
import { useProfileLocation } from '../../hooks/useProfileLocation';
import PetDetailsScreen from './PetDetailsScreen';
import BreedingRequestScreen from '../breeding-request/BreedingRequestScreen';
import AddPetScreen from '../pets/AddPetScreen';
import AppIcon from '../../components/icons/AppIcon';
import { getFloatingTabBarContentPadding } from '../../utils/tabBarLayout';

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

const AGE_RANGES: Record<
  'all' | 'puppy' | 'adult' | 'senior',
  { label: string; min?: number; max?: number }
> = {
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

type HostingOptionId = 'all' | 'my_place' | 'other_place' | 'both' | 'flexible';

const HOSTING_OPTIONS: Array<{ id: HostingOptionId; label: string }> = [
  { id: 'all', label: 'كل الأماكن' },
  { id: 'my_place', label: 'استضافة عندي' },
  { id: 'other_place', label: 'استضافة لدى الطرف الآخر' },
  { id: 'both', label: 'كلا المكانين' },
  { id: 'flexible', label: 'مرن' },
];

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const Chip: React.FC<ChipProps> = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const Tag: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <View style={styles.tag}>
    <Text style={styles.tagText}>{label}</Text>
    <TouchableOpacity onPress={onRemove} style={styles.tagRemoveButton}>
      <Text style={styles.tagRemoveText}>×</Text>
    </TouchableOpacity>
  </View>
);

// Persist scroll position across unmounts/navigation
let PETS_LIST_PERSISTED_OFFSET = 0;
let PETS_LIST_HAS_PERSISTED = false;

interface PetsScreenProps {
  initialSearchQuery?: string;
}

const HEADER_BASE_PADDING = 16;

const HOSTING_LABELS: Record<string, string> = {
  my_place: 'استضافة عندي',
  other_place: 'استضافة لدى الطرف الآخر',
  both: 'كلا المكانين',
  flexible: 'مرن',
};

const FALLBACK_CARD_IMAGE =
  'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=300&q=80';

// Decorated pet type carrying precomputed distance so sorting and rendering
// don't recompute haversine or regex-parse strings on every render.
type DisplayPet = Pet & {
  _distanceKm: number | null;
  _distanceLabel: string | null;
};

const decoratePetDistance = (
  pet: Pet,
  user: { lat: number; lng: number } | null,
): { km: number | null; label: string | null } => {
  // Prefer the server's numeric km value — previously we parsed the first
  // number from `distance_display`, but that string switches units
  // ("500 متر" vs "1.5 كم"), so a 0.5 km pet parsed as 500, broke the
  // distance-color pill, and reordered paginated results.
  const km =
    typeof pet.distance === 'number' && Number.isFinite(pet.distance)
      ? pet.distance
      : distanceKm((pet as any).latitude, (pet as any).longitude, user);
  const serverLabel = pet.distance_display && String(pet.distance_display).trim();
  const label = serverLabel || (km !== null ? formatDistanceLabel(km) : null);
  return { km, label };
};

// In-memory cache shared across all cards to avoid repeated reverse geocoding
// for the same coordinates.
const reverseGeocodeCache = new Map<string, string>();

const looksLikeCoords = (s: string | undefined | null) =>
  !!s && /^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$/.test(s);

interface PetLocationDisplayProps {
  petId: number;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location?: string | null;
}

// Memoized so the reverse-geocode effect doesn't re-fire whenever the parent
// re-renders; shallow-equal primitive props mean identical inputs skip the
// effect entirely. The child also owns its own loading state so a slow
// network call on one card can't stall siblings.
const PetLocationDisplay = memo<PetLocationDisplayProps>(({ petId, latitude, longitude, location }) => {
  const [address, setAddress] = useState<string>(location || 'غير محدد');
  const [loading, setLoading] = useState(false);
  const savedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const getAddressFromCoordinates = async (lat: number, lng: number): Promise<string> => {
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      const cached = reverseGeocodeCache.get(key);
      if (cached) return cached;
      try {
        const res = await apiService.mapsReverseGeocode({ lat, lng, language: 'ar' });
        if (!res.success || !res.data?.address) {
          throw new Error(res.error || 'Reverse geocode failed');
        }
        const full = res.data.address as string | undefined;
        if (full && full.length) {
          reverseGeocodeCache.set(key, full);
          return full;
        }
        if (location && !looksLikeCoords(location)) return location;
        return 'العنوان غير متاح';
      } catch {
        if (location && !looksLikeCoords(location)) return location;
        return reverseGeocodeCache.get(key) || 'العنوان غير متاح';
      }
    };

    const run = async () => {
      if (location && !looksLikeCoords(location) && !latitude && !longitude) {
        if (!cancelled) setAddress(location);
        return;
      }
      if (latitude && longitude) {
        if (!cancelled) setLoading(true);
        const addr = await getAddressFromCoordinates(Number(latitude), Number(longitude));
        if (cancelled) return;
        if (addr === 'العنوان غير متاح' && location && !looksLikeCoords(location)) {
          setAddress(location);
        } else {
          setAddress(addr);
        }
        if (!savedRef.current && petId && addr && addr !== 'العنوان غير متاح') {
          savedRef.current = true;
          apiService.updatePetLocationIfNeeded(petId, location ?? undefined, addr);
        }
        setLoading(false);
        return;
      }
      const m = location?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        if (!cancelled) setLoading(true);
        const addr = await getAddressFromCoordinates(parseFloat(m[1]), parseFloat(m[2]));
        if (cancelled) return;
        if (addr === 'العنوان غير متاح' && location && !looksLikeCoords(location)) {
          setAddress(location);
        } else {
          setAddress(addr);
        }
        if (!savedRef.current && petId && addr && addr !== 'العنوان غير متاح') {
          savedRef.current = true;
          apiService.updatePetLocationIfNeeded(petId, location ?? undefined, addr);
        }
        setLoading(false);
        return;
      }
      if (!cancelled) setAddress(location || 'غير محدد');
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [petId, latitude, longitude, location]);

  return (
    <View style={styles.petLocation}>
      <AppIcon name="location" size={14} color="#02B7B4" />
      <Text style={styles.petLocationText}>{loading ? 'جاري التحميل...' : address}</Text>
    </View>
  );
});
PetLocationDisplay.displayName = 'PetLocationDisplay';

interface PetCardProps {
  pet: DisplayPet;
  onPressDetails: (petId: number) => void;
  onPressBreeding: (petId: number) => void;
  onToggleFavorite: (petId: number) => void;
}

// Memoized card so unrelated parent re-renders (scroll tick, filter dropdown
// toggle, etc.) don't re-render every visible card. Handlers are passed
// ID-agnostic and stable across renders.
const PetCard = memo<PetCardProps>(({ pet, onPressDetails, onPressBreeding, onToggleFavorite }) => {
  const imageUrl = useMemo(
    () => normalizeImageUrl(pet.main_image?.replace('http://', 'https://') || FALLBACK_CARD_IMAGE),
    [pet.main_image],
  );
  const hostingLabel = HOSTING_LABELS[(pet as any).hosting_preference as string] || undefined;
  const firstLineDescription = pet.description ? pet.description.split(/\r?\n/)[0].trim() : '';
  const distanceText = pet._distanceLabel;
  const distanceKmValue = pet._distanceKm;
  const addedText = pet.created_at ? timeAgo(pet.created_at) : '';
  const distanceStyle =
    distanceKmValue != null
      ? distanceKmValue < 5
        ? styles.distanceNear
        : distanceKmValue < 20
          ? styles.distanceMid
          : styles.distanceFar
      : styles.distanceMid;

  return (
    <TouchableOpacity style={styles.petCard} onPress={() => onPressDetails(pet.id)}>
      <View style={styles.imageWrap}>
        <FastImage
          source={{ uri: imageUrl, priority: FastImage.priority.normal }}
          style={styles.petImage}
          resizeMode={FastImage.resizeMode.cover}
        />
        {distanceText ? (
          <View style={[styles.distancePill, distanceStyle]}>
            <View style={styles.distancePillContent}>
              <AppIcon name="location" size={13} color="#fff" />
              <Text style={styles.distancePillText}>{distanceText}</Text>
            </View>
          </View>
        ) : null}
        {pet.owner_is_verified ? (
          <View style={styles.verifiedPill}>
            <View style={styles.verifiedPillContent}>
              <AppIcon name="shield-check" size={13} color="#fff" />
              <Text style={styles.verifiedPillText}>موثوق</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.petInfo}>
        <View style={styles.petHeader}>
          <View style={styles.petTitleRow}>
            <Text style={styles.petName}>{pet.name}</Text>
            {addedText ? (
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>{addedText}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => onToggleFavorite(pet.id)}>
            <View style={styles.favoriteIcon}>
              <AppIcon name="heart" size={18} color="#ff6b81" filled />
            </View>
          </TouchableOpacity>
        </View>
        <Text style={styles.petBreed}>{pet.breed_name}</Text>
        <PetLocationDisplay
          petId={pet.id}
          latitude={(pet as any).latitude}
          longitude={(pet as any).longitude}
          location={pet.location}
        />
        <View style={styles.petDetailsRow}>
          <Text style={styles.petDetailBadge}>{pet.gender_display}</Text>
          <Text style={styles.petDetailBadge}>{pet.age_display}</Text>
          <Text style={styles.petDetailBadge}>{pet.pet_type_display}</Text>
          {hostingLabel ? <Text style={styles.petDetailBadge}>{hostingLabel}</Text> : null}
        </View>
        {firstLineDescription ? (
          <Text style={styles.petDescription} numberOfLines={1} ellipsizeMode="tail">
            {firstLineDescription}
          </Text>
        ) : null}
        <View style={styles.petActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onPressDetails(pet.id)}>
            <Text style={styles.secondaryButtonText}>عرض التفاصيل</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={() => onPressBreeding(pet.id)}>
            <Text style={styles.primaryButtonText}>طلب تزاوج</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});
PetCard.displayName = 'PetCard';

const PetsScreen: React.FC<PetsScreenProps> = ({ initialSearchQuery }) => {
  const insets = useSafeAreaInsets();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaginating, setIsPaginating] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [breedingPetId, setBreedingPetId] = useState<number | null>(null);
  const [showAddPet, setShowAddPet] = useState(false);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null);
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);
  const listRef = useRef<FlatList<DisplayPet> | null>(null);
  const scrollOffsetRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const userHasScrolledRef = useRef(false);
  // Synchronous guards so concurrent onEndReached fires can't both pass the
  // !isPaginating check before React state updates land.
  const pageRef = useRef(1);
  const isPaginatingRef = useRef(false);

  // Current user location (from profile) for distance calculation fallback
  const { userLocation, isReady: profileReady } = useProfileLocation();
  const [closestFirst, setClosestFirst] = useState(true);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [appliedSearch, setAppliedSearch] = useState(initialSearchQuery || '');
  const [appliedLocation, setAppliedLocation] = useState('');

  const [petType, setPetType] = useState<'all' | 'dogs' | 'cats'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [ageFilter, setAgeFilter] = useState<(typeof AGE_OPTIONS)[number]['id']>('all');
  const [hostPreference, setHostPreference] = useState<HostingOptionId>('all');

  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [draftPetType, setDraftPetType] =
    useState<(typeof PET_TYPE_OPTIONS)[number]['id']>('all');
  const [draftAge, setDraftAge] = useState<(typeof AGE_OPTIONS)[number]['id']>('all');
  const [draftHosting, setDraftHosting] = useState<HostingOptionId>('all');
  const [draftLocation, setDraftLocation] = useState('');

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (petType !== 'all') count += 1;
    if (genderFilter !== 'all') count += 1;
    if (ageFilter !== 'all') count += 1;
    if (hostPreference !== 'all') count += 1;
    if (appliedLocation) count += 1;
    return count;
  }, [petType, genderFilter, ageFilter, hostPreference, appliedLocation]);

  const showAddPetScreen = () => setShowAddPet(true);
  const hideAddPetScreen = () => setShowAddPet(false);
  const handlePetCreated = () => {
    loadPets(1, true);
  };

  useEffect(() => {
    if (!profileReady) return;
    loadPets(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petType, appliedSearch, appliedLocation, closestFirst, userLocation, profileReady]);

  // Fetch user profile to get stored coordinates (fallback if API doesn't provide distance_display)
  const loadPets = async (pageNum = 1, reset = false) => {
    if (isPaginatingRef.current && !reset) return; // prevent overlapping pagination

    try {
      if (reset) {
        setLoading(true);
        setHasMore(true);
        if (pageNum === 1) {
          setPets([]);
          setPage(1);
          pageRef.current = 1;
        }
        PETS_LIST_PERSISTED_OFFSET = 0;
        PETS_LIST_HAS_PERSISTED = false;
        hasRestoredRef.current = false;
        userHasScrolledRef.current = false;
        setSavedScrollPosition(null);
        setShouldRestoreScroll(false);
        if (listRef.current) {
          listRef.current.scrollToOffset({ offset: 0, animated: false });
        }
      } else {
        // Own the concurrency guard entirely here — callers must NOT pre-set
        // the ref, otherwise the early-return above would fire immediately.
        isPaginatingRef.current = true;
        setIsPaginating(true);
        setPaginationError(false);
      }

      // Compute age range in months from selected filter (if any)
      const range = AGE_RANGES[ageFilter];
      const minAge = typeof range?.min === 'number' ? range.min : undefined;
      const maxAge = typeof range?.max === 'number' ? range.max : undefined;

      if (closestFirst && userLocation) {
        const response = await apiService.getPets({
          search: appliedSearch || undefined,
          pet_type: petType === 'all' ? undefined : petType,
          exclude_status: 'available_for_adoption',
          page: pageNum,
          page_size: 12,
          ordering: 'distance',
          user_lat: userLocation.lat,
          user_lng: userLocation.lng,
          ...(typeof minAge === 'number' ? { min_age_months: minAge } : {}),
          ...(typeof maxAge === 'number' ? { max_age_months: maxAge } : {}),
        });

        if (response.success && response.data) {
          const incoming = response.data.results || [];
          if (reset) {
            setPets(incoming);
          } else {
            setPets(prev => [...prev, ...incoming]);
          }
          setHasMore(Boolean(response.data.next));
          if (!reset) {
            setPage(pageNum);
            pageRef.current = pageNum;
          }
        }
      } else {
        const response = await apiService.getPets({
          search: appliedSearch || undefined,
          pet_type: petType === 'all' ? undefined : petType,
          page: pageNum,
          ordering: '-created_at',
          page_size: 12,
          exclude_status: 'available_for_adoption', // Exclude adoption pets
          user_lat: userLocation ? userLocation.lat : undefined,
          user_lng: userLocation ? userLocation.lng : undefined,
          ...(typeof minAge === 'number' ? { min_age_months: minAge } : {}),
          ...(typeof maxAge === 'number' ? { max_age_months: maxAge } : {}),
        });

        if (response.success && response.data) {
          const incoming = response.data.results || [];
          if (reset) {
            setPets(incoming);
          } else {
            setPets(prev => [...prev, ...incoming]);
          }
          setHasMore(Boolean(response.data.next));
          if (!reset) {
            setPage(pageNum);
            pageRef.current = pageNum;
          }
        }
      }
    } catch (error) {
      console.error('Error loading pets:', error);
      if (reset) {
        Alert.alert('خطأ', 'فشل في تحميل الحيوانات');
      } else {
        setPaginationError(true);
      }
    } finally {
      setLoading(false);
      setIsPaginating(false);
      isPaginatingRef.current = false;
    }
  };

  const clearAllFilters = useCallback(() => {
    setPetType('all');
    setGenderFilter('all');
    setAgeFilter('all');
    setHostPreference('all');
    setAppliedLocation('');
    setSearchQuery('');
    setAppliedSearch('');
    loadPets(1, true);
  }, []);

  // Restore on mount and persist on unmount (no navigation dependency)
  useEffect(() => {
    const restore = () => {
      if (userHasScrolledRef.current || hasRestoredRef.current) return;
      if (!listRef.current) return;
      const target =
        shouldRestoreScroll && savedScrollPosition !== null
          ? savedScrollPosition
          : PETS_LIST_HAS_PERSISTED
            ? PETS_LIST_PERSISTED_OFFSET
            : null;
      if (target !== null) {
        listRef.current.scrollToOffset({ offset: target, animated: false });
        hasRestoredRef.current = true;
        setShouldRestoreScroll(false);
      }
    };

    const handle = InteractionManager.runAfterInteractions(restore);

    return () => {
      if (typeof scrollOffsetRef.current === 'number') {
        PETS_LIST_PERSISTED_OFFSET = scrollOffsetRef.current;
        PETS_LIST_HAS_PERSISTED = true;
      }
      handle.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPets(1, true);
    setRefreshing(false);
  };

  const loadMore = useCallback(() => {
    // Don't auto-retry after a pagination failure — wait for the user to tap
    // the retry button so we don't hammer a failing endpoint. loadPets owns
    // the isPaginatingRef guard; we just gate on its current value here so
    // two rapid onEndReached fires collapse into one fetch.
    if (loading || isPaginatingRef.current || !hasMore || paginationError) return;
    loadPets(pageRef.current + 1, false);
  }, [loading, hasMore, paginationError]);

  const handleRetryPagination = useCallback(() => {
    if (isPaginatingRef.current) return;
    loadPets(pageRef.current + 1, false);
  }, []);

  const applySearch = () => {
    setAppliedSearch(searchQuery.trim());
  };

  const filteredPets = useMemo(() => {
    return pets.filter(pet => {
      if (genderFilter !== 'all') {
        const g = genderFilter === 'male' ? 'M' : 'F';
        if (pet.gender !== g) return false;
      }

      if (ageFilter !== 'all') {
        const range = AGE_RANGES[ageFilter];
        const months =
          typeof pet.age_months === 'number' ? pet.age_months : parseAgeToMonths(pet.age_display);
        if (months === null) return false;
        if (typeof range.min === 'number' && months < range.min) return false;
        if (typeof range.max === 'number' && months > range.max) return false;
      }

      if (hostPreference !== 'all') {
        const preference = (pet as any).hosting_preference as string | undefined;
        if (preference !== hostPreference) return false;
      }

      if (appliedLocation) {
        if (!pet.location || !pet.location.toLowerCase().includes(appliedLocation.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [pets, genderFilter, ageFilter, hostPreference, appliedLocation]);

  const decoratedPets = useMemo<DisplayPet[]>(() => {
    const user = userLocation ?? null;
    return filteredPets.map(p => {
      const { km, label } = decoratePetDistance(p, user);
      return { ...p, _distanceKm: km, _distanceLabel: label };
    });
  }, [filteredPets, userLocation]);

  // Trust the server's ordering. When `closestFirst && userLocation`, the
  // server already returns pets in distance order (via ordering=distance);
  // when not, it returns by -created_at. Sorting locally broke pagination:
  // appending page 2 caused the re-sort to move existing pets around because
  // `_distanceKm` was previously derived from the string display (which has
  // mixed units). Keeping the array in the order the server returned it
  // means page N pets always append after page N-1 pets.
  const displayPets = decoratedPets;

  const handleOpenAdvanced = () => {
    setDraftPetType(petType);
    setDraftAge(ageFilter);
    setDraftHosting(hostPreference);
    setDraftLocation(appliedLocation);
    setAdvancedVisible(true);
  };

  const handleApplyAdvanced = () => {
    setPetType(draftPetType);
    setAgeFilter(draftAge);
    setHostPreference(draftHosting);
    setAppliedLocation(draftLocation.trim());
    setAdvancedVisible(false);
  };

  const handleResetAdvanced = () => {
    setDraftPetType('all');
    setDraftAge('all');
    setDraftHosting('all');
    setDraftLocation('');
  };

  const captureScrollPosition = useCallback(() => {
    setSavedScrollPosition(scrollOffsetRef.current);
    setShouldRestoreScroll(true);
  }, []);

  const openPetDetails = useCallback((petId: number) => {
    setSavedScrollPosition(scrollOffsetRef.current);
    setShouldRestoreScroll(true);
    setSelectedPetId(petId);
  }, []);

  const openBreedingRequest = useCallback((petId: number) => {
    setSavedScrollPosition(scrollOffsetRef.current);
    setShouldRestoreScroll(true);
    setBreedingPetId(petId);
  }, []);

  const closeBreedingRequest = useCallback(() => {
    setBreedingPetId(null);
  }, []);

  const toggleFavorite = useCallback(async (petId: number) => {
    try {
      const response = await apiService.toggleFavorite(petId);
      if (response.success) {
        Alert.alert('نجح', 'تم تحديث المفضلة');
        loadPets(1, true);
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل في تحديث المفضلة');
    }
    // loadPets is defined in scope and closes over state used only on reset,
    // so omitting it from deps keeps the callback identity stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAdvancedFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (petType !== 'all') {
    activeAdvancedFilters.push({
      key: 'type',
      label: petType === 'dogs' ? 'كلاب' : 'قطط',
      onRemove: () => setPetType('all'),
    });
  }
  if (genderFilter !== 'all') {
    activeAdvancedFilters.push({
      key: 'gender',
      label: genderFilter === 'male' ? 'ذكور' : 'إناث',
      onRemove: () => setGenderFilter('all'),
    });
  }
  if (ageFilter !== 'all') {
    activeAdvancedFilters.push({
      key: 'age',
      label: AGE_RANGES[ageFilter].label,
      onRemove: () => setAgeFilter('all'),
    });
  }
  if (hostPreference !== 'all') {
    activeAdvancedFilters.push({
      key: 'host',
      label: HOSTING_LABELS[hostPreference] || 'تفضيل الاستضافة',
      onRemove: () => setHostPreference('all'),
    });
  }
  if (appliedLocation) {
    activeAdvancedFilters.push({
      key: 'location',
      label: `الموقع: ${appliedLocation}`,
      onRemove: () => setAppliedLocation(''),
    });
  }

  const renderPetCard = useCallback(
    ({ item }: { item: DisplayPet }) => (
      <PetCard
        pet={item}
        onPressDetails={openPetDetails}
        onPressBreeding={openBreedingRequest}
        onToggleFavorite={toggleFavorite}
      />
    ),
    [openPetDetails, openBreedingRequest, toggleFavorite],
  );

  const renderFooter = useCallback(() => {
    if (isPaginating) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#02B7B4" />
        </View>
      );
    }
    if (paginationError) {
      return (
        <View style={styles.footerLoader}>
          <Text style={styles.paginationErrorText}>تعذر تحميل المزيد</Text>
          <TouchableOpacity
            style={styles.paginationRetryButton}
            onPress={handleRetryPagination}
          >
            <Text style={styles.paginationRetryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }, [isPaginating, paginationError, handleRetryPagination]);

  useEffect(() => {
    if (hasRestoredRef.current || userHasScrolledRef.current) return;
    if (shouldRestoreScroll && savedScrollPosition !== null && !selectedPetId && !breedingPetId) {
      const handle = InteractionManager.runAfterInteractions(() => {
        if (listRef.current) {
          listRef.current.scrollToOffset({ offset: savedScrollPosition, animated: false });
        }
        hasRestoredRef.current = true;
        setShouldRestoreScroll(false);
      });

      return () => handle.cancel();
    }
  }, [shouldRestoreScroll, savedScrollPosition, selectedPetId, breedingPetId]);

  // Handle initial search query from navigation
  useEffect(() => {
    if (initialSearchQuery && initialSearchQuery !== searchQuery) {
      setSearchQuery(initialSearchQuery);
      setAppliedSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  const headerTopInset = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;
  const filtersPaddingTop = HEADER_BASE_PADDING + headerTopInset;
  const listBottomSafePadding = getFloatingTabBarContentPadding(insets.bottom, 8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={[styles.filtersContainer, { paddingTop: filtersPaddingTop }]}>
          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <View style={styles.searchIcon}>
                <AppIcon name="search" size={15} color="#8aa0b3" />
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="ابحث بالاسم أو السلالة"
                placeholderTextColor="#95a5a6"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                onSubmitEditing={applySearch}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setAppliedSearch(''); }}>
                  <Text style={styles.clearIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.filterMini, activeFilterCount > 0 && styles.filterMiniActive]}
              onPress={handleOpenAdvanced}
            >
              <View style={styles.filterMiniIcon}>
                <AppIcon name="sliders" size={16} color="#1c344d" />
              </View>
              {activeFilterCount > 0 ? (
                <View style={styles.filterMiniBadge}><Text style={styles.filterMiniBadgeText}>{activeFilterCount}</Text></View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nearbyMini, closestFirst && styles.nearbyMiniActive]}
              onPress={() => setClosestFirst(v => !v)}
            >
              <View style={styles.nearbyMiniText}>
                <AppIcon
                  name="location"
                  size={16}
                  color={closestFirst ? '#fff' : '#1c344d'}
                />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.quickFiltersRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={styles.segmentedGroup}>
                {PET_TYPE_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={`seg-type-${option.id}`}
                    style={[
                      styles.segmentedOption,
                      petType === option.id && styles.segmentedOptionActive,
                    ]}
                    onPress={() => setPetType(option.id)}>
                    <Text
                      style={[
                        styles.segmentedText,
                        petType === option.id && styles.segmentedTextActive,
                      ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {GENDER_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={`seg-gender-${option.id}`}
                    style={[
                      styles.segmentedOption,
                      genderFilter === option.id && styles.segmentedOptionActive,
                    ]}
                    onPress={() => setGenderFilter(option.id)}>
                    <Text
                      style={[
                        styles.segmentedText,
                        genderFilter === option.id && styles.segmentedTextActive,
                      ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {/* Nearby toggle moved to compact header row */}
          </View>

          {activeAdvancedFilters.length > 0 ? (
            <View style={styles.tagsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {activeAdvancedFilters.map(tag => (
                  <Tag key={tag.key} label={tag.label} onRemove={tag.onRemove} />
                ))}
                <TouchableOpacity style={styles.clearAllTag} onPress={clearAllFilters}>
                  <Text style={styles.clearAllTagText}>مسح الكل</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ) : null}
        </View>

        <FlatList
          ref={listRef}
          data={displayPets}
          renderItem={renderPetCard}
          keyExtractor={item => item.id.toString()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[
            displayPets.length === 0 ? styles.emptyListContainer : styles.listContainer,
            { paddingBottom: listBottomSafePadding },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={event => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            userHasScrolledRef.current = true;
          }}
          scrollEventThrottle={16}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          onContentSizeChange={() => {
            if (!listRef.current) return;
            if (hasRestoredRef.current || userHasScrolledRef.current) return;
            const target =
              shouldRestoreScroll && savedScrollPosition !== null
                ? savedScrollPosition
                : PETS_LIST_HAS_PERSISTED
                  ? PETS_LIST_PERSISTED_OFFSET
                  : null;
            if (target !== null) {
              listRef.current.scrollToOffset({ offset: target, animated: false });
              hasRestoredRef.current = true;
              setShouldRestoreScroll(false);
            }
          }}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>لا توجد نتائج</Text>
                <Text style={styles.emptyStateSubtitle}>
                  قم بتعديل الفلاتر للحصول على نتائج أدق.
                </Text>
              </View>
            ) : null
          }
        />

        <Modal
          visible={advancedVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setAdvancedVisible(false)}>
          <View style={styles.modalContainer}>
            <TouchableWithoutFeedback onPress={() => setAdvancedVisible(false)}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>الفلاتر المتقدمة</Text>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>نوع الحيوان</Text>
                <View style={styles.modalChipsRow}>
                  {PET_TYPE_OPTIONS.map(option => (
                    <Chip
                      key={`adv-type-${option.id}`}
                      label={option.label}
                      active={draftPetType === option.id}
                      onPress={() => setDraftPetType(option.id)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>العمر</Text>
                <View style={styles.modalChipsRow}>
                  {AGE_OPTIONS.map(option => (
                    <Chip
                      key={option.id}
                      label={option.label}
                      active={draftAge === option.id}
                      onPress={() => setDraftAge(option.id)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>تفضيل الاستضافة</Text>
                <View style={styles.modalChipsRow}>
                  {HOSTING_OPTIONS.map(option => (
                    <Chip
                      key={option.id}
                      label={option.label}
                      active={draftHosting === option.id}
                      onPress={() => setDraftHosting(option.id)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>البحث بالموقع</Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="مثال: القاهرة، المهندسين"
                  placeholderTextColor="#95a5a6"
                  value={draftLocation}
                  onChangeText={setDraftLocation}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.resetButton} onPress={handleResetAdvanced}>
                  <Text style={styles.resetButtonText}>إعادة تعيين</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyButton} onPress={handleApplyAdvanced}>
                  <Text style={styles.applyButtonText}>تطبيق</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Pet Details as full-screen modal to keep list mounted */}
        <Modal
          visible={!!selectedPetId}
          animationType="slide"
          onRequestClose={() => setSelectedPetId(null)}>
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {selectedPetId ? (
              <PetDetailsScreen petId={selectedPetId} onClose={() => setSelectedPetId(null)} onAddPet={showAddPetScreen} />
            ) : null}
          </View>
        </Modal>

        {/* Breeding Request as full-screen modal to keep list mounted */}
        <Modal
          visible={!!breedingPetId}
          animationType="slide"
          onRequestClose={closeBreedingRequest}>
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {breedingPetId ? (
              <BreedingRequestScreen
                petId={breedingPetId}
                onClose={closeBreedingRequest}
                onAddPet={showAddPetScreen}
                onOpenPetDetails={petIdFromModal => {
                  // Close breeding modal and open details modal of the other pet
                  setBreedingPetId(null);
                  // Small delay to allow modal closing animation to finish
                  setTimeout(() => {
                    setSelectedPetId(petIdFromModal);
                  }, 150);
                }}
              />
            ) : null}
          </View>
        </Modal>

        {/* Add Pet as full-screen modal */}
        <Modal
          visible={showAddPet}
          animationType="slide"
          onRequestClose={() => {}}>
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {showAddPet ? (
              <AddPetScreen onClose={hideAddPetScreen} onPetCreated={handlePetCreated} />
            ) : null}
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  container: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5edf4',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchIcon: {
    width: 18,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearIcon: { fontSize: 14, color: '#8aa0b3', marginLeft: 6 },
  searchInput: { flex: 1, fontSize: 14, color: '#1c344d', padding: 0 },
  filterMini: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterMiniActive: { borderColor: '#02B7B4' },
  filterMiniIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterMiniBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#02B7B4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterMiniBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  nearbyMini: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyMiniActive: { backgroundColor: '#02B7B4', borderColor: '#02B7B4' },
  nearbyMiniText: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyPill: {
    backgroundColor: '#f4f7fb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    marginStart: 10,
  },
  nearbyPillActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  nearbyPillText: {
    color: '#1c344d',
    fontWeight: '700',
    fontSize: 12,
  },
  nearbyPillTextActive: {
    color: '#fff',
  },
  quickFiltersRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segmentedGroup: {
    flexDirection: 'row',
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    overflow: 'hidden',
  },
  segmentedOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#e1e8f0',
  },
  segmentedOptionActive: {
    backgroundColor: '#02B7B4',
  },
  segmentedText: {
    color: '#485568',
    fontWeight: '600',
  },
  segmentedTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f4f7fb',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipDivider: {
    width: 1,
    backgroundColor: '#e1e8f0',
    marginHorizontal: 6,
    alignSelf: 'stretch',
  },
  chipActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  chipText: {
    color: '#485568',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  advancedButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#1c344d',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  advancedButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  listContainer: {
    padding: 16,
  },
  emptyListContainer: {
    padding: 32,
  },
  petCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  petTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  timePill: {
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#d0d7ff',
  },
  timePillText: {
    color: '#5b6bcf',
    fontSize: 10,
    fontWeight: '600',
  },
  petImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#e6ebf2',
  },
  imageWrap: {
    position: 'relative',
  },
  distancePill: {
    position: 'absolute',
    top: 10,
    left: 10,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(2,183,180,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  distancePillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  distancePillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceNear: {
    backgroundColor: 'rgba(46, 204, 113, 0.95)', // green
  },
  distanceMid: {
    backgroundColor: 'rgba(255, 193, 7, 0.95)', // amber
  },
  distanceFar: {
    backgroundColor: 'rgba(229, 57, 53, 0.95)', // red
  },
  verifiedPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(46, 204, 113, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  verifiedPillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  verifiedPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  petInfo: {
    padding: 16,
  },
  petHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  petName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c344d',
    flex: 1,
  },
  favoriteIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petBreed: {
    color: '#5f6c7b',
    marginTop: 6,
    marginBottom: 4,
  },
  petLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  petLocationText: {
    color: '#7b8896',
    fontSize: 13,
    flex: 1,
  },
  petDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  petDetailBadge: {
    backgroundColor: '#f4f7fb',
    color: '#1c344d',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  petDescription: {
    color: '#5f6c7b',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  petActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d7dce5',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 10,
  },
  secondaryButtonText: {
    color: '#1c344d',
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#02B7B4',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  paginationErrorText: {
    color: '#8a4a4a',
    fontSize: 13,
    marginBottom: 8,
  },
  paginationRetryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#02B7B4',
  },
  paginationRetryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c344d',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    color: '#5f6c7b',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c344d',
    marginBottom: 16,
  },
  modalSection: {
    marginBottom: 18,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c344d',
    marginBottom: 10,
  },
  modalChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalTextInput: {
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1c344d',
    borderWidth: 1,
    borderColor: '#e1e8f0',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dce5',
  },
  resetButtonText: {
    color: '#1c344d',
    fontWeight: '600',
  },
  applyButton: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#02B7B4',
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  tagsRow: {
    marginTop: 10,
    paddingVertical: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f7fb',
    borderWidth: 1,
    borderColor: '#e1e8f0',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginEnd: 8,
  },
  tagText: {
    color: '#1c344d',
    fontWeight: '600',
  },
  tagRemoveButton: {
    marginStart: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9eef5',
  },
  tagRemoveText: {
    color: '#1c344d',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  clearAllTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffecec',
    borderWidth: 1,
    borderColor: '#ffc9c9',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  clearAllTagText: {
    color: '#c0392b',
    fontWeight: '700',
  },
});

export default PetsScreen;
