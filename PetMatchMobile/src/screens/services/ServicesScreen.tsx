import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiService, Clinic } from '../../services/api';
import {
  ServiceCategoryKey,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_EMOJI,
  HOME_FEATURED_CATEGORIES,
} from '../../utils/serviceCategories';
import { distanceKm, formatDistanceLabel } from '../../utils/formatters';
import { useProfileLocation } from '../../hooks/useProfileLocation';
import { ServiceRow, ClinicSummary, ServiceItem } from './components/ServiceRow';
import ServiceBookingScreen from '../clinics/ServiceBookingScreen';
import ClinicDetailsScreen from '../clinics/ClinicDetailsScreen';
import { getFloatingTabBarContentPadding } from '../../utils/tabBarLayout';
import AppIcon from '../../components/icons/AppIcon';

interface ServicesScreenProps {
  initialCategory?: ServiceCategoryKey;
  onClose: () => void;
}

type ServiceRowEntry = {
  key: string;
  clinic: ClinicSummary & {
    phone?: string;
    whatsapp?: string;
    workingHours?: string;
    address?: string;
    city?: string;
    email?: string;
    isActive?: boolean;
    distanceValue?: number;
    latitude?: number;
    longitude?: number;
  };
  service: ServiceItem;
};

// Module-level storefront cache. Lives for the app's lifetime; trimmed by
// inserting a created-at timestamp and skipping entries older than the TTL
// when reading. Keeps the services flow snappy when bouncing between
// categories or re-entering the screen.
const STOREFRONT_TTL_MS = 5 * 60 * 1000;
const storefrontCache = new Map<number, { services: any[]; clinic: any; ts: number }>();

const fetchStorefrontCached = async (clinicId: number): Promise<{ services: any[]; clinic: any } | null> => {
  const cached = storefrontCache.get(clinicId);
  const now = Date.now();
  if (cached && now - cached.ts < STOREFRONT_TTL_MS) {
    return { services: cached.services, clinic: cached.clinic };
  }
  const res = await apiService.getClinicStorefront(clinicId);
  if (!res.success || !res.data) return null;
  const services = Array.isArray(res.data.services) ? res.data.services : [];
  const clinicPayload = res.data.clinic || {};
  storefrontCache.set(clinicId, { services, clinic: clinicPayload, ts: now });
  return { services, clinic: clinicPayload };
};

const normalizeNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const trimOrUndef = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
};

const buildClinicSummary = (
  clinic: Clinic,
  storefrontClinic: any,
  userLocation: { lat: number; lng: number } | null,
): ServiceRowEntry['clinic'] => {
  const lat = normalizeNumber(clinic.latitude) ?? normalizeNumber(storefrontClinic?.latitude) ?? undefined;
  const lng = normalizeNumber(clinic.longitude) ?? normalizeNumber(storefrontClinic?.longitude) ?? undefined;
  const km = (lat !== undefined && lng !== undefined)
    ? distanceKm(lat, lng, userLocation)
    : null;
  const distanceLabel = trimOrUndef(clinic.distance_display) ?? (km !== null ? formatDistanceLabel(km) ?? undefined : undefined);
  return {
    id: typeof clinic.id === 'number' ? clinic.id : Number(clinic.id || 0),
    name: trimOrUndef(clinic.name) || trimOrUndef(storefrontClinic?.name) || 'عيادة بيطرية',
    logoUrl: trimOrUndef(clinic.logo) || trimOrUndef(clinic.logo_url),
    accentColor: trimOrUndef(clinic.storefront_primary_color) || trimOrUndef(storefrontClinic?.storefront_primary_color),
    distanceLabel,
    distanceValue: km !== null ? km : undefined,
    workingHours: trimOrUndef(clinic.working_hours) || trimOrUndef(storefrontClinic?.opening_hours),
    phone: trimOrUndef(clinic.phone) || trimOrUndef(storefrontClinic?.phone),
    whatsapp: trimOrUndef(storefrontClinic?.whatsapp),
    address: trimOrUndef(clinic.address) || trimOrUndef(storefrontClinic?.address),
    city: trimOrUndef(clinic.city),
    email: trimOrUndef(clinic.email) || trimOrUndef(storefrontClinic?.email),
    isActive: typeof clinic.is_active === 'boolean' ? clinic.is_active : true,
    latitude: lat,
    longitude: lng,
  };
};

const mapServiceEntry = (raw: any): ServiceItem => ({
  id: String(raw.id ?? ''),
  name: trimOrUndef(raw.name) || 'خدمة',
  description: trimOrUndef(raw.description),
  category: trimOrUndef(raw.category),
  basePrice: normalizeNumber(raw.base_price) ?? 0,
  priceRange: trimOrUndef(raw.price_range),
  pricingUnit: trimOrUndef(raw.pricing_unit) || 'per_visit',
  durationMinutes: normalizeNumber(raw.duration_minutes) ?? undefined,
  minDurationUnits: normalizeNumber(raw.min_duration_units),
});

