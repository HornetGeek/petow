import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
  InteractionManager,
} from 'react-native';
import { apiService, Pet } from '../../services/api';
import PetDetailsScreen from './PetDetailsScreen';
import BreedingRequestScreen from '../breeding-request/BreedingRequestScreen';

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

const PetsScreen: React.FC<PetsScreenProps> = ({ initialSearchQuery }) => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [breedingPetId, setBreedingPetId] = useState<number | null>(null);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null);
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);
  const listRef = useRef<FlatList<Pet> | null>(null);
  const scrollOffsetRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const userHasScrolledRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [appliedSearch, setAppliedSearch] = useState(initialSearchQuery || '');
  const [appliedLocation, setAppliedLocation] = useState('');

  const [petType, setPetType] = useState<'all' | 'dogs' | 'cats'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [ageFilter, setAgeFilter] = useState<typeof AGE_OPTIONS[number]['id']>('all');
  const [hostPreference, setHostPreference] = useState<HostingOptionId>('all');

  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [draftAge, setDraftAge] = useState<typeof AGE_OPTIONS[number]['id']>('all');
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

  useEffect(() => {
    loadPets(1, true);
  }, [petType, appliedSearch, appliedLocation]);

  const loadPets = async (pageNum = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setHasMore(true);
        if (pageNum === 1) {
          setPets([]);
          setPage(1);
        }
      }

      const response = await apiService.getPets({
        search: appliedSearch || undefined,
        pet_type: petType === 'all' ? undefined : petType,
        page: pageNum,
        ordering: '-created_at',
        page_size: 12,
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
        }
      }
    } catch (error) {
      console.error('Error loading pets:', error);
      Alert.alert('خطأ', 'فشل في تحميل الحيوانات');
    } finally {
      setLoading(false);
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
      const target = (shouldRestoreScroll && savedScrollPosition !== null)
        ? savedScrollPosition
        : (PETS_LIST_HAS_PERSISTED ? PETS_LIST_PERSISTED_OFFSET : null);
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

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPets(nextPage, false);
    }
  };

  const applySearch = () => {
    setAppliedSearch(searchQuery.trim());
  };

  const parseAgeToMonths = (value?: string | null): number | null => {
  if (!value) return null;
  const normalized = value.replace(/٠/g, '0').replace(/١/g, '1').replace(/٢/g, '2').replace(/٣/g, '3').replace(/٤/g, '4').replace(/٥/g, '5').replace(/٦/g, '6').replace(/٧/g, '7').replace(/٨/g, '8').replace(/٩/g, '9');
  const yearsMatch = normalized.match(/(\d+)\s*سنة/);
  const monthsMatch = normalized.match(/(\d+)\s*شهر/);
  let total = 0;
  if (yearsMatch) total += parseInt(yearsMatch[1], 10) * 12;
  if (monthsMatch) total += parseInt(monthsMatch[1], 10);
  if (!total) {
    const genericMatch = normalized.match(/(\d+)/);
    if (genericMatch) {
      total += parseInt(genericMatch[1], 10);
    }
  }
  return total || null;
};

