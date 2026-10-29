import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Platform,
  BackHandler,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Modal,
  Share,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
} from 'react-native';
import { apiService, PaginatedResponse, Pet } from '../../services/api';
import MapViewComponent from '../../components/MapView';
import { useAuth } from '../../contexts/AuthContext';
import AddPetScreen from '../pets/AddPetScreen';
import ServiceBookingScreen from './ServiceBookingScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveMediaUrl } from '../../utils/mediaUrl';

type StorefrontClinic = {
  id: number | string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  workingHours?: string;
  description?: string;
  storefrontPrimaryColor?: string | null;
  openingHours?: string;
  latitude?: number;
  longitude?: number;
};

type ClinicProduct = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  image?: string;
  images?: string[];
  isActive: boolean;
  stockQuantity?: number;
};

type ClinicService = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  priceRange?: string;
  pricingUnit?: string;
  minDurationUnits?: number | null;
  durationMinutes?: number;
  isActive: boolean;
};

type ClinicDetailsScreenProps = {
  clinic: {
    id: number;
    name: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
    workingHours?: string;
    isActive?: boolean;
    distanceLabel?: string;
    distanceValue?: number;
    accentColor?: string;
    logoUrl?: string;
    latitude?: number;
    longitude?: number;
  };
  onClose: () => void;
};

const DEFAULT_ACCENT = '#0EA5A4';
const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?q=80&w=400&auto=format&fit=crop';
const DEFAULT_CLINIC_LOGO = 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png'; // Generic Vet Icon
const PRODUCT_DETAILS_IMAGE_WIDTH = Dimensions.get('window').width - 40;
const CART_STORAGE_PREFIX = 'clinic_cart_v1';
const CART_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRICING_UNIT_LABELS: Record<string, string> = {
  per_visit: 'للزيارة',
  per_session: 'للجلسة',
  per_hour: 'للساعة',
  per_day: 'لليوم',
  per_night: 'لليلة',
};

type PersistedClinicCart = {
  items: Record<string, number>;
  updated_at: number;
};

const getCartStorageKey = (userId: number | string | null | undefined, clinicId: number | string) => {
  return `${CART_STORAGE_PREFIX}:user:${userId ?? 'anon'}:clinic:${clinicId}`;
};

const sanitizeCartItems = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, number> = {};

  Object.entries(value as Record<string, unknown>).forEach(([productId, rawQty]) => {
    const parsedQty = typeof rawQty === 'number' ? rawQty : typeof rawQty === 'string' ? Number(rawQty) : NaN;
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) return;
    output[productId] = Math.floor(parsedQty);
  });

  return output;
};

const parsePersistedCart = (rawValue: string | null): { items: Record<string, number>; shouldClear: boolean } => {
  if (!rawValue) {
    return { items: {}, shouldClear: false };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedClinicCart> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { items: {}, shouldClear: true };
    }

    const updatedAt = Number(parsed.updated_at);
    if (!Number.isFinite(updatedAt)) {
      return { items: {}, shouldClear: true };
    }

    if (Date.now() - updatedAt > CART_STORAGE_TTL_MS) {
      return { items: {}, shouldClear: true };
    }

    const items = sanitizeCartItems(parsed.items);
    if (!Object.keys(items).length) {
      return { items: {}, shouldClear: true };
    }

    return { items, shouldClear: false };
  } catch {
    return { items: {}, shouldClear: true };
  }
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  return '';
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

const formatDateForDisplay = (value: string) => {
  if (!value) return 'اختر التاريخ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTimeForDisplay = (value: string) => {
  if (!value) return 'اختر الوقت';
  return value;
};

const getPricingUnitLabel = (unit?: string) => {
  if (!unit) return '';
  return PRICING_UNIT_LABELS[unit] || unit;
};

const buildServicePrice = (service: ClinicService) => {
  const priceText = service.priceRange ? `${service.priceRange} ج.م` : `${service.basePrice} ج.م`;
  const unitLabel = getPricingUnitLabel(service.pricingUnit);
  return {
    priceText,
    unitLabel,
    displayText: unitLabel ? `${priceText} / ${unitLabel}` : priceText,
  };
};

const buildServiceMinDuration = (service: ClinicService, unitLabel: string) => {
  if (!service.minDurationUnits) return '';
  const unitText = unitLabel || 'وحدة';
  return `الحد الأدنى: ${service.minDurationUnits} ${unitText}`;
};

const getImageUrl = (value?: string | null) => {
  return resolveMediaUrl(value, DEFAULT_PRODUCT_IMAGE);
};