interface CategoryChipProps {
  category: ServiceCategoryKey;
  active: boolean;
  onPress: (category: ServiceCategoryKey) => void;
}

const CategoryChip = memo<CategoryChipProps>(({ category, active, onPress }) => {
  const handlePress = useCallback(() => onPress(category), [onPress, category]);
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={styles.chipEmoji}>{SERVICE_CATEGORY_EMOJI[category]}</Text>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{SERVICE_CATEGORY_LABELS[category]}</Text>
    </TouchableOpacity>
  );
});
CategoryChip.displayName = 'CategoryChip';

const PAGE_SIZE = 12;

const ServicesScreen: React.FC<ServicesScreenProps> = ({ initialCategory, onClose }) => {
  const insets = useSafeAreaInsets();
  const { userLocation } = useProfileLocation();

  const [activeCategory, setActiveCategory] = useState<ServiceCategoryKey>(initialCategory || HOME_FEATURED_CATEGORIES[0]);
  const [rows, setRows] = useState<ServiceRowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaginating, setIsPaginating] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const isPaginatingRef = useRef(false);
  const pageRef = useRef(1);
  const requestVersionRef = useRef(0);

  const [bookingTarget, setBookingTarget] = useState<{
    clinic: ServiceRowEntry['clinic'];
    service: ServiceItem;
  } | null>(null);
  const [detailsClinic, setDetailsClinic] = useState<ServiceRowEntry['clinic'] | null>(null);

  const loadCategory = useCallback(
    async (category: ServiceCategoryKey, pageNum: number, reset: boolean) => {
      if (isPaginatingRef.current && !reset) return;
      const requestVersion = ++requestVersionRef.current;

      try {
        if (reset) {
          setLoading(true);
          setErrorMessage(null);
          setRows([]);
          setHasMore(true);
          setPaginationError(false);
          pageRef.current = 1;
        } else {
          isPaginatingRef.current = true;
          setIsPaginating(true);
          setPaginationError(false);
        }

        const clinicsResp = await apiService.getClinics({
          serviceCategory: category,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        if (requestVersion !== requestVersionRef.current) return;
        if (!clinicsResp.success || !clinicsResp.data) {
          if (reset) setErrorMessage('تعذر تحميل الخدمات. حاول مرة أخرى.');
          else setPaginationError(true);
          return;
        }

        const data = clinicsResp.data as Clinic[] | { results: Clinic[]; next?: string | null };
        const clinicList: Clinic[] = Array.isArray(data) ? data : data.results || [];
        const nextLink = !Array.isArray(data) ? (data.next ?? null) : null;

        // Fan out: fetch storefronts for each clinic in parallel; cached
        // entries return immediately. Failed storefronts are skipped silently.
        const storefronts = await Promise.all(
          clinicList.map(async c => {
            const id = typeof c.id === 'number' ? c.id : Number(c.id || 0);
            if (!id) return null;
            try {
              return await fetchStorefrontCached(id);
            } catch {
              return null;
            }
          }),
        );
        if (requestVersion !== requestVersionRef.current) return;

        const newRows: ServiceRowEntry[] = [];
        clinicList.forEach((clinic, idx) => {
          const sf = storefronts[idx];
          if (!sf) return;
          const summary = buildClinicSummary(clinic, sf.clinic, userLocation ?? null);
          sf.services
            .filter(raw => {
              if (raw?.is_active === false) return false;
              const cat = trimOrUndef(raw?.category);
              return cat === category;
            })
            .forEach(raw => {
              const service = mapServiceEntry(raw);
              newRows.push({
                key: `${summary.id}-${service.id}`,
                clinic: summary,
                service,
              });
            });
        });

        // Sort: distance asc (clinics with no distance fall to the end),
        // then price asc within the same clinic.
        newRows.sort((a, b) => {
          const da = a.clinic.distanceValue ?? Number.POSITIVE_INFINITY;
          const db = b.clinic.distanceValue ?? Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
          return (a.service.basePrice || 0) - (b.service.basePrice || 0);
        });

        setRows(prev => (reset ? newRows : [...prev, ...newRows]));
        setHasMore(!!nextLink);
        if (!reset) {
          pageRef.current = pageNum;
        }
      } catch (err) {
        if (requestVersion !== requestVersionRef.current) return;
        console.error('Error loading services:', err);
        if (reset) setErrorMessage('حدث خطأ في الاتصال. حاول مرة أخرى.');
        else setPaginationError(true);
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setLoading(false);
          setIsPaginating(false);
          isPaginatingRef.current = false;
        }
      }
    },
    [userLocation],
  );

  useEffect(() => {
    loadCategory(activeCategory, 1, true);
  }, [activeCategory, loadCategory]);

  const handleSelectCategory = useCallback((cat: ServiceCategoryKey) => {
    setActiveCategory(cat);
  }, []);

  const handleEndReached = useCallback(() => {
    if (!hasMore || loading || isPaginatingRef.current || paginationError) return;
    loadCategory(activeCategory, pageRef.current + 1, false);
  }, [hasMore, loading, paginationError, activeCategory, loadCategory]);

  const handleRetryPagination = useCallback(() => {
    if (isPaginatingRef.current) return;
    loadCategory(activeCategory, pageRef.current + 1, false);
  }, [activeCategory, loadCategory]);

  const handleBook = useCallback(
    (clinicId: number, serviceId: string | number) => {
      const row = rows.find(r => r.clinic.id === clinicId && r.service.id === serviceId);
      if (row) setBookingTarget({ clinic: row.clinic, service: row.service });
    },
    [rows],
  );

  const handleOpenClinic = useCallback(
    (clinicId: number) => {
      const row = rows.find(r => r.clinic.id === clinicId);
      if (row) setDetailsClinic(row.clinic);
    },
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.service.name.toLowerCase().includes(q) ||
        r.clinic.name.toLowerCase().includes(q) ||
        (r.service.description && r.service.description.toLowerCase().includes(q)),
    );
  }, [rows, searchQuery]);

  const renderRow = useCallback(
    ({ item }: { item: ServiceRowEntry }) => (
      <ServiceRow
        clinic={item.clinic}
        service={item.service}
        onBook={handleBook}
        onOpenClinic={handleOpenClinic}
      />
    ),
    [handleBook, handleOpenClinic],
  );

  // Sub-screen modal pattern (matches the rest of the app — see HomeScreen).
  if (bookingTarget) {
    return (
      <ServiceBookingScreen
        clinic={bookingTarget.clinic}
        service={bookingTarget.service}
        onClose={() => setBookingTarget(null)}
      />
    );
  }
  if (detailsClinic) {
    return (
      <ClinicDetailsScreen
        clinic={{
          id: detailsClinic.id,
          name: detailsClinic.name,
          address: detailsClinic.address,
          city: detailsClinic.city,
          phone: detailsClinic.phone,
          email: detailsClinic.email,
          workingHours: detailsClinic.workingHours,
          isActive: detailsClinic.isActive,
          distanceLabel: detailsClinic.distanceLabel,
          distanceValue: detailsClinic.distanceValue,
          accentColor: detailsClinic.accentColor,
          logoUrl: detailsClinic.logoUrl,
          latitude: detailsClinic.latitude,
          longitude: detailsClinic.longitude,
        }}
        onClose={() => setDetailsClinic(null)}
      />
    );
  }

  const headerTopInset = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : insets.top;
  const listBottomPadding = getFloatingTabBarContentPadding(insets.bottom, 12);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTopInset + 12 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.backButton} accessibilityRole="button" accessibilityLabel="رجوع">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>الخدمات</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.searchBox}>
          <View style={styles.searchIcon}>
            <AppIcon name="search" size={15} color="#8aa0b3" />
          </View>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="ابحث عن خدمة..."
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.chipBar}>
        <FlatList
          horizontal
          data={HOME_FEATURED_CATEGORIES}
          keyExtractor={item => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBarContent}
          renderItem={({ item }) => (
            <CategoryChip category={item} active={item === activeCategory} onPress={handleSelectCategory} />
          )}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#02B7B4" />
          <Text style={styles.loaderText}>جاري تحميل الخدمات...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.loaderWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadCategory(activeCategory, 1, true)}
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          renderItem={renderRow}
          keyExtractor={item => item.key}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>لا توجد خدمات في هذه الفئة قريبة منك</Text>
              <Text style={styles.emptyText}>جرّب فئة أخرى من الأعلى أو وسّع منطقة البحث.</Text>
            </View>
          }
          ListFooterComponent={
            isPaginating ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#02B7B4" />
              </View>
            ) : paginationError ? (
              <View style={styles.footerLoader}>
                <Text style={styles.errorText}>تعذر تحميل المزيد</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetryPagination}>
                  <Text style={styles.retryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

export default ServicesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5edf4',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f4f7fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 20, color: '#1c344d', fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  headerSpacer: { width: 40 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe7ef',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchIcon: { width: 18, marginEnd: 6, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, fontSize: 14, color: '#1c344d', padding: 0 },
  clearIcon: { fontSize: 14, color: '#8aa0b3', marginStart: 6 },

  chipBar: { backgroundColor: '#fff', paddingVertical: 10 },
  chipBarContent: { paddingHorizontal: 12, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f4f7fb',
    borderWidth: 1,
    borderColor: '#e1e8f0',
  },
  chipActive: { backgroundColor: '#02B7B4', borderColor: '#02B7B4' },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#3e5366' },
  chipTextActive: { color: '#fff' },

  listContent: { padding: 16 },

  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loaderText: { color: '#5f6c7b', marginTop: 12 },
  errorText: { color: '#8a4a4a', fontSize: 14, marginBottom: 8, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#02B7B4',
  },
  retryText: { color: '#fff', fontWeight: '700' },
  emptyWrap: { paddingTop: 40, paddingHorizontal: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1c344d', marginBottom: 6, textAlign: 'center' },
  emptyText: { fontSize: 13, color: '#5f6c7b', textAlign: 'center', lineHeight: 20 },
  footerLoader: { paddingVertical: 18, alignItems: 'center' },
});