const filteredPets = useMemo(() => {
    return pets.filter((pet) => {
      if (genderFilter !== 'all') {
        const g = genderFilter === 'male' ? 'M' : 'F';
        if (pet.gender !== g) return false;
      }

      if (ageFilter !== 'all') {
        const range = AGE_RANGES[ageFilter];
        const months = typeof pet.age_months === 'number' ? pet.age_months : parseAgeToMonths(pet.age_display);
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

  const handleOpenAdvanced = () => {
    setDraftAge(ageFilter);
    setDraftHosting(hostPreference);
    setDraftLocation(appliedLocation);
    setAdvancedVisible(true);
  };

  const handleApplyAdvanced = () => {
    setAgeFilter(draftAge);
    setHostPreference(draftHosting);
    setAppliedLocation(draftLocation.trim());
    setAdvancedVisible(false);
  };

  const handleResetAdvanced = () => {
    setDraftAge('all');
    setDraftHosting('all');
    setDraftLocation('');
  };

  const captureScrollPosition = () => {
    setSavedScrollPosition(scrollOffsetRef.current);
    setShouldRestoreScroll(true);
  };

  const openPetDetails = (petId: number) => {
    captureScrollPosition();
    setSelectedPetId(petId);
  };

  const openBreedingRequest = (petId: number) => {
    captureScrollPosition();
    setBreedingPetId(petId);
  };

  const closeBreedingRequest = () => {
    setBreedingPetId(null);
  };

  const toggleFavorite = async (petId: number) => {
    try {
      const response = await apiService.toggleFavorite(petId);
      if (response.success) {
        Alert.alert('نجح', 'تم تحديث المفضلة');
        loadPets(1, true);
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل في تحديث المفضلة');
    }
  };

  const hostingLabels: Record<string, string> = {
    my_place: 'استضافة عندي',
    other_place: 'استضافة لدى الطرف الآخر',
    both: 'كلا المكانين',
    flexible: 'مرن',
  };
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
      label: hostingLabels[hostPreference] || 'تفضيل الاستضافة',
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



  const renderPetCard = ({ item: pet }: { item: Pet }) => {
    const imageUrl = pet.main_image?.replace('http://', 'https://') ||
      'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=300&q=80';

    const hostingLabel = hostingLabels[(pet as any).hosting_preference as string] || undefined;
    
    // Extract first line of description
    const firstLineDescription = pet.description 
      ? pet.description.split(/\r?\n/)[0].trim() 
      : '';

    return (
      <TouchableOpacity style={styles.petCard} onPress={() => openPetDetails(pet.id)}>
        <Image source={{ uri: imageUrl }} style={styles.petImage} />
        <View style={styles.petInfo}>
          <View style={styles.petHeader}>
            <Text style={styles.petName}>{pet.name}</Text>
            <TouchableOpacity onPress={() => toggleFavorite(pet.id)}>
              <Text style={styles.favoriteIcon}>❤️</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.petBreed}>{pet.breed_name}</Text>
          <PetLocationDisplay pet={pet} />
          <View style={styles.petDetailsRow}>
            <Text style={styles.petDetailBadge}>{pet.gender_display}</Text>
            <Text style={styles.petDetailBadge}>{pet.age_display}</Text>
            <Text style={styles.petDetailBadge}>{pet.pet_type_display}</Text>
            {hostingLabel ? (
              <Text style={styles.petDetailBadge}>{hostingLabel}</Text>
            ) : null}
          </View>
          {firstLineDescription ? (
            <Text style={styles.petDescription} numberOfLines={1} ellipsizeMode="tail">
              {firstLineDescription}
            </Text>
          ) : null}
          <View style={styles.petActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => openPetDetails(pet.id)}
            >
              <Text style={styles.secondaryButtonText}>عرض التفاصيل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => openBreedingRequest(pet.id)}
            >
              <Text style={styles.primaryButtonText}>طلب تزاوج</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#02B7B4" />
      </View>
    );
  };

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

  return (
    <View style={styles.container}>
      <View style={styles.filtersContainer}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث بالاسم أو السلالة"
            placeholderTextColor="#95a5a6"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={applySearch}
          />
          <TouchableOpacity style={styles.searchButton} onPress={applySearch}>
            <Text style={styles.searchButtonText}>بحث</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filtersPill} onPress={handleOpenAdvanced}>
            <Text style={styles.filtersPillText}>فلاتر</Text>
            {activeFilterCount > 0 ? (
              <View style={styles.filtersPillBadge}>
                <Text style={styles.filtersPillBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.quickFiltersRow}>
          <View style={styles.segmentedGroup}>
            {PET_TYPE_OPTIONS.map(option => (
              <TouchableOpacity
                key={`seg-type-${option.id}`}
                style={[styles.segmentedOption, petType === option.id && styles.segmentedOptionActive]}
                onPress={() => setPetType(option.id)}
              >
                <Text style={[styles.segmentedText, petType === option.id && styles.segmentedTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.segmentedGroup, { marginTop: 10 }]}>
            {GENDER_OPTIONS.map(option => (
              <TouchableOpacity
                key={`seg-gender-${option.id}`}
                style={[styles.segmentedOption, genderFilter === option.id && styles.segmentedOptionActive]}
                onPress={() => setGenderFilter(option.id)}
              >
                <Text style={[styles.segmentedText, genderFilter === option.id && styles.segmentedTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {activeAdvancedFilters.length > 0 ? (
          <View style={styles.tagsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {activeAdvancedFilters.map((tag) => (
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
        data={filteredPets}
        renderItem={renderPetCard}
        keyExtractor={(item) => item.id.toString()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={filteredPets.length === 0 ? styles.emptyListContainer : styles.listContainer}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          userHasScrolledRef.current = true;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (!listRef.current) return;
          if (hasRestoredRef.current || userHasScrolledRef.current) return;
          const target = (shouldRestoreScroll && savedScrollPosition !== null)
            ? savedScrollPosition
            : (PETS_LIST_HAS_PERSISTED ? PETS_LIST_PERSISTED_OFFSET : null);
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
              <Text style={styles.emptyStateSubtitle}>قم بتعديل الفلاتر للحصول على نتائج أدق.</Text>
            </View>
          ) : null
        }
      />

      <Modal
        visible={advancedVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAdvancedVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={() => setAdvancedVisible(false)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>الفلاتر المتقدمة</Text>

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
        onRequestClose={() => setSelectedPetId(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {selectedPetId ? (
            <PetDetailsScreen
              petId={selectedPetId}
              onClose={() => setSelectedPetId(null)}
            />
          ) : null}
        </View>
      </Modal>

      {/* Breeding Request as full-screen modal to keep list mounted */}
      <Modal
        visible={!!breedingPetId}
        animationType="slide"
        onRequestClose={closeBreedingRequest}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {breedingPetId ? (
            <BreedingRequestScreen
              petId={breedingPetId}
              onClose={closeBreedingRequest}
              onOpenPetDetails={(petIdFromModal) => {
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
    </View>
  );
};

// Simple in-memory cache to avoid repeated reverse geocoding
const reverseGeocodeCache = new Map<string, string>();

const PetLocationDisplay: React.FC<{ pet: Pet }> = ({ pet }) => {
  const [address, setAddress] = useState<string>(pet.location || 'غير محدد');
  const [loading, setLoading] = useState(false);
  const savedRef = useRef(false);

  const getAddressFromCoordinates = async (lat: number, lng: number): Promise<string> => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = reverseGeocodeCache.get(key);
    if (cached) return cached;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=ar,en`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': 'PetMatchMobile/1.0 (contact@petmatch.com)',
            'Accept': 'application/json',
          },
        }
      );

      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const full = data?.display_name as string | undefined;
      if (full && full.length) {
        // Show full address instead of truncating to first 3 parts
        const value = full;
        reverseGeocodeCache.set(key, value);
        return value;
      }

      // No display_name
      return 'العنوان غير متاح';
    } catch {
      // On error, do not show raw coordinates
      return reverseGeocodeCache.get(`${lat.toFixed(5)},${lng.toFixed(5)}`) || 'العنوان غير متاح';
    }
  };

  useEffect(() => {
    const processLocation = async () => {
      // If location is a normal text (not coords), use it and skip network
      if (pet.location && !/^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$/.test(pet.location) && !pet.latitude && !pet.longitude) {
        setAddress(pet.location);
        return;
      }
      // Otherwise, if we have lat/lng, reverse-geocode
      if (pet.latitude && pet.longitude) {
        setLoading(true);
        const addr = await getAddressFromCoordinates(Number(pet.latitude), Number(pet.longitude));
        setAddress(addr);
        if (!savedRef.current && pet.id) {
          savedRef.current = true;
          apiService.updatePetLocationIfNeeded(pet.id, pet.location, addr);
        }
        setLoading(false);
        return;
      }
      // If location looks like coords, reverse-geocode
      const m = pet.location?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        setLoading(true);
        const addr = await getAddressFromCoordinates(parseFloat(m[1]), parseFloat(m[2]));
        setAddress(addr);
        if (!savedRef.current && pet.id) {
          savedRef.current = true;
          apiService.updatePetLocationIfNeeded(pet.id, pet.location, addr);
        }
        setLoading(false);
        return;
      }
      setAddress(pet.location || 'غير محدد');
    };
    processLocation();
  }, [pet.latitude, pet.longitude, pet.location]);

  return (
    <Text style={styles.petLocation}>
      📍 {loading ? 'جاري التحميل...' : address}
    </Text>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1c344d',
    borderWidth: 1,
    borderColor: '#e1e8f0',
  },
  searchButton: {
    marginLeft: 10,
    backgroundColor: '#02B7B4',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  filtersPill: {
    marginLeft: 10,
    backgroundColor: '#f4f7fb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtersPillText: {
    color: '#1c344d',
    fontWeight: '700',
  },
  filtersPillBadge: {
    marginLeft: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#02B7B4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filtersPillBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  quickFiltersRow: {
    marginTop: 14,
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
  petImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#e6ebf2',
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
    fontSize: 20,
  },
  petBreed: {
    color: '#5f6c7b',
    marginTop: 6,
    marginBottom: 4,
  },
  petLocation: {
    color: '#7b8896',
    fontSize: 13,
    marginBottom: 12,
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
    marginRight: 8,
  },
  tagText: {
    color: '#1c344d',
    fontWeight: '600',
  },
  tagRemoveButton: {
    marginLeft: 6,
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