const getProductImageCandidates = (product?: ClinicProduct | null): string[] => {
  if (!product) return [DEFAULT_PRODUCT_IMAGE];
  const raw = [product.image, ...(product.images || [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  const deduped = Array.from(new Set(raw));
  return deduped.length ? deduped : [DEFAULT_PRODUCT_IMAGE];
};

const mapProduct = (item: Record<string, unknown>): ClinicProduct => {
  const images = Array.isArray(item.images) ? (item.images as string[]) : [];
  const imageCandidate = typeof item.image === 'string' ? item.image : images[0];
  return {
    id: String(item.id ?? ''),
    name: normalizeString(item.name) || 'منتج',
    description: normalizeString(item.description) || undefined,
    category: normalizeString(item.category) || undefined,
    price: normalizeNumber(item.price) || 0,
    image: typeof imageCandidate === 'string' ? imageCandidate : undefined,
    images,
    isActive: typeof item.is_active === 'boolean' ? item.is_active : true,
    stockQuantity: normalizeNumber(item.stock_quantity) ?? undefined,
  };
};

const mapService = (item: Record<string, unknown>): ClinicService => {
  const minDuration = normalizeNumber(item.min_duration_units);
  return {
    id: String(item.id ?? ''),
    name: normalizeString(item.name) || 'خدمة',
    description: normalizeString(item.description) || undefined,
    category: normalizeString(item.category) || undefined,
    basePrice: normalizeNumber(item.base_price) || 0,
    priceRange: normalizeString(item.price_range) || undefined,
    pricingUnit: normalizeString(item.pricing_unit) || 'per_visit',
    minDurationUnits: minDuration && minDuration > 0 ? minDuration : null,
    durationMinutes: normalizeNumber(item.duration_minutes) || undefined,
    isActive: typeof item.is_active === 'boolean' ? item.is_active : true,
  };
};

const ClinicDetailsScreen: React.FC<ClinicDetailsScreenProps> = ({ clinic, onClose }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const bookingFooterPaddingBottom = 16 + safeBottom;
  const cartBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 56 : 28);
  const cartFooterPaddingBottom = 32 + cartBottomInset;
  const checkoutBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 56 : 28);
  const checkoutFooterPaddingBottom = 32 + checkoutBottomInset;
  const productDetailsBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 24);
  const productDetailsFooterPaddingBottom = 36 + productDetailsBottomInset;
  const stickyFooterPaddingBottom = 10 + safeBottom;
  const heroTopPadding = Math.max(insets.top, 12);
  const detailsScrollBottomPadding = 120 + safeBottom;
  const toastBottomOffset = 96 + safeBottom;
  const [storefront, setStorefront] = useState<StorefrontClinic | null>(null);
  const [products, setProducts] = useState<ClinicProduct[]>([]);
  const [services, setServices] = useState<ClinicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'products'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [screenMode, setScreenMode] = useState<'details' | 'cart' | 'checkout' | 'booking' | 'productDetails'>('details');
  // The legacy in-place 'booking' screen mode is being phased out — bookings
  // now open the standalone ServiceBookingScreen as a sub-screen. The mode
  // is kept in the type union for any code paths that haven't migrated yet.
  const [externalBookingService, setExternalBookingService] = useState<ClinicService | null>(null);
  const [bookingService, setBookingService] = useState<ClinicService | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ClinicProduct | null>(null);
  const [productDetailsQty, setProductDetailsQty] = useState(1);
  const [productImageIndex, setProductImageIndex] = useState(0);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [orderReference, setOrderReference] = useState<string | null>(null);
  const [bookingReference, setBookingReference] = useState<string | null>(null);
  const [orderWhatsappUrl, setOrderWhatsappUrl] = useState<string | null>(null);
  const [bookingWhatsappUrl, setBookingWhatsappUrl] = useState<string | null>(null);
  const [serviceDetails, setServiceDetails] = useState<ClinicService | null>(null);
  const [serviceDetailsVisible, setServiceDetailsVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDay, setTempDay] = useState(1);
  const [tempMonth, setTempMonth] = useState(1);
  const [tempYear, setTempYear] = useState(new Date().getFullYear());
  const [tempHour, setTempHour] = useState(12);
  const [tempMinute, setTempMinute] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTabSetRef = useRef(false);
  const isCartHydratingRef = useRef(false);
  const [orderForm, setOrderForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  const [bookingForm, setBookingForm] = useState({
    name: '',
    phone: '',
    email: '',
    preferredDate: '',
    preferredTime: '',
    notes: '',
  });
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);
  const [petsError, setPetsError] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [showAddPet, setShowAddPet] = useState(false);
  const cartStorageKey = useMemo(() => getCartStorageKey(user?.id, clinic.id), [user?.id, clinic.id]);

  const effectiveAccent = useMemo(() => {
    if (storefront?.storefrontPrimaryColor) return storefront.storefrontPrimaryColor;
    if (clinic.accentColor) return clinic.accentColor;
    return DEFAULT_ACCENT;
  }, [clinic.accentColor, storefront]);

  const profileName = useMemo(() => {
    if (!user) return '';
    if (user.full_name) return user.full_name.trim();
    const combined = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return combined;
  }, [user]);
  const profilePhone = user?.phone?.trim() || '';
  const profileEmail = user?.email?.trim() || '';
  const profileAddress = user?.address?.trim() || '';

  const selectedPet = useMemo(() => {
    if (!selectedPetId) return null;
    return myPets.find((pet) => pet.id === selectedPetId) || null;
  }, [myPets, selectedPetId]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    isCartHydratingRef.current = true;
    setCart({});

    const hydrateCart = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(cartStorageKey);
        const { items, shouldClear } = parsePersistedCart(rawValue);

        if (shouldClear) {
          await AsyncStorage.removeItem(cartStorageKey);
        }

        if (!isMounted) return;
        setCart(items);
      } catch (storageError) {
        console.warn('Failed to restore clinic cart', storageError);
        if (isMounted) {
          setCart({});
        }
      } finally {
        if (isMounted) {
          isCartHydratingRef.current = false;
        }
      }
    };

    hydrateCart();

    return () => {
      isMounted = false;
      isCartHydratingRef.current = false;
    };
  }, [cartStorageKey]);

  useEffect(() => {
    let isMounted = true;
    initialTabSetRef.current = false;
    const loadStorefront = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const response = await apiService.getClinicStorefront(clinic.id);
        const payload = response.success ? response.data : null;

        const clinicPayload = payload?.clinic || {};
        const productList = Array.isArray(payload?.products) ? payload.products : [];
        const serviceList = Array.isArray(payload?.services) ? payload.services : [];

        if (!isMounted) return;

        setStorefront({
          id: clinicPayload.id ?? clinic.id,
          name: normalizeString(clinicPayload.name) || clinic.name,
          phone: normalizeString(clinicPayload.phone) || clinic.phone,
          whatsapp: normalizeString(clinicPayload.whatsapp),
          email: normalizeString(clinicPayload.email) || clinic.email,
          address: normalizeString(clinicPayload.address) || clinic.address,
          workingHours: normalizeString(clinicPayload.opening_hours) || clinic.workingHours,
          description: normalizeString(clinicPayload.description) || undefined,
          storefrontPrimaryColor: normalizeHexColor(clinicPayload.storefront_primary_color),
          latitude: normalizeNumber(clinicPayload.latitude) || clinic.latitude,
          longitude: normalizeNumber(clinicPayload.longitude) || clinic.longitude,
        });

        setProducts(productList.map(mapProduct));
        setServices(serviceList.map(mapService));

        // Default to services if overview is empty but we stick to 'overview' for now
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage('تعذر تحميل تفاصيل العيادة بالكامل.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStorefront();
    return () => { isMounted = false; };
  }, [clinic]);

  const loadMyPets = useCallback(async () => {
    try {
      setPetsLoading(true);
      setPetsError(null);

      const response = await apiService.getMyPets();
      if (!response.success) {
        setPetsError('تعذر تحميل الحيوانات.');
        setMyPets([]);
        setSelectedPetId(null);
        return;
      }

      const responseData = response.data;
      let petsList: Pet[] = [];

      if (responseData) {
        if (Array.isArray((responseData as PaginatedResponse<Pet>).results)) {
          petsList = (responseData as PaginatedResponse<Pet>).results;
        } else if (Array.isArray(responseData)) {
          petsList = responseData as Pet[];
        }
      }

      setMyPets(petsList);
      if (petsList.length) {
        setSelectedPetId((prev) => {
          if (prev && petsList.some((pet) => pet.id === prev)) return prev;
          return petsList[0].id;
        });
      } else {
        setSelectedPetId(null);
      }
    } catch (error) {
      setPetsError('تعذر تحميل الحيوانات.');
      setMyPets([]);
      setSelectedPetId(null);
    } finally {
      setPetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screenMode === 'booking') {
      loadMyPets();
    }
  }, [screenMode, loadMyPets]);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return services.filter((service) => {
      if (!service.isActive) return false;
      if (!query) return true;
      return `${service.name} ${service.description || ''} ${service.category || ''}`.toLowerCase().includes(query);
    });
  }, [services, searchQuery]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      if (!product.isActive) return false;
      if (!query) return true;
      return `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase().includes(query);
    });
  }, [products, searchQuery]);

  const activeServices = useMemo(() => {
    return services.filter((service) => service.isActive);
  }, [services]);
  const hasActiveServices = activeServices.length > 0;
  const hasActiveProducts = useMemo(() => {
    return products.some((product) => product.isActive);
  }, [products]);
  const showTabs = hasActiveServices && hasActiveProducts;
  const bookingPriceInfo = bookingService ? buildServicePrice(bookingService) : null;
  const bookingMinDurationText = bookingService && bookingPriceInfo
    ? buildServiceMinDuration(bookingService, bookingPriceInfo.unitLabel)
    : '';
  const serviceDetailsPriceInfo = serviceDetails ? buildServicePrice(serviceDetails) : null;
  const serviceDetailsMinDurationText = serviceDetails && serviceDetailsPriceInfo
    ? buildServiceMinDuration(serviceDetails, serviceDetailsPriceInfo.unitLabel)
    : '';

  useEffect(() => {
    if (loading || initialTabSetRef.current) return;
    if (hasActiveServices) {
      setActiveTab('services');
    } else if (hasActiveProducts) {
      setActiveTab('products');
    } else {
      setActiveTab('overview');
    }
    initialTabSetRef.current = true;
  }, [loading, hasActiveServices, hasActiveProducts]);

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month, 0).getDate();
  };

  const generateDays = () => {
    const daysInMonth = getDaysInMonth(tempMonth, tempYear);
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  };

  const generateMonths = () => {
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return arabicMonths.map((name, index) => ({ value: index + 1, label: name }));
  };

  const generateYears = () => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 2 }, (_, i) => currentYear + i);
  };

  const generateHours = () => {
    return Array.from({ length: 24 }, (_, i) => i);
  };

  const generateMinutes = () => {
    return Array.from({ length: 12 }, (_, i) => i * 5);
  };

  useEffect(() => {
    const daysInMonth = getDaysInMonth(tempMonth, tempYear);
    if (tempDay > daysInMonth) {
      setTempDay(daysInMonth);
    }
  }, [tempMonth, tempYear]);

  const mapLocation = useMemo(() => {
    const lat = storefront?.latitude ?? clinic.latitude;
    const lon = storefront?.longitude ?? clinic.longitude;
    if (typeof lat === 'number' && Number.isFinite(lat) && typeof lon === 'number' && Number.isFinite(lon)) {
      return { lat, lng: lon };
    }
    return null;
  }, [storefront?.latitude, storefront?.longitude, clinic.latitude, clinic.longitude]);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 2000);
  };

  const addToCart = (productId: string, qty: number = 1) => {
    const safeQty = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + safeQty,
    }));
  };

  const updateCartItem = (productId: string, delta: number) => {
    setCart(prev => {
      const nextQty = (prev[productId] || 0) + delta;
      if (nextQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: nextQty };
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  useEffect(() => {
    if (isCartHydratingRef.current) return;

    const persistCart = async () => {
      try {
        const sanitizedItems = sanitizeCartItems(cart);
        if (!Object.keys(sanitizedItems).length) {
          await AsyncStorage.removeItem(cartStorageKey);
          return;
        }

        const payload: PersistedClinicCart = {
          items: sanitizedItems,
          updated_at: Date.now(),
        };

        await AsyncStorage.setItem(cartStorageKey, JSON.stringify(payload));
      } catch (storageError) {
        console.warn('Failed to persist clinic cart', storageError);
      }
    };

    persistCart();
  }, [cart, cartStorageKey]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([productId, qty]) => {
        const product = products.find(item => item.id === productId);
        if (!product) return null;
        return { product, qty };
      })
      .filter(Boolean) as Array<{ product: ClinicProduct; qty: number }>;
  }, [cart, products]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + (Number(item.product.price) || 0) * item.qty, 0);
  }, [cartItems]);

  const totalItems = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.qty, 0);
  }, [cartItems]);

  const openCheckout = () => {
    if (!cartItems.length) return;
    setOrderSubmitted(false);
    setOrderError(null);
    setOrderReference(null);
    setOrderWhatsappUrl(null);
    setOrderForm({
      name: profileName,
      phone: profilePhone,
      email: profileEmail,
      address: profileAddress,
      notes: '',
    });
    setScreenMode('checkout');
  };

  const openProductDetails = (product: ClinicProduct) => {
    setSelectedProduct(product);
    setProductDetailsQty(1);
    setProductImageIndex(0);
    setScreenMode('productDetails');
  };

  const closeProductDetails = () => {
    setSelectedProduct(null);
    setProductDetailsQty(1);
    setProductImageIndex(0);
    setScreenMode('details');
  };

  const incrementProductDetailsQty = () => {
    if (!selectedProduct) return;
    const stock = typeof selectedProduct.stockQuantity === 'number' ? selectedProduct.stockQuantity : null;
    setProductDetailsQty((prev) => {
      if (stock !== null && stock > 0) {
        return Math.min(prev + 1, stock);
      }
      return prev + 1;
    });
  };

  const decrementProductDetailsQty = () => {
    setProductDetailsQty((prev) => Math.max(1, prev - 1));
  };

  const addSelectedProductToCart = () => {
    if (!selectedProduct) return;
    const isOutOfStock = selectedProduct.stockQuantity === 0;
    if (isOutOfStock) return;
    const currentQty = cart[selectedProduct.id] || 0;
    addToCart(selectedProduct.id, productDetailsQty);
    showToast(currentQty > 0 ? 'تمت زيادة الكمية في السلة' : 'تمت الإضافة، يمكنك إتمام الطلب من السلة');
    setProductDetailsQty(1);
  };

  const goToCartFromProductDetails = () => {
    setScreenMode('cart');
  };

  useEffect(() => {
    if (screenMode !== 'productDetails' || !selectedProduct) return;
    const latestProduct = products.find((item) => item.id === selectedProduct.id);
    if (!latestProduct) {
      setSelectedProduct(null);
      setProductDetailsQty(1);
      setProductImageIndex(0);
      setScreenMode('details');
      return;
    }
    if (latestProduct !== selectedProduct) {
      setSelectedProduct(latestProduct);
    }
    const stock = typeof latestProduct.stockQuantity === 'number' ? latestProduct.stockQuantity : null;
    if (stock !== null && stock > 0 && productDetailsQty > stock) {
      setProductDetailsQty(stock);
    }
  }, [products, screenMode, selectedProduct, productDetailsQty]);

  const openServiceDetails = (service: ClinicService) => {
    setServiceDetails(service);
    setServiceDetailsVisible(true);
  };

  const closeServiceDetails = () => {
    setServiceDetailsVisible(false);
    setServiceDetails(null);
  };

  const openBooking = (service?: ClinicService) => {
    setServiceDetailsVisible(false);
    setServiceDetails(null);
    if (!service) {
      showToast('اختر الخدمة أولاً');
      return;
    }
    // Route to the standalone ServiceBookingScreen (calendar + slots) rather
    // than the legacy in-place screenMode='booking' wheel-picker flow.
    setExternalBookingService(service);
  };

  const openDatePicker = () => {
    const baseDate = bookingForm.preferredDate ? new Date(bookingForm.preferredDate) : new Date();
    setTempDay(baseDate.getDate());
    setTempMonth(baseDate.getMonth() + 1);
    setTempYear(baseDate.getFullYear());
    setShowDatePicker(true);
  };

  const openTimePicker = () => {
    const normalizeMinute = (value: number) => {
      const rounded = Math.round(value / 5) * 5;
      if (rounded >= 60) return 55;
      if (rounded < 0) return 0;
      return rounded;
    };
    if (bookingForm.preferredTime) {
      const [hourPart, minutePart] = bookingForm.preferredTime.split(':');
      const parsedHour = Number(hourPart);
      const parsedMinute = Number(minutePart);
      if (Number.isFinite(parsedHour)) setTempHour(Math.min(23, Math.max(0, parsedHour)));
      if (Number.isFinite(parsedMinute)) setTempMinute(normalizeMinute(parsedMinute));
    } else {
      const now = new Date();
      setTempHour(now.getHours());
      setTempMinute(normalizeMinute(now.getMinutes()));
    }
    setShowTimePicker(true);
  };

  const confirmDateSelection = () => {
    const newDate = new Date(tempYear, tempMonth - 1, tempDay);
    const formattedDate = newDate.toISOString().split('T')[0];
    setBookingForm(prev => ({ ...prev, preferredDate: formattedDate }));
    setBookingError(null);
    setShowDatePicker(false);
  };

  const confirmTimeSelection = () => {
    const pad = (value: number) => value.toString().padStart(2, '0');
    const formattedTime = `${pad(tempHour)}:${pad(tempMinute)}`;
    setBookingForm(prev => ({ ...prev, preferredTime: formattedTime }));
    setBookingError(null);
    setShowTimePicker(false);
  };

  const cancelDateSelection = () => {
    setShowDatePicker(false);
  };

  const cancelTimeSelection = () => {
    setShowTimePicker(false);
  };

  const normalizeWhatsappNumber = (value?: string | null): string => {
    if (!value) return '';
    return value.replace(/[^\d]/g, '');
  };

  const buildWhatsappUrls = (phone: string | null | undefined, message: string) => {
    const encoded = encodeURIComponent(message);
    const normalized = normalizeWhatsappNumber(phone);
    if (!normalized) {
      return {
        app: `whatsapp://send?text=${encoded}`,
        web: `https://wa.me/?text=${encoded}`,
      };
    }
    return {
      app: `whatsapp://send?phone=${normalized}&text=${encoded}`,
      web: `https://wa.me/${normalized}?text=${encoded}`,
    };
  };

  const buildOrderWhatsappMessage = () => {
    const customerName = orderForm.name.trim() || profileName;
    const customerPhone = orderForm.phone.trim() || profilePhone;
    const customerEmail = orderForm.email.trim() || profileEmail;
    const customerAddress = orderForm.address.trim() || profileAddress;
    const clinicName = storefront?.name || clinic.name || 'العيادة';
    const lines = [
      'طلب جديد من المتجر الإلكتروني',
      `العيادة: ${clinicName}`,
      `الاسم: ${customerName}`,
      `الهاتف: ${customerPhone}`,
    ];

    if (customerEmail) lines.push(`البريد: ${customerEmail}`);
    if (customerAddress) lines.push(`العنوان: ${customerAddress}`);
    if (orderForm.notes) lines.push(`ملاحظات: ${orderForm.notes}`);

    if (cartItems.length) {
      lines.push('المنتجات:');
      cartItems.forEach(({ product, qty }) => {
        const itemTotal = (Number(product.price) || 0) * qty;
        lines.push(`- ${product.name} × ${qty} = ${itemTotal.toFixed(2)} ج.م`);
      });
      lines.push(`الإجمالي: ${cartTotal.toFixed(2)} ج.م`);
    }

    return lines.join('\n');
  };

  const buildBookingWhatsappMessage = () => {
    if (!bookingService) return '';
    const customerName = bookingForm.name.trim() || profileName;
    const customerPhone = bookingForm.phone.trim() || profilePhone;
    const customerEmail = bookingForm.email.trim() || profileEmail;
    const clinicName = storefront?.name || clinic.name || 'العيادة';
    const petName = selectedPet?.name || '';
    const { displayText, unitLabel } = buildServicePrice(bookingService);
    const minDurationText = buildServiceMinDuration(bookingService, unitLabel);

    const lines = [
      'طلب حجز خدمة',
      `العيادة: ${clinicName}`,
      `الخدمة: ${bookingService.name}`,
      `الاسم: ${customerName}`,
      `الهاتف: ${customerPhone}`,
    ];

    if (customerEmail) lines.push(`البريد: ${customerEmail}`);
    if (petName) lines.push(`اسم الحيوان: ${petName}`);
    if (bookingForm.preferredDate) lines.push(`التاريخ المفضل: ${bookingForm.preferredDate}`);
    if (bookingForm.preferredTime) lines.push(`الوقت المفضل: ${bookingForm.preferredTime}`);
    if (bookingForm.notes) lines.push(`ملاحظات: ${bookingForm.notes}`);
    lines.push(`السعر: ${displayText}`);
    if (minDurationText) {
      lines.push(minDurationText);
    }

    return lines.join('\n');
  };

  const handleCheckoutSubmit = async () => {
    if (!cartItems.length || orderSubmitting) return;

    const customerName = orderForm.name.trim() || profileName;
    const customerPhone = orderForm.phone.trim() || profilePhone;
    const customerEmail = orderForm.email.trim() || profileEmail;
    const customerAddress = orderForm.address.trim() || profileAddress;

    if (!customerName || !customerPhone || !customerAddress) {
      setOrderError('يرجى إدخال الاسم ورقم الهاتف والعنوان');
      return;
    }

    setOrderSubmitting(true);
    setOrderError(null);

    const whatsappMessage = buildOrderWhatsappMessage();
    const { app, web } = buildWhatsappUrls(storefront?.phone || clinic.phone, whatsappMessage);
    setOrderWhatsappUrl(web);

    try {
      await Linking.openURL(app);
    } catch {
      try {
        await Linking.openURL(web);
      } catch {
        Alert.alert('تنبيه', 'تعذر فتح واتساب.');
      }
    }

    setOrderSubmitted(true);
    setCart({});

    try {
      const payload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        delivery_address: customerAddress,
        notes: orderForm.notes.trim() || null,
        items: cartItems.map(item => ({
          product_id: Number(item.product.id),
          quantity: item.qty,
        })),
      };
      const response = await apiService.createStorefrontOrder(clinic.id, payload);
      if (response.success) {
        const data: any = response.data;
        setOrderReference(data?.public_id || null);
      }
    } catch (error) {
      // WhatsApp flow already started; ignore API errors here
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleBookingSubmit = async () => {
    if (bookingSubmitting) return;
    if (!bookingService) {
      setBookingError('يرجى اختيار الخدمة');
      return;
    }

    const customerName = bookingForm.name.trim() || profileName;
    const customerPhone = bookingForm.phone.trim() || profilePhone;
    const customerEmail = bookingForm.email.trim() || profileEmail;

    if (!customerName || !customerPhone) {
      setBookingError('يرجى إدخال الاسم ورقم الهاتف');
      return;
    }
    if (!selectedPet) {
      setBookingError('يرجى اختيار الحيوان أو إضافته');
      return;
    }
    if (!bookingForm.preferredDate || !bookingForm.preferredTime) {
      setBookingError('يرجى اختيار التاريخ والوقت');
      return;
    }

    setBookingSubmitting(true);
    setBookingError(null);

    try {
      const bookingMessage = buildBookingWhatsappMessage();
      const { app, web } = buildWhatsappUrls(storefront?.phone || clinic.phone, bookingMessage);
      setBookingWhatsappUrl(web);
      try {
        await Linking.openURL(app);
      } catch {
        try {
          await Linking.openURL(web);
        } catch {
          Alert.alert('تنبيه', 'تعذر فتح واتساب.');
        }
      }
      setBookingSubmitted(true);

      const payload = {
        service_id: Number(bookingService.id),
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        pet_name: selectedPet?.name?.trim() || null,
        preferred_date: bookingForm.preferredDate || null,
        preferred_time: bookingForm.preferredTime ? bookingForm.preferredTime.slice(0, 5) : null,
        notes: bookingForm.notes.trim() || null,
      };
      const response = await apiService.createStorefrontBooking(clinic.id, payload);
      if (response.success) {
        const data: any = response.data;
        setBookingReference(data?.public_id || null);
      } else {
        // Ignore API errors here; WhatsApp flow already started.
      }
    } catch (error) {
      // Ignore; WhatsApp flow already started.
    } finally {
      setBookingSubmitting(false);
    }
  };

  const resetCheckout = (target: 'cart' | 'details' = 'cart') => {
    setOrderSubmitted(false);
    setOrderError(null);
    setOrderReference(null);
    setOrderWhatsappUrl(null);
    setScreenMode(target);
  };

  const resetBooking = () => {
    setBookingSubmitted(false);
    setBookingError(null);
    setBookingReference(null);
    setBookingWhatsappUrl(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setBookingService(null);
    setScreenMode('details');
  };

  const handleBackNavigation = () => {
    if (showAddPet) {
      setShowAddPet(false);
      loadMyPets();
      return;
    }
    if (screenMode === 'checkout') {
      resetCheckout('cart');
      return;
    }
    if (screenMode === 'cart') {
      setScreenMode('details');
      return;
    }
    if (screenMode === 'booking') {
      resetBooking();
      return;
    }
    if (screenMode === 'productDetails') {
      closeProductDetails();
      return;
    }
    onClose();
  };

  useEffect(() => {
    const handleBackPress = () => {
      handleBackNavigation();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [screenMode, showAddPet, loadMyPets]);

  // Actions
  const handleDirections = () => {
    const address = storefront?.address || clinic.address || clinic.city || clinic.name;
    const lat = storefront?.latitude ?? clinic.latitude;
    const lon = storefront?.longitude ?? clinic.longitude;

    let url = '';
    if (lat !== undefined && lon !== undefined && lat !== null && lon !== null) {
      url = Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(storefront?.name || clinic.name)}`
        : `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(storefront?.name || clinic.name)})`;
    } else if (address) {
      url = Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${encodeURIComponent(address)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    } else {
      return Alert.alert('تنبيه', 'الموقع غير متوفر.');
    }

    Linking.openURL(url).catch(() => Alert.alert('خطأ', 'تعذر فتح الخرائط.'));
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `تحقق من ${storefront?.name || clinic.name} على PetMatch!`,
        // url: ... deep link if available
      });
    } catch (error) {
      // ignore
    }
  };

  // Renderers
  const renderService = ({ item }: { item: ClinicService }) => {
    const { displayText, unitLabel } = buildServicePrice(item);
    const minDurationText = buildServiceMinDuration(item, unitLabel);
    const showDetailsLink = Boolean(item.description || item.durationMinutes || item.minDurationUnits);

    return (
      <View style={styles.serviceItem}>
        <View style={styles.serviceHeader}>
          <View style={styles.serviceIconContainer}>
            <Text style={styles.serviceEmoji}>🩺</Text>
          </View>
          <Text style={styles.serviceTitle}>{item.name}</Text>
        </View>
        {item.description ? (
          <Text style={styles.serviceDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        {showDetailsLink ? (
          <TouchableOpacity onPress={() => openServiceDetails(item)}>
            <Text style={[styles.serviceDetailsLink, { color: effectiveAccent }]}>عرض التفاصيل</Text>
          </TouchableOpacity>
        ) : null}
        {minDurationText ? (
          <Text style={styles.serviceMeta}>{minDurationText}</Text>
        ) : null}
        <View style={styles.serviceFooter}>
          <Text style={styles.servicePrice}>{displayText}</Text>
          <TouchableOpacity
            style={[styles.bookServiceBtn, { borderColor: effectiveAccent }]}
            onPress={() => openBooking(item)}
          >
            <Text style={[styles.bookServiceText, { color: effectiveAccent }]}>حجز</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderProduct = ({ item }: { item: ClinicProduct }) => {
    const imageCandidate = item.image || item.images?.[0];
    const quantityInCart = cart[item.id] || 0;
    const isInCart = quantityInCart > 0;
    const isOutOfStock = item.stockQuantity === 0;
    return (
    <View style={styles.productCard}>
      <TouchableOpacity onPress={() => openProductDetails(item)} activeOpacity={0.9}>
        <Image source={{ uri: getImageUrl(imageCandidate) }} style={styles.productImage} resizeMode="cover" />
      </TouchableOpacity>
      <View style={styles.productContent}>
        <TouchableOpacity onPress={() => openProductDetails(item)} activeOpacity={0.8}>
          <Text style={styles.productTitle} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
        {item.description && <Text style={styles.productDesc} numberOfLines={2}>{item.description}</Text>}
        <TouchableOpacity onPress={() => openProductDetails(item)} activeOpacity={0.8}>
          <Text style={[styles.productDetailsLink, { color: effectiveAccent }]}>عرض التفاصيل</Text>
        </TouchableOpacity>
        <View style={styles.productFooter}>
          <Text style={styles.productPrice}>{item.price} ج.م</Text>
          <TouchableOpacity
            style={[
              styles.productActionBtn,
              isInCart
                ? styles.productActionBtnAdded
                : { backgroundColor: effectiveAccent },
              isOutOfStock && styles.productActionBtnDisabled,
            ]}
            onPress={() => {
              if (isOutOfStock) return;
              addToCart(item.id);
              showToast(isInCart ? 'تمت زيادة الكمية في السلة' : `تمت إضافة ${item.name} للسلة`);
            }}
            disabled={isOutOfStock}
          >
            <Text
              style={[
                styles.productActionText,
                isInCart && styles.productActionTextAdded,
              ]}
            >
              {isOutOfStock ? 'نفدت' : isInCart ? `في السلة: ${quantityInCart}` : 'أضف للسلة'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
    );
  };

  const renderOverviewSection = () => (
    <View style={styles.overviewSection}>
      <Text style={styles.sectionHeader}>عن العيادة</Text>
      <Text style={styles.descriptionText}>
        {storefront?.description || 'عيادة بيطرية متخصصة تقدم رعاية بيطرية شاملة للقطط والكلاب. طوارئ 24/7، عيادات جراحية، ومبيت وفندق.'}
      </Text>
      <Text style={[styles.readMore, { color: effectiveAccent }]}>عرض المزيد</Text>

      <View style={styles.mapSection}>
        {mapLocation ? (
          <MapViewComponent initialLocation={mapLocation} height={140} />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>الموقع غير متوفر حالياً</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderServicesSection = (showHeader: boolean) => (
    <View style={[styles.servicesSection, showHeader && styles.sectionStacked]}>
      {showHeader && <Text style={styles.sectionHeader}>الخدمات</Text>}
      {filteredServices.length > 0 ? filteredServices.map(s => (
        <View key={s.id} style={{ marginBottom: 12 }}>{renderService({ item: s })}</View>
      )) : <Text style={styles.emptyText}>لا توجد خدمات متاحة حالياً.</Text>}
    </View>
  );

  const renderProductsSection = (showHeader: boolean) => (
    <View style={[styles.productsSection, showHeader && styles.sectionStacked]}>
      {showHeader && <Text style={styles.sectionHeader}>المنتجات</Text>}
      {filteredProducts.length > 0 ? filteredProducts.map(p => (
        <View key={p.id} style={{ marginBottom: 12 }}>{renderProduct({ item: p })}</View>
      )) : <Text style={styles.emptyText}>لا توجد منتجات متاحة حالياً.</Text>}
    </View>
  );

  const renderPageHeader = (title: string) => (
    <View style={styles.pageHeader}>
      <TouchableOpacity style={styles.pageBackBtn} onPress={handleBackNavigation}>
        <Text style={styles.pageBackText}>→</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>{title}</Text>
      <View style={styles.pageHeaderSpacer} />
    </View>
  );

  const renderCartScreen = () => (
    <SafeAreaView style={styles.pageScreen}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.pageScreen}>
        {renderPageHeader('سلة المشتريات')}
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={[styles.pageContent, !cartItems.length && styles.pageEmptyContent]}
          showsVerticalScrollIndicator={false}
        >
          {cartItems.length === 0 ? (
            <View style={styles.pageEmptyState}>
              <Text style={styles.emptyText}>السلة فارغة حالياً.</Text>
              <TouchableOpacity
                style={[styles.secondaryBtn, styles.pageEmptyButton]}
                onPress={() => {
                  setActiveTab('products');
                  setScreenMode('details');
                }}
              >
                <Text style={styles.secondaryBtnText}>تصفح المنتجات</Text>
              </TouchableOpacity>
            </View>
          ) : (
            cartItems.map(({ product, qty }) => (
              <View key={product.id} style={styles.cartItem}>
                <Image source={{ uri: getImageUrl(product.image || product.images?.[0]) }} style={styles.cartItemImage} />
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemTitle} numberOfLines={1}>{product.name}</Text>
                    <Text style={styles.cartItemPrice}>{product.price} ج.م</Text>
                  <View style={styles.cartQtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCartItem(product.id, -1)}>
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCartItem(product.id, 1)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeFromCart(product.id)}>
                  <Text style={styles.removeBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
        <View style={[styles.pageFooter, { paddingBottom: cartFooterPaddingBottom }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>الإجمالي</Text>
            <Text style={styles.totalValue}>{cartTotal.toFixed(2)} ج.م</Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: effectiveAccent }, !cartItems.length && styles.primaryBtnDisabled]}
            onPress={openCheckout}
            disabled={!cartItems.length}
          >
            <Text style={styles.primaryBtnText}>إتمام الشراء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  const renderCheckoutScreen = () => {
    return (
      <SafeAreaView style={styles.pageScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <KeyboardAvoidingView
          style={styles.pageScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          {renderPageHeader('إتمام الطلب')}
          {orderSubmitted ? (
            <View style={styles.pageSuccess}>
              <Text style={styles.successTitle}>جاهز للإرسال عبر واتساب</Text>
              <Text style={styles.successText}>تم فتح واتساب برسالة الطلب. اضغط إرسال لإكمال الطلب.</Text>
              {orderReference && <Text style={styles.successText}>رقم الطلب: {orderReference}</Text>}
              {orderWhatsappUrl && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: effectiveAccent }]}
                  onPress={() => Linking.openURL(orderWhatsappUrl)}
                >
                  <Text style={styles.primaryBtnText}>فتح واتساب</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => resetCheckout('details')}>
                <Text style={styles.secondaryBtnText}>العودة للعيادة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.pageScroll}
                contentContainerStyle={styles.pageContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {orderError && <Text style={styles.formError}>{orderError}</Text>}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>الاسم الكامل</Text>
                  <TextInput
                    style={styles.formInput}
                    value={orderForm.name}
                    onChangeText={(value) => setOrderForm(prev => ({ ...prev, name: value }))}
                    placeholder="أدخل اسمك"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>رقم الهاتف</Text>
                  <TextInput
                    style={styles.formInput}
                    value={orderForm.phone}
                    onChangeText={(value) => setOrderForm(prev => ({ ...prev, phone: value }))}
                    placeholder="01xxxxxxxxx"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>البريد الإلكتروني</Text>
                  <TextInput
                    style={styles.formInput}
                    value={orderForm.email}
                    onChangeText={(value) => setOrderForm(prev => ({ ...prev, email: value }))}
                    placeholder="example@mail.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>العنوان</Text>
                  <TextInput
                    style={styles.formInput}
                    value={orderForm.address}
                    onChangeText={(value) => setOrderForm(prev => ({ ...prev, address: value }))}
                    placeholder="العنوان بالتفصيل"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>ملاحظات</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    value={orderForm.notes}
                    onChangeText={(value) => setOrderForm(prev => ({ ...prev, notes: value }))}
                    placeholder="أي تفاصيل إضافية"
                    placeholderTextColor="#94A3B8"
                    multiline
                  />
                </View>
              </ScrollView>
              <View style={[styles.pageFooter, { paddingBottom: checkoutFooterPaddingBottom }]}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>الإجمالي</Text>
                  <Text style={styles.totalValue}>{cartTotal.toFixed(2)} ج.م</Text>
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: effectiveAccent }, orderSubmitting && styles.primaryBtnDisabled]}
                  onPress={handleCheckoutSubmit}
                  disabled={orderSubmitting}
                >
                  <Text style={styles.primaryBtnText}>
                    {orderSubmitting ? 'جار التحويل...' : 'إرسال عبر واتساب'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  };

  const renderBookingScreen = () => (
    <SafeAreaView style={styles.pageScreen}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView
        style={styles.pageScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        {renderPageHeader('حجز خدمة')}
        {bookingSubmitted ? (
          <View style={styles.pageSuccess}>
            <Text style={styles.successTitle}>تم إرسال طلب الحجز</Text>
            <Text style={styles.successText}>سنتواصل معك لتأكيد الموعد المناسب.</Text>
            {bookingReference && <Text style={styles.successText}>رقم الحجز: {bookingReference}</Text>}
            {bookingWhatsappUrl && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: effectiveAccent }]}
                onPress={() => Linking.openURL(bookingWhatsappUrl)}
              >
                <Text style={styles.primaryBtnText}>فتح واتساب</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={resetBooking}>
              <Text style={styles.secondaryBtnText}>العودة للعيادة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.pageScroll}
              contentContainerStyle={styles.pageContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.modalSubtitle}>{bookingService?.name || 'اختر خدمة'}</Text>
              <View style={styles.servicePickerSection}>
                <Text style={styles.sectionHeaderSmall}>اختر الخدمة</Text>
                {activeServices.length > 0 ? (
                  activeServices.map((service) => {
                    const priceInfo = buildServicePrice(service);
                    const minDurationText = buildServiceMinDuration(service, priceInfo.unitLabel);
                    return (
                      <TouchableOpacity
                        key={service.id}
                        style={[
                          styles.serviceChoiceCard,
                          bookingService?.id === service.id && { borderColor: effectiveAccent, backgroundColor: '#ECFDF5' },
                        ]}
                        onPress={() => {
                          setBookingService(service);
                          setBookingError(null);
                        }}
                      >
                        <View style={styles.serviceChoiceInfo}>
                          <Text style={styles.serviceChoiceName}>{service.name}</Text>
                          {service.description ? (
                            <Text style={styles.serviceChoiceDesc} numberOfLines={1}>{service.description}</Text>
                          ) : null}
                        </View>
                        <View style={styles.serviceChoicePriceWrap}>
                          <Text style={styles.serviceChoicePrice}>{priceInfo.displayText}</Text>
                          {minDurationText ? (
                            <Text style={styles.serviceChoiceMeta}>{minDurationText}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.emptyText}>لا توجد خدمات متاحة حالياً.</Text>
                )}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>الاسم الكامل</Text>
                <TextInput
                  style={styles.formInput}
                  value={bookingForm.name}
                  onChangeText={(value) => setBookingForm(prev => ({ ...prev, name: value }))}
                  placeholder="أدخل اسمك"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>رقم الهاتف</Text>
                <TextInput
                  style={styles.formInput}
                  value={bookingForm.phone}
                  onChangeText={(value) => setBookingForm(prev => ({ ...prev, phone: value }))}
                  placeholder="01xxxxxxxxx"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>البريد الإلكتروني</Text>
                <TextInput
                  style={styles.formInput}
                  value={bookingForm.email}
                  onChangeText={(value) => setBookingForm(prev => ({ ...prev, email: value }))}
                  placeholder="example@mail.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>حيوانك</Text>
                {petsLoading ? (
                  <View style={styles.petLoadingRow}>
                    <ActivityIndicator size="small" color={effectiveAccent} />
                    <Text style={styles.petLoadingText}>جارٍ تحميل حيواناتك...</Text>
                  </View>
                ) : petsError ? (
                  <Text style={styles.formError}>{petsError}</Text>
                ) : myPets.length ? (
                  <View style={styles.petChoiceList}>
                    {myPets.map((pet) => (
                      <TouchableOpacity
                        key={pet.id}
                        style={[
                          styles.petChoiceCard,
                          selectedPetId === pet.id && { borderColor: effectiveAccent, backgroundColor: '#ECFDF5' },
                        ]}
                        onPress={() => {
                          setSelectedPetId(pet.id);
                          setBookingError(null);
                        }}
                      >
                        {pet.main_image ? (
                          <Image source={{ uri: getImageUrl(pet.main_image) }} style={styles.petChoiceAvatar} />
                        ) : (
                          <View style={styles.petChoiceAvatarPlaceholder}>
                            <Text style={styles.petChoiceAvatarText}>🐾</Text>
                          </View>
                        )}
                        <View style={styles.petChoiceInfo}>
                          <Text style={styles.petChoiceName}>{pet.name || 'غير محدد'}</Text>
                          <Text style={styles.petChoiceMeta}>
                            {pet.pet_type_display}
                            {pet.breed_name ? ` • ${pet.breed_name}` : ''}
                          </Text>
                        </View>
                        <View style={[
                          styles.petChoiceBadge,
                          selectedPetId === pet.id && { backgroundColor: effectiveAccent, borderColor: effectiveAccent },
                        ]}>
                          <Text style={[
                            styles.petChoiceBadgeText,
                            selectedPetId === pet.id && styles.petChoiceBadgeTextActive,
                          ]}>
                            {selectedPetId === pet.id ? '✓' : '🐾'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>لا توجد حيوانات مسجلة حتى الآن.</Text>
                )}
                <TouchableOpacity
                  style={styles.addPetBtn}
                  onPress={() => setShowAddPet(true)}
                >
                  <Text style={styles.addPetBtnText}>إضافة حيوان جديد</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>التاريخ المفضل</Text>
                <TouchableOpacity style={styles.datePickerField} onPress={openDatePicker}>
                  <Text style={[
                    styles.datePickerText,
                    !bookingForm.preferredDate && styles.datePickerPlaceholder
                  ]}>
                    {formatDateForDisplay(bookingForm.preferredDate)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>الوقت المفضل</Text>
                <TouchableOpacity style={styles.datePickerField} onPress={openTimePicker}>
                  <Text style={[
                    styles.datePickerText,
                    !bookingForm.preferredTime && styles.datePickerPlaceholder
                  ]}>
                    {formatTimeForDisplay(bookingForm.preferredTime)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>ملاحظات</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  value={bookingForm.notes}
                  onChangeText={(value) => setBookingForm(prev => ({ ...prev, notes: value }))}
                  placeholder="تفاصيل إضافية عن الحالة"
                  placeholderTextColor="#94A3B8"
                  multiline
                />
              </View>
            </ScrollView>
            <View style={[styles.pageFooter, { paddingBottom: bookingFooterPaddingBottom }]}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>السعر</Text>
                <View style={styles.totalValueWrap}>
                  <Text style={styles.totalValue}>
                    {bookingPriceInfo?.displayText || `${bookingService?.basePrice ?? 0} ج.م`}
                  </Text>
                  {bookingMinDurationText ? (
                    <Text style={styles.totalSubtext}>{bookingMinDurationText}</Text>
                  ) : null}
                </View>
              </View>
              {bookingError ? <Text style={styles.footerErrorText}>{bookingError}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: effectiveAccent }, bookingSubmitting && styles.primaryBtnDisabled]}
                onPress={handleBookingSubmit}
                disabled={bookingSubmitting}
              >
                <Text style={styles.primaryBtnText}>
                  {bookingSubmitting ? 'جار الإرسال...' : 'إرسال الحجز'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <Modal
        transparent
        animationType="slide"
        visible={showDatePicker}
        onRequestClose={cancelDateSelection}
      >
        <View style={styles.dateModalOverlay}>
          <View style={styles.dateModalCard}>
            <View style={styles.dateModalHeader}>
              <TouchableOpacity style={styles.dateModalButton} onPress={cancelDateSelection}>
                <Text style={styles.dateModalButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <Text style={styles.dateModalTitle}>اختر التاريخ</Text>
              <TouchableOpacity style={styles.dateModalButton} onPress={confirmDateSelection}>
                <Text style={[styles.dateModalButtonText, styles.dateModalConfirm]}>تأكيد</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>اليوم</Text>
                <ScrollView
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={40}
                  decelerationRate="fast"
                >
                  {generateDays().map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.datePickerItem, tempDay === day && styles.datePickerItemSelected]}
                      onPress={() => setTempDay(day)}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        tempDay === day && styles.datePickerItemTextSelected
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>الشهر</Text>
                <ScrollView
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={40}
                  decelerationRate="fast"
                >
                  {generateMonths().map((month) => (
                    <TouchableOpacity
                      key={month.value}
                      style={[styles.datePickerItem, tempMonth === month.value && styles.datePickerItemSelected]}
                      onPress={() => setTempMonth(month.value)}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        tempMonth === month.value && styles.datePickerItemTextSelected
                      ]}>
                        {month.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>السنة</Text>
                <ScrollView
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={40}
                  decelerationRate="fast"
                >
                  {generateYears().map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[styles.datePickerItem, tempYear === year && styles.datePickerItemSelected]}
                      onPress={() => setTempYear(year)}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        tempYear === year && styles.datePickerItemTextSelected
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={showTimePicker}
        onRequestClose={cancelTimeSelection}
      >
        <View style={styles.dateModalOverlay}>
          <View style={styles.dateModalCard}>
            <View style={styles.dateModalHeader}>
              <TouchableOpacity style={styles.dateModalButton} onPress={cancelTimeSelection}>
                <Text style={styles.dateModalButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <Text style={styles.dateModalTitle}>اختر الوقت</Text>
              <TouchableOpacity style={styles.dateModalButton} onPress={confirmTimeSelection}>
                <Text style={[styles.dateModalButtonText, styles.dateModalConfirm]}>تأكيد</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>الساعة</Text>
                <ScrollView
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={40}
                  decelerationRate="fast"
                >
                  {generateHours().map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[styles.datePickerItem, tempHour === hour && styles.datePickerItemSelected]}
                      onPress={() => setTempHour(hour)}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        tempHour === hour && styles.datePickerItemTextSelected
                      ]}>
                        {hour.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>الدقيقة</Text>
                <ScrollView
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={40}
                  decelerationRate="fast"
                >
                  {generateMinutes().map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[styles.datePickerItem, tempMinute === minute && styles.datePickerItemSelected]}
                      onPress={() => setTempMinute(minute)}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        tempMinute === minute && styles.datePickerItemTextSelected
                      ]}>
                        {minute.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  const renderProductDetailsScreen = () => {
    if (!selectedProduct) {
      return (
        <SafeAreaView style={styles.pageScreen}>
          <StatusBar barStyle="dark-content" backgroundColor="#fff" />
          <View style={styles.pageScreen}>
            {renderPageHeader('تفاصيل المنتج')}
            <View style={styles.pageEmptyState}>
              <Text style={styles.emptyText}>المنتج غير متاح حالياً.</Text>
              <TouchableOpacity style={[styles.secondaryBtn, styles.pageEmptyButton]} onPress={closeProductDetails}>
                <Text style={styles.secondaryBtnText}>العودة للمنتجات</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    const detailImages = getProductImageCandidates(selectedProduct);
    const safeImageIndex = Math.min(productImageIndex, detailImages.length - 1);
    const stockQuantity = typeof selectedProduct.stockQuantity === 'number' ? selectedProduct.stockQuantity : null;
    const isOutOfStock = stockQuantity === 0;
    const canIncreaseQty = !isOutOfStock && (stockQuantity === null || productDetailsQty < stockQuantity);
    const canDecreaseQty = !isOutOfStock && productDetailsQty > 1;
    const ctaLabel = isOutOfStock
      ? 'نفدت'
      : productDetailsQty > 1
        ? `إضافة ${productDetailsQty} إلى السلة`
        : 'أضف للسلة';
    const inCartQty = cart[selectedProduct.id] || 0;

    const handleGalleryScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const width = event.nativeEvent.layoutMeasurement.width;
      if (!width) return;
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      if (Number.isFinite(nextIndex)) {
        setProductImageIndex(Math.max(0, Math.min(detailImages.length - 1, nextIndex)));
      }
    };

    return (
      <SafeAreaView style={styles.pageScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.pageScreen}>
          {renderPageHeader('تفاصيل المنتج')}
          <ScrollView
            style={styles.pageScroll}
            contentContainerStyle={styles.pageContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.productDetailsGalleryCard}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleGalleryScrollEnd}
              >
                {detailImages.map((image, index) => (
                  <Image
                    key={`${selectedProduct.id}-image-${index}`}
                    source={{ uri: getImageUrl(image) }}
                    style={styles.productDetailsImage}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
              {detailImages.length > 1 ? (
                <View style={styles.productDetailsDotsRow}>
                  {detailImages.map((_, index) => (
                    <View
                      key={`${selectedProduct.id}-dot-${index}`}
                      style={[
                        styles.productDetailsDot,
                        safeImageIndex === index && styles.productDetailsDotActive,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.productDetailsInfoCard}>
              <Text style={styles.productDetailsTitle}>{selectedProduct.name}</Text>

              <View style={styles.productDetailsMetaRow}>
                <Text style={styles.productDetailsMetaLabel}>التصنيف</Text>
                <Text style={styles.productDetailsMetaValue}>{selectedProduct.category || 'غير محدد'}</Text>
              </View>

              <View style={styles.productDetailsMetaRow}>
                <Text style={styles.productDetailsMetaLabel}>السعر</Text>
                <Text style={[styles.productDetailsPrice, { color: effectiveAccent }]}>{selectedProduct.price} ج.م</Text>
              </View>

              <View style={styles.productDetailsStockRow}>
                <View
                  style={[
                    styles.productDetailsStockBadge,
                    isOutOfStock ? styles.productDetailsStockBadgeOut : styles.productDetailsStockBadgeIn,
                  ]}
                >
                  <Text
                    style={[
                      styles.productDetailsStockBadgeText,
                      isOutOfStock ? styles.productDetailsStockTextOut : styles.productDetailsStockTextIn,
                    ]}
                  >
                    {isOutOfStock ? 'نفد المخزون' : 'متوفر'}
                  </Text>
                </View>
                {stockQuantity !== null && !isOutOfStock ? (
                  <Text style={styles.productDetailsStockCount}>المتوفر: {stockQuantity}</Text>
                ) : null}
              </View>

              {inCartQty > 0 ? (
                <Text style={styles.productDetailsInCart}>في السلة حالياً: {inCartQty}</Text>
              ) : null}

              <View style={styles.productDetailsDescriptionSection}>
                <Text style={styles.productDetailsSectionTitle}>الوصف</Text>
                <Text style={styles.productDetailsDescription}>
                  {selectedProduct.description || 'لا يوجد وصف متاح'}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.pageFooter, { paddingBottom: productDetailsFooterPaddingBottom }]}>
            <View style={styles.productDetailsQtyRow}>
              <Text style={styles.productDetailsQtyLabel}>الكمية</Text>
              <View style={styles.productDetailsQtyControls}>
                <TouchableOpacity
                  style={[styles.productDetailsQtyBtn, !canIncreaseQty && styles.productDetailsQtyBtnDisabled]}
                  onPress={incrementProductDetailsQty}
                  disabled={!canIncreaseQty}
                >
                  <Text style={styles.productDetailsQtyBtnText}>+</Text>
                </TouchableOpacity>
                <Text style={styles.productDetailsQtyValue}>{productDetailsQty}</Text>
                <TouchableOpacity
                  style={[styles.productDetailsQtyBtn, !canDecreaseQty && styles.productDetailsQtyBtnDisabled]}
                  onPress={decrementProductDetailsQty}
                  disabled={!canDecreaseQty}
                >
                  <Text style={styles.productDetailsQtyBtnText}>-</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.productDetailsFooterActions}>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: effectiveAccent },
                  isOutOfStock && styles.primaryBtnDisabled,
                ]}
                onPress={addSelectedProductToCart}
                disabled={isOutOfStock}
              >
                <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
              </TouchableOpacity>
              {inCartQty > 0 ? (
                <TouchableOpacity
                  style={styles.productDetailsGoCartBtn}
                  onPress={goToCartFromProductDetails}
                >
                  <Text style={styles.productDetailsGoCartText}>اذهب للسلة</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {toastMessage && (
            <View style={[styles.toast, { bottom: toastBottomOffset }]}>
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  };

  if (showAddPet) {
    return (
      <AddPetScreen
        onClose={() => {
          setShowAddPet(false);
          loadMyPets();
        }}
      />
    );
  }

  if (externalBookingService) {
    return (
      <ServiceBookingScreen
        clinic={{
          id: clinic.id,
          name: storefront?.name || clinic.name,
          logoUrl: clinic.logoUrl,
          accentColor: storefront?.storefrontPrimaryColor || clinic.accentColor,
          distanceLabel: clinic.distanceLabel,
          phone: storefront?.phone || clinic.phone,
          whatsapp: storefront?.whatsapp,
          workingHours: storefront?.workingHours || clinic.workingHours,
        }}
        service={externalBookingService}
        onClose={() => setExternalBookingService(null)}
      />
    );
  }

  if (screenMode === 'cart') {
    return renderCartScreen();
  }
  if (screenMode === 'checkout') {
    return renderCheckoutScreen();
  }
  if (screenMode === 'booking') {
    return renderBookingScreen();
  }
  if (screenMode === 'productDetails') {
    return renderProductDetailsScreen();
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: detailsScrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Hero Section */}
        <View style={[styles.heroBackground, { backgroundColor: effectiveAccent }]}>
          <View style={[styles.heroNavbar, { paddingTop: heroTopPadding }]}>
            <TouchableOpacity style={styles.navIconBtn} onPress={onClose}>
              <Text style={styles.navIconText}>→</Text>
            </TouchableOpacity>

            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.navIconBtn} onPress={handleShare}>
                <Text style={{ fontSize: 20 }}>🔗</Text>
              </TouchableOpacity>
              {hasActiveProducts && (
                <TouchableOpacity
                  style={[styles.navIconBtn, styles.cartNavBtn, { marginLeft: 10 }]}
                  onPress={() => setScreenMode('cart')}
                >
                  <Text style={styles.cartIconText}>🛒</Text>
                  <Text style={styles.cartLabelText}>السلة</Text>
                  {totalItems > 0 && (
                    <View style={styles.cartBadge}>
                      <Text style={styles.cartBadgeText}>{totalItems}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.navIconBtn, { marginLeft: 10 }]}>
                <Text style={{ fontSize: 18 }}>❤️</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Info Card (Overlapping) */}
        <View style={styles.infoCardWrapper}>
          <View style={styles.infoCard}>
            <View style={styles.logoRow}>
              <View style={[styles.logoCircle, { backgroundColor: '#fff', borderColor: effectiveAccent }]}>
                <Image
                  source={{ uri: clinic.logoUrl ? getImageUrl(clinic.logoUrl) : DEFAULT_CLINIC_LOGO }}
                  style={styles.logoImg}
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text style={styles.clinicNameHero}>{storefront?.name || clinic.name}</Text>
            <View style={styles.locationPill}>
              <Text style={styles.locationPillIcon}>📍</Text>
              <Text style={styles.locationPillText}>
                {storefront?.address || clinic.address || clinic.city || 'العنوان غير متوفر'}
              </Text>
            </View>

            <View style={styles.heroActionsBlock}>
              {(hasActiveServices || hasActiveProducts) && (
                <View style={styles.primaryActionsRow}>
                  {hasActiveServices && (
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: effectiveAccent }]}
                      onPress={() => {
                        if (activeServices.length > 0) {
                          openBooking();
                        } else {
                          Alert.alert('تنبيه', 'لا توجد خدمات متاحة للحجز حالياً.');
                        }
                      }}
                    >
                      <Text style={styles.primaryActionText}>احجز موعد</Text>
                      <Text style={styles.primaryActionSubtext}>اختر الخدمة المناسبة</Text>
                    </TouchableOpacity>
                  )}

                  {hasActiveProducts && (
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, styles.primaryActionBtnSecondary]}
                      onPress={() => setActiveTab('products')}
                    >
                      <Text style={styles.primaryActionTextSecondary}>تصفح المنتجات</Text>
                      <Text style={styles.primaryActionSubtextSecondary}>تسوق من المتجر</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity style={styles.directionsBtn} onPress={handleDirections}>
                <Text style={styles.directionsBtnIcon}>📍</Text>
                <Text style={styles.directionsBtnText}>اتجاهات</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>

        {/* Tabs */}
        {showTabs && (
          <View style={styles.tabsContainer}>
            <TouchableOpacity style={[styles.tabItem, activeTab === 'overview' && styles.tabItemActive, activeTab === 'overview' && { borderBottomColor: effectiveAccent }]} onPress={() => setActiveTab('overview')}>
              <Text style={[styles.tabText, activeTab === 'overview' && { color: effectiveAccent }]}>نظرة عامة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, activeTab === 'services' && styles.tabItemActive, activeTab === 'services' && { borderBottomColor: effectiveAccent }]} onPress={() => setActiveTab('services')}>
              <Text style={[styles.tabText, activeTab === 'services' && { color: effectiveAccent }]}>الخدمات</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, activeTab === 'products' && styles.tabItemActive, activeTab === 'products' && { borderBottomColor: effectiveAccent }]} onPress={() => setActiveTab('products')}>
              <Text style={[styles.tabText, activeTab === 'products' && { color: effectiveAccent }]}>المنتجات</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        <View style={styles.contentContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={effectiveAccent} style={{ marginTop: 20 }} />
          ) : (
            <>
              {showTabs ? (
                <>
                  {activeTab === 'overview' && renderOverviewSection()}
                  {activeTab === 'services' && renderServicesSection(false)}
                  {activeTab === 'products' && renderProductsSection(false)}
                </>
              ) : (
                <>
                  {renderOverviewSection()}
                  {hasActiveServices && renderServicesSection(true)}
                  {hasActiveProducts && renderProductsSection(true)}
                  {!hasActiveServices && !hasActiveProducts && (
                    <Text style={styles.emptyText}>لا توجد خدمات أو منتجات متاحة حالياً.</Text>
                  )}
                </>
              )}

            </>
          )}
        </View>

      </ScrollView>

      {/* Sticky Bottom Bar */}
      {(hasActiveServices || hasActiveProducts) && (
        <View style={[styles.stickyFooter, { paddingBottom: stickyFooterPaddingBottom }]}>
          <View style={styles.footerBtnContainer}>
            {hasActiveProducts && (
              <TouchableOpacity style={styles.footerCallBtn} onPress={() => setScreenMode('cart')}>
                <Text style={{ fontSize: 16 }}>🛒</Text>
                <Text style={styles.footerCallText}>السلة</Text>
                {totalItems > 0 && (
                  <View style={[styles.cartBadge, styles.footerCartBadge]}>
                    <Text style={styles.cartBadgeText}>{totalItems}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {hasActiveServices && (
              <TouchableOpacity
                style={[styles.footerBookBtn, { backgroundColor: effectiveAccent }]}
                onPress={() => {
                  if (activeServices.length > 0) {
                    openBooking();
                  } else {
                    Alert.alert('تنبيه', 'لا توجد خدمات متاحة للحجز حالياً.');
                  }
                }}
              >
                <Text style={styles.footerBookText}>احجز موعد</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Modal
        transparent
        animationType="slide"
        visible={serviceDetailsVisible}
        onRequestClose={closeServiceDetails}
      >
        <View style={styles.serviceModalOverlay}>
          <TouchableOpacity style={styles.serviceModalBackdrop} activeOpacity={1} onPress={closeServiceDetails} />
          <View style={styles.serviceModalCard}>
            <View style={styles.serviceModalHeader}>
              <Text style={styles.serviceModalTitle}>{serviceDetails?.name || 'تفاصيل الخدمة'}</Text>
              <TouchableOpacity style={styles.serviceModalClose} onPress={closeServiceDetails}>
                <Text style={styles.serviceModalCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.serviceModalContent}
              contentContainerStyle={styles.serviceModalContentInner}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.serviceModalPrice}>
                {serviceDetailsPriceInfo?.displayText || ''}
              </Text>
              {serviceDetails?.durationMinutes ? (
                <Text style={styles.serviceModalMeta}>المدة: {serviceDetails.durationMinutes} دقيقة</Text>
              ) : null}
              {serviceDetailsMinDurationText ? (
                <Text style={styles.serviceModalMeta}>{serviceDetailsMinDurationText}</Text>
              ) : null}
              <Text style={styles.serviceModalDescription}>
                {serviceDetails?.description || 'لا يوجد وصف إضافي لهذه الخدمة.'}
              </Text>
            </ScrollView>
            <View style={styles.serviceModalFooter}>
              <TouchableOpacity
                style={[styles.serviceModalBookBtn, { backgroundColor: effectiveAccent }]}
                onPress={() => {
                  if (!serviceDetails) return;
                  const selected = serviceDetails;
                  closeServiceDetails();
                  openBooking(selected);
                }}
              >
                <Text style={styles.serviceModalBookText}>احجز الخدمة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {toastMessage && (
        <View style={[styles.toast, { bottom: toastBottomOffset }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#fff', // White bg
  },
  scrollContent: {
    paddingBottom: 100, // Space for footer
  },
  heroBackground: {
    height: 240,
    width: '100%',
    justifyContent: 'flex-start',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  heroNavbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  navIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartNavBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: 'auto',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  cartIconText: {
    fontSize: 16,
  },
  cartLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  navIconText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 'bold',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  footerCartBadge: {
    top: -6,
    right: -6,
  },
  heroActions: {
    flexDirection: 'row',
  },
  infoCardWrapper: {
    paddingHorizontal: 20,
    marginTop: -60, // Overlap hero
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center', // Centered content
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  logoRow: {
    marginTop: -50, // Pull logo up
    marginBottom: 12,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  clinicNameHero: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  clinicTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  star: { fontSize: 14 },
  ratingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  ratingCount: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    backgroundColor: '#0EA5A4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  locationPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 14,
    gap: 6,
  },
  locationPillIcon: {
    fontSize: 13,
  },
  locationPillText: {
    flexShrink: 1,
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
  },
  heroActionsBlock: {
    alignSelf: 'stretch',
    gap: 10,
  },
  primaryActionsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  primaryActionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryActionBtnSecondary: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowOpacity: 0.06,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryActionSubtext: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  primaryActionTextSecondary: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryActionSubtextSecondary: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  directionsBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    minHeight: 44,
  },
  directionsBtnIcon: {
    fontSize: 15,
  },
  directionsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  tabsContainer: {
    flexDirection: 'row-reverse',
    marginTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    // Color handled in inline style
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  contentContainer: {
    padding: 20,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'right',
    lineHeight: 22,
    marginBottom: 8,
  },
  readMore: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 20,
  },
  mapSection: {
    height: 140,
    borderRadius: 16,
    marginTop: 10,
  },
  mapPlaceholder: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },

  // Services
  servicesSection: {
    //
  },
  productsSection: {
    //
  },
  sectionStacked: {
    marginTop: 14,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    flexDirection: 'row-reverse',
    overflow: 'hidden',
  },
  productImage: {
    width: 90,
    height: 90,
  },
  productContent: {
    flex: 1,
    padding: 12,
    alignItems: 'flex-end',
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  productDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 4,
  },
  productDetailsLink: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 6,
  },
  productFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  productActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  productActionBtnAdded: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  productActionBtnDisabled: {
    backgroundColor: '#CBD5F5',
    borderColor: 'transparent',
    borderWidth: 0,
  },
  productActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  productActionTextAdded: {
    color: '#047857',
  },
  productBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  productBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  productDetailsGalleryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  productDetailsImage: {
    width: PRODUCT_DETAILS_IMAGE_WIDTH,
    height: 230,
    backgroundColor: '#F8FAFC',
  },
  productDetailsDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  productDetailsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  productDetailsDotActive: {
    backgroundColor: '#0EA5A4',
    width: 16,
  },
  productDetailsInfoCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#fff',
    padding: 14,
  },
  productDetailsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 10,
  },
  productDetailsMetaRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productDetailsMetaLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  productDetailsMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  productDetailsPrice: {
    fontSize: 16,
    fontWeight: '800',
  },
  productDetailsStockRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  productDetailsStockBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  productDetailsStockBadgeIn: {
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
  },
  productDetailsStockBadgeOut: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  productDetailsStockBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  productDetailsStockTextIn: {
    color: '#047857',
  },
  productDetailsStockTextOut: {
    color: '#B91C1C',
  },
  productDetailsStockCount: {
    fontSize: 12,
    color: '#475569',
  },
  productDetailsInCart: {
    fontSize: 12,
    color: '#0F766E',
    textAlign: 'right',
    marginBottom: 10,
    fontWeight: '700',
  },
  productDetailsDescriptionSection: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  productDetailsSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 6,
  },
  productDetailsDescription: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'right',
    lineHeight: 22,
  },
  productDetailsQtyRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  productDetailsQtyLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  productDetailsQtyControls: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  productDetailsQtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productDetailsQtyBtnDisabled: {
    opacity: 0.45,
  },
  productDetailsQtyBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
  },
  productDetailsQtyValue: {
    minWidth: 22,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  productDetailsFooterActions: {
    gap: 12,
    paddingTop: 2,
  },
  productDetailsGoCartBtn: {
    width: '100%',
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productDetailsGoCartText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  serviceItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  serviceHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    marginLeft: 12,
  },
  serviceEmoji: { fontSize: 20 },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  serviceDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'right',
    marginBottom: 12,
  },
  serviceDetailsLink: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 8,
  },
  serviceMeta: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
    marginBottom: 6,
  },
  serviceFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  bookServiceBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  bookServiceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 20,
  },

  // Pages + Forms
  pageScreen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pageHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pageBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBackText: {
    fontSize: 20,
    color: '#0F172A',
  },
  pageHeaderSpacer: {
    width: 40,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    padding: 20,
  },
  pageFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    backgroundColor: '#fff',
  },
  pageEmptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  pageEmptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  pageEmptyButton: {
    marginTop: 12,
    width: '100%',
  },
  pageSuccess: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
    textAlign: 'right',
  },
  sectionHeaderSmall: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 8,
  },
  cartItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 10,
  },
  cartItemImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginLeft: 10,
  },
  cartItemInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cartItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  cartItemPrice: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  cartQtyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  qtyValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 16,
  },
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalValueWrap: {
    alignItems: 'flex-end',
  },
  totalSubtext: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'right',
  },
  footerErrorText: {
    color: '#EF4444',
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: '#0EA5A4',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnDisabled: {
    backgroundColor: '#CBD5F5',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
  },
  secondaryBtnText: {
    color: '#475569',
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 12,
  },
  servicePickerSection: {
    marginBottom: 16,
  },
  serviceChoiceCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  serviceChoiceInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  serviceChoiceName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  serviceChoiceDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'right',
  },
  serviceChoicePrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  serviceChoicePriceWrap: {
    alignItems: 'flex-end',
  },
  serviceChoiceMeta: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'right',
  },
  petLoadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 6,
  },
  petLoadingText: {
    marginHorizontal: 8,
    color: '#64748B',
    fontSize: 12,
  },
  petChoiceList: {
    marginBottom: 6,
  },
  petChoiceCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  petChoiceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
  },
  petChoiceAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petChoiceAvatarText: {
    fontSize: 16,
    color: '#94A3B8',
  },
  petChoiceInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginHorizontal: 10,
  },
  petChoiceName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  petChoiceMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'right',
  },
  petChoiceBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  petChoiceBadgeText: {
    fontSize: 12,
    color: '#64748B',
  },
  petChoiceBadgeTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  addPetBtn: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    marginTop: 6,
  },
  addPetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryRowItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'right',
    color: '#0F172A',
    fontSize: 13,
  },
  formTextArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  datePickerField: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  datePickerText: {
    fontSize: 13,
    color: '#0F172A',
    textAlign: 'right',
  },
  datePickerPlaceholder: {
    color: '#94A3B8',
  },
  formError: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'right',
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  successText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 6,
  },
  // Toast
  toast: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Service Details Modal
  serviceModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  serviceModalBackdrop: {
    flex: 1,
  },
  serviceModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  serviceModalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  serviceModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  serviceModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceModalCloseText: {
    fontSize: 18,
    color: '#475569',
    fontWeight: '700',
  },
  serviceModalContent: {
    flexGrow: 0,
  },
  serviceModalContentInner: {
    paddingBottom: 20,
  },
  serviceModalPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 6,
  },
  serviceModalMeta: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
    marginBottom: 4,
  },
  serviceModalDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    textAlign: 'right',
    marginTop: 8,
  },
  serviceModalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  serviceModalBookBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  serviceModalBookText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Date Picker Modal
  dateModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  dateModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  dateModalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateModalButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dateModalButtonText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
  },
  dateModalConfirm: {
    color: '#0EA5A4',
  },
  datePickerContainer: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  datePickerColumn: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 6,
  },
  datePickerScroll: {
    maxHeight: 200,
  },
  datePickerItem: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginBottom: 4,
  },
  datePickerItemSelected: {
    backgroundColor: '#ECFDF5',
  },
  datePickerItemText: {
    fontSize: 13,
    color: '#0F172A',
  },
  datePickerItemTextSelected: {
    color: '#0EA5A4',
    fontWeight: '800',
  },

  // Sticky Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  footerBtnContainer: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  footerBookBtn: {
    flex: 1.4,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBookText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  footerCallBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 6,
  },
  footerCallText: {
    color: '#475569',
    fontWeight: '600',
  },

  // Reviews
  overviewSection: {},
  reviewSummary: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    marginBottom: 20,
  },
  bigRating: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewStars: {
    fontSize: 14,
    marginVertical: 4,
  },
  reviewCountText: {
    color: '#64748B',
    fontSize: 13,
  },
});

export default ClinicDetailsScreen;
