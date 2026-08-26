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
let ADOPTION_PETS_LIST_PERSISTED_OFFSET = 0;
let ADOPTION_PETS_LIST_HAS_PERSISTED = false;

interface AdoptionPetsScreenProps {
  initialSearchQuery?: string;
  onClose?: () => void;
}

const HEADER_BASE_PADDING = 16;

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

interface PetCardProps {
  pet: DisplayPet;
  isFav: boolean;
  onPress: (petId: number) => void;
  onToggleFavorite: (petId: number) => void;
}

// Memoized card so parent re-renders (scroll, filter unrelated state) don't
// force every visible grid item to re-render. Props are referentially stable
// per-pet because the parent precomputes the decorated list.
const PetCard = memo<PetCardProps>(({ pet, isFav, onPress, onToggleFavorite }) => {
  const priceDisplay = pet.is_free ? 'مجاناً' : pet.price_display || undefined;
  const genderLabel =
    pet.gender_display ||
    (pet.gender === 'M' ? 'ذكر' : pet.gender === 'F' ? 'أنثى' : '');
  const detailsLine = [
    pet.pet_type_display,
    pet.breed_name || 'غير محدد',
    genderLabel,
  ]
    .filter(Boolean)
    .join(' • ');
  const distanceLabel = pet._distanceLabel;
  const km = pet._distanceKm;
  const distanceStyle =
    km != null
      ? km < 5
        ? styles.distanceNear
        : km < 20
          ? styles.distanceMid
          : styles.distanceFar
      : styles.distanceMid;

  return (
    <TouchableOpacity style={styles.petCard} onPress={() => onPress(pet.id)}>
      <View style={styles.imageWrap}>
        <FastImage
          source={{ uri: normalizeImageUrl(pet.main_image), priority: FastImage.priority.normal }}
          style={styles.petImage}
          resizeMode={FastImage.resizeMode.cover}
        />
        <View style={styles.imageGradient} />
        <TouchableOpacity
          onPress={() => onToggleFavorite(pet.id)}
          style={[styles.favFloating, isFav && styles.favButtonActive]}
        >
          <View style={styles.favFloatingIcon}>
            <AppIcon
              name="heart"
              size={16}
              color={isFav ? '#e91e63' : '#1c344d'}
              filled={isFav}
            />
          </View>
        </TouchableOpacity>
        {distanceLabel ? (
          <View style={[styles.distancePill, distanceStyle]}>
            <View style={styles.distancePillContent}>
              <AppIcon name="location" size={13} color="#fff" />
              <Text style={styles.distancePillText}>{distanceLabel}</Text>
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
        {priceDisplay ? (
          <View style={[styles.pricePill, pet.is_free ? styles.pricePillFree : styles.pricePillPaid]}>
            <Text style={styles.pricePillText}>{priceDisplay}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.petInfo}>
        <View style={styles.petHeader}>
          <Text style={styles.petName} numberOfLines={1}>
            {pet.name}
          </Text>
          {pet.created_at ? (
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>{timeAgo(pet.created_at)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.petDetails} numberOfLines={1}>
          {detailsLine}
        </Text>
        <Text style={styles.petAge}>{pet.age_display}</Text>
        <View style={styles.petLocation}>
          <AppIcon name="location" size={14} color="#02B7B4" />
          <Text style={styles.petLocationText} numberOfLines={1}>
            {pet.location || 'الموقع غير محدد'}
          </Text>
        </View>
        <View style={styles.adoptionBadge}>
          <Text style={styles.adoptionBadgeText}>متاح للتبني</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
PetCard.displayName = 'PetCard';

const AdoptionPetsScreen: React.FC<AdoptionPetsScreenProps> = ({ initialSearchQuery, onClose }) => {
  const insets = useSafeAreaInsets();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaginating, setIsPaginating] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null);
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);
  const listRef = useRef<FlatList<DisplayPet> | null>(null);
  const scrollOffsetRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const userHasScrolledRef = useRef(false);
  // Synchronous guards for pagination so concurrent onEndReached fires can't
  // both pass the !isPaginating check before React state updates land.
  const pageRef = useRef(1);
  const isPaginatingRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [appliedSearch, setAppliedSearch] = useState(initialSearchQuery || '');
  const [appliedLocation, setAppliedLocation] = useState('');

  const [petType, setPetType] = useState<'all' | 'dogs' | 'cats'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [ageFilter, setAgeFilter] = useState<(typeof AGE_OPTIONS)[number]['id']>('all');

  const [favoriteMap, setFavoriteMap] = useState<Record<number, boolean>>({});
  const [closestFirst, setClosestFirst] = useState(true);
  const { userLocation, isReady: profileReady } = useProfileLocation();

  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [draftPetType, setDraftPetType] =
    useState<(typeof PET_TYPE_OPTIONS)[number]['id']>('all');
  const [draftAge, setDraftAge] = useState<(typeof AGE_OPTIONS)[number]['id']>('all');
  const [draftLocation, setDraftLocation] = useState('');

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (petType !== 'all') count += 1;
    if (genderFilter !== 'all') count += 1;
    if (ageFilter !== 'all') count += 1;
    if (appliedLocation) count += 1;
    return count;
  }, [petType, genderFilter, ageFilter, appliedLocation]);

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

      if (appliedLocation) {
        if (!pet.location || !pet.location.toLowerCase().includes(appliedLocation.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [pets, genderFilter, ageFilter, appliedLocation]);

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

  useEffect(() => {
    if (!profileReady) return;
    loadPets(1, true);
  }, [petType, appliedSearch, appliedLocation, closestFirst, userLocation, profileReady]);

  const loadPets = async (pageNum = 1, reset = false) => {
    if (isPaginatingRef.current && !reset) return; // avoid overlapping page fetches

    try {
      if (reset) {
        setLoading(true);
        setHasMore(true);
        if (pageNum === 1) {
          setPets([]);
          setPage(1);
          pageRef.current = 1;
        }
        ADOPTION_PETS_LIST_PERSISTED_OFFSET = 0;
        ADOPTION_PETS_LIST_HAS_PERSISTED = false;
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

      const range = AGE_RANGES[ageFilter];
      const minAge = typeof range?.min === 'number' ? range.min : undefined;
      const maxAge = typeof range?.max === 'number' ? range.max : undefined;

      if (closestFirst && userLocation) {
        const response = await apiService.getPets({
          search: appliedSearch || undefined,
          pet_type: petType === 'all' ? undefined : petType,
          status: 'available_for_adoption',
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
          status: 'available_for_adoption', // Only adoption pets
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
      console.error('Error loading adoption pets:', error);
      if (reset) {
        Alert.alert('خطأ', 'فشل في تحميل الحيوانات المتاحة للتبني');
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
    setAppliedLocation('');
    setSearchQuery('');
    setAppliedSearch('');
    loadPets(1, true);
  }, []);

  // Persist scroll position on unmount
  useEffect(() => {
    return () => {
      if (typeof scrollOffsetRef.current === 'number') {
        ADOPTION_PETS_LIST_PERSISTED_OFFSET = scrollOffsetRef.current;
        ADOPTION_PETS_LIST_HAS_PERSISTED = true;
      }
    };
  }, []);

  // Restore scroll position when returning from pet details
  useEffect(() => {
    if (hasRestoredRef.current || userHasScrolledRef.current) return;
    if (shouldRestoreScroll && savedScrollPosition !== null && !selectedPetId) {
      const handle = InteractionManager.runAfterInteractions(() => {
        if (listRef.current) {
          listRef.current.scrollToOffset({ offset: savedScrollPosition, animated: false });
        }
        hasRestoredRef.current = true;
        setShouldRestoreScroll(false);
      });

      return () => handle.cancel();
    }
  }, [shouldRestoreScroll, savedScrollPosition, selectedPetId]);

  const handleScroll = useCallback((event: any) => {
    const offset = event.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = offset;
    userHasScrolledRef.current = true;
  }, []);

  const handleEndReached = useCallback(() => {
    // Don't auto-retry after a pagination failure — wait for the user to tap
    // the retry button in the footer so we don't hammer a failing endpoint.
    // loadPets owns the isPaginatingRef guard; we just gate on its current
    // value here so two rapid onEndReached fires collapse into one fetch.
    if (!hasMore || loading || isPaginatingRef.current || paginationError) return;
    loadPets(pageRef.current + 1, false);
  }, [hasMore, loading, paginationError]);

  const handleRetryPagination = useCallback(() => {
    if (isPaginatingRef.current) return;
    loadPets(pageRef.current + 1, false);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPets(1, true).finally(() => setRefreshing(false));
  }, []);

  const handlePetPress = useCallback((petId: number) => {
    setSavedScrollPosition(scrollOffsetRef.current);
    setShouldRestoreScroll(true);
    setSelectedPetId(petId);
  }, []);

  const handleClosePetDetails = useCallback(() => {
    setSelectedPetId(null);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    setAppliedSearch(searchQuery);
  }, [searchQuery]);

  const handleAdvancedFilter = useCallback(() => {
    setDraftPetType(petType);
    setDraftAge(ageFilter);
    setDraftLocation(appliedLocation);
    setAdvancedVisible(true);
  }, [petType, ageFilter, appliedLocation]);

  const handleApplyAdvancedFilter = useCallback(() => {
    setPetType(draftPetType);
    setAgeFilter(draftAge);
    setAppliedLocation(draftLocation);
    setAdvancedVisible(false);
    loadPets(1, true);
  }, [draftPetType, draftAge, draftLocation]);

  const handleCancelAdvancedFilter = useCallback(() => {
    setDraftPetType(petType);
    setDraftAge(ageFilter);
    setDraftLocation(appliedLocation);
    setAdvancedVisible(false);
  }, [petType, ageFilter, appliedLocation]);

  const removeFilter = useCallback((type: string) => {
    switch (type) {
      case 'location':
        setAppliedLocation('');
        break;
      default:
        break;
    }
    loadPets(1, true);
  }, []);

  const toggleFavorite = useCallback(async (petId: number) => {
    try {
      const response = await apiService.toggleFavorite(petId);
      const data = response.data;
      if (response.success && data) {
        setFavoriteMap(prev => ({ ...prev, [petId]: data.is_favorite }));
      }
    } catch (e) {
      // Best-effort; ignore errors
    }
  }, []);

  const renderPet = useCallback(
    ({ item }: { item: DisplayPet }) => (
      <PetCard
        pet={item}
        isFav={favoriteMap[item.id] === true}
        onPress={handlePetPress}
        onToggleFavorite={toggleFavorite}
      />
    ),
    [favoriteMap, handlePetPress, toggleFavorite],
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <AppIcon name="paw" size={34} color="#02B7B4" />
      </View>
      <Text style={styles.emptyTitle}>لا توجد حيوانات متاحة للتبني</Text>
      <Text style={styles.emptyText}>
        لم يتم العثور على حيوانات متاحة للتبني حالياً. جرب تغيير الفلاتر أو ابحث في منطقة أخرى.
      </Text>
    </View>
  );

  const renderAdvancedFilterModal = () => (
    <Modal visible={advancedVisible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>فلاتر متقدمة</Text>
          <TouchableOpacity onPress={handleCancelAdvancedFilter} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>نوع الحيوان</Text>
            <View style={styles.chipContainer}>
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

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>العمر</Text>
            <View style={styles.chipContainer}>
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

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>الموقع</Text>
            <TextInput
              style={styles.locationInput}
              value={draftLocation}
              onChangeText={setDraftLocation}
              placeholder="ابحث في مدينة أو منطقة معينة"
              placeholderTextColor="#999"
            />
          </View>
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelAdvancedFilter}>
            <Text style={styles.cancelButtonText}>إلغاء</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyButton} onPress={handleApplyAdvancedFilter}>
            <Text style={styles.applyButtonText}>تطبيق</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const headerTopInset = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;
  const filtersPaddingTop = HEADER_BASE_PADDING + headerTopInset;
  const listBottomSafePadding = getFloatingTabBarContentPadding(insets.bottom, 8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={[styles.filtersContainer, { paddingTop: filtersPaddingTop }]}>
          {onClose ? (
            <View style={styles.backRow}>
              <TouchableOpacity onPress={onClose} style={styles.backButton}>
                <Text style={styles.backButtonText}>←</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <View style={styles.searchIcon}>
                <AppIcon name="search" size={15} color="#8aa0b3" />
              </View>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="ابحث عن حيوان للتبني..."
                placeholderTextColor="#99a1a8"
                onSubmitEditing={handleSearchSubmit}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setAppliedSearch(''); }}>
                  <Text style={styles.clearIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.filterMini, activeFilterCount > 0 && styles.filterMiniActive]}
              onPress={handleAdvancedFilter}
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipListContent}>
            <View style={styles.chipRow}>
              {PET_TYPE_OPTIONS.map(option => (
                <Chip
                  key={`type-${option.id}`}
                  label={option.label}
                  active={petType === option.id}
                  onPress={() => setPetType(option.id)}
                />
              ))}
              {GENDER_OPTIONS.map(option => (
                <Chip
                  key={option.id}
                  label={option.label}
                  active={genderFilter === option.id}
                  onPress={() => setGenderFilter(option.id)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {activeFilterCount > 0 ? (
          <View style={styles.activeFiltersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.activeFilters}>
                {appliedLocation && (
                  <Tag
                    label={`الموقع: ${appliedLocation}`}
                    onRemove={() => removeFilter('location')}
                  />
                )}
                {ageFilter !== 'all' && (
                  <Tag
                    label={`عمر: ${AGE_RANGES[ageFilter].label}`}
                    onRemove={() => setAgeFilter('all')}
                  />
                )}
                <TouchableOpacity onPress={clearAllFilters} style={styles.clearAllButton}>
                  <Text style={styles.clearAllText}>مسح الكل</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={displayPets}
          renderItem={renderPet}
          keyExtractor={item => item.id.toString()}
          numColumns={2}
          contentContainerStyle={[styles.listContainer, { paddingBottom: listBottomSafePadding }]}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          onContentSizeChange={() => {
            if (!listRef.current) return;
            if (hasRestoredRef.current || userHasScrolledRef.current) return;
            const target =
              shouldRestoreScroll && savedScrollPosition !== null
                ? savedScrollPosition
                : ADOPTION_PETS_LIST_HAS_PERSISTED
                  ? ADOPTION_PETS_LIST_PERSISTED_OFFSET
                  : null;
            if (target !== null) {
              listRef.current.scrollToOffset({ offset: target, animated: false });
              hasRestoredRef.current = true;
              setShouldRestoreScroll(false);
            }
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#02B7B4']}
            />
          }
          ListEmptyComponent={!loading ? renderEmptyState : null}
          ListFooterComponent={
            isPaginating ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#02B7B4" />
              </View>
            ) : paginationError ? (
              <View style={styles.loadingFooter}>
                <Text style={styles.paginationErrorText}>تعذر تحميل المزيد</Text>
                <TouchableOpacity
                  style={styles.paginationRetryButton}
                  onPress={handleRetryPagination}
                >
                  <Text style={styles.paginationRetryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />

        {renderAdvancedFilterModal()}

        {/* Pet Details as full-screen modal to keep list mounted */}
        <Modal
          visible={!!selectedPetId}
          animationType="slide"
          onRequestClose={handleClosePetDetails}>
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {selectedPetId ? (
              <PetDetailsScreen petId={selectedPetId} onClose={handleClosePetDetails} />
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
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5edf4',
  },
  backRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  backButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#f0f4f7',
  },
  backButtonText: {
    fontSize: 16,
    color: '#1c344d',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe7ef',
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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1c344d',
    padding: 0,
  },
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
    marginStart: 10,
    backgroundColor: '#f4f7fb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e1e8f0',
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
  chipListContent: {
    paddingTop: 16,
    paddingHorizontal: 4,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#eef5f4',
    borderWidth: 1,
    borderColor: '#d5deea',
    marginEnd: 8,
  },
  chipActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  chipText: {
    fontSize: 13,
    color: '#3e5366',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  activeFiltersContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5edf4',
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f8f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#02B7B4',
    marginEnd: 8,
    marginBottom: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#02B7B4',
    marginStart: 6,
    fontWeight: '600',
  },
  tagRemoveButton: {
    marginStart: 4,
  },
  tagRemoveText: {
    fontSize: 16,
    color: '#02B7B4',
    fontWeight: '700',
  },
  clearAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ff6b6b',
    marginBottom: 6,
  },
  clearAllText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  petCard: {
    flex: 1,
    margin: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  petImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  petHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
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
  verifiedPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(46, 204, 113, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
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
    padding: 12,
  },
  petName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c344d',
  },
  petDetails: {
    marginTop: 4,
    fontSize: 13,
    color: '#5c6f80',
  },
  petAge: {
    marginTop: 6,
    fontSize: 13,
    color: '#5c6f80',
  },
  petLocation: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  petLocationText: {
    fontSize: 12,
    color: '#5c6f80',
  },
  adoptionBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adoptionBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingFooter: {
    padding: 20,
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
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
  modalContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  locationInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  applyButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#02B7B4',
    alignItems: 'center',
    marginStart: 12,
  },
  applyButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  // New UI/UX styles for cards
  imageWrap: {
    position: 'relative',
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  distancePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  distanceNear: { backgroundColor: 'rgba(46, 204, 113, 0.95)' },
  distanceMid: { backgroundColor: 'rgba(255, 193, 7, 0.95)' },
  distanceFar: { backgroundColor: 'rgba(229, 57, 53, 0.95)' },
  favButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3f7',
  },
  favButtonActive: {
    backgroundColor: '#ffe5ea',
  },
  favIcon: {
    color: '#1c344d',
    fontSize: 14,
  },
  favIconActive: {
    color: '#e91e63',
    fontWeight: '700',
  },
  favFloating: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  favFloatingIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricePill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pricePillFree: {
    backgroundColor: 'rgba(67,160,71,0.95)',
  },
  pricePillPaid: {
    backgroundColor: 'rgba(25,118,210,0.95)',
  },
  pricePillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default AdoptionPetsScreen;
