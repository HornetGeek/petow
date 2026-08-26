import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  PermissionsAndroid,
  Platform,
  Modal,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import MapViewComponent from './MapView';
import { useCallback } from 'react';
import { apiService, MapsAutocompletePrediction } from '../services/api';
import { normalizeLatLng } from '../utils/coordinates';
import AppIcon, { IconSize } from './icons/AppIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MapLocationPickerProps {
  value?: string;
  onChange?: (location: string, coordinates?: { lat: number; lng: number }) => void;
  initialLocation?: { latitude: number; longitude: number; address?: string };
  onLocationSelected?: (location: { latitude: number; longitude: number; address?: string }) => void;
  onClose?: () => void;
  placeholder?: string;
  showMap?: boolean;
  showHeader?: boolean;
}

type SearchResult = MapsAutocompletePrediction;

const MapLocationPicker: React.FC<MapLocationPickerProps> = ({ 
  value = '', 
  onChange, 
  initialLocation,
  onLocationSelected,
  onClose,
  placeholder = 'ابحث عن موقعك',
  showMap = true,
  showHeader = false,
}) => {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchValue, setSearchValue] = useState(value);
  const normalizedInitialLocation = useMemo(
    () => normalizeLatLng(initialLocation?.latitude, initialLocation?.longitude),
    [initialLocation?.latitude, initialLocation?.longitude],
  );
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    normalizedInitialLocation
  );
  const [showMapView, setShowMapView] = useState(false);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const locationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Separate debounce for the onChange propagation so we don't fire parent
  // callbacks on every keystroke — they only care about "final" text.
  const onChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionTokenRef = useRef(`mobile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

  // Avoid showing raw coords in the input
  const prettifyName = useCallback((name: string, coords?: { lat: number; lng: number }) => {
    if (name && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(name)) {
      return name;
    }
    if (coords) {
      return 'الموقع المحدد على الخريطة';
    }
    return 'تم تحديد الموقع';
  }, []);

  // Initialize searchValue with value prop
  useEffect(() => {
    setSearchValue(value);
  }, [value]);

  useEffect(() => {
    if (!value && initialLocation?.address) {
      setSearchValue(initialLocation.address);
    }
  }, [initialLocation?.address, value]);

  useEffect(() => {
    setLocation(normalizedInitialLocation);
  }, [normalizedInitialLocation]);

  useEffect(() => {
    if (__DEV__ && initialLocation && !normalizedInitialLocation) {
      console.warn('MapLocationPicker: invalid initialLocation ignored', initialLocation);
    }
  }, [initialLocation, normalizedInitialLocation]);

  // Safe wrapper to avoid crashes if onChange is missing or invalid
  const safeOnChange = useCallback(
    (locationText: string, coords?: { lat: number; lng: number }) => {
      if (typeof onChange === 'function') {
        onChange(locationText, coords);
      } else {
        console.warn('MapLocationPicker: onChange prop is missing or not a function');
      }
      if (coords && typeof onLocationSelected === 'function') {
        onLocationSelected({
          latitude: coords.lat,
          longitude: coords.lng,
          address: locationText,
        });
      }
    },
    [onChange, onLocationSelected],
  );

  // البحث عبر Google Places Autocomplete من خلال Backend proxy
  const searchLocation = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    try {
      console.log('🔍 Searching for:', query);
      setIsLoading(true);
      
      const response = await apiService.mapsAutocomplete({
        query: query.trim(),
        language: 'ar',
        sessionToken: sessionTokenRef.current,
      });

      if (response.success && response.data) {
        const results = response.data.predictions || [];
        console.log('🔍 Search results:', results);
        setSearchResults(results);
        setShowSuggestions(results.length > 0);
      } else {
        console.log('🔍 Search failed:', response.error);
        setSearchResults([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('🔍 Error searching location:', error);
      setSearchResults([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // معالجة تغيير النص في حقل البحث
  const handleInputChange = (text: string) => {
    console.log('🔍 Input changed to:', text);
    setSearchValue(text);
    setIsLoading(false);

    // Debounce parent onChange so typing doesn't re-render consumers per key.
    if (onChangeTimeoutRef.current) {
      clearTimeout(onChangeTimeoutRef.current);
    }
    onChangeTimeoutRef.current = setTimeout(() => {
      safeOnChange(text);
    }, 400);

    // إلغاء البحث السابق
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // بحث جديد بعد تأخير
    searchTimeoutRef.current = setTimeout(() => {
      console.log('🔍 Starting search after timeout for:', text);
      searchLocation(text);
    }, 1000);
  };

  // اختيار موقع من نتائج البحث
  const selectLocation = async (result: SearchResult) => {
    console.log('🔍 Location selected:', result);
    setIsLoading(true);
    try {
      const geocodeResponse = await apiService.mapsGeocodePlace({
        placeId: result.place_id,
        language: 'ar',
      });
      if (!geocodeResponse.success || !geocodeResponse.data) {
        throw new Error(geocodeResponse.error || 'Geocode failed');
      }

      const { lat, lng, address } = geocodeResponse.data;
      const normalizedCoords = normalizeLatLng(lat, lng);
      if (!normalizedCoords) {
        throw new Error('Invalid coordinates in geocode response');
      }
      setSearchValue(address || result.description);
      setLocation(normalizedCoords);
      safeOnChange(address || result.description, normalizedCoords);
      setShowSuggestions(false);
      sessionTokenRef.current = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      if (onClose) onClose();
    } catch (error) {
      console.error('🔍 Error geocoding selected location:', error);
      Alert.alert('خطأ', 'تعذر تحديد هذا الموقع. حاول مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  // الحصول على الموقع الحالي
  const getCurrentLocation = async () => {
    try {
      setIsLoading(true);
      console.log('📍 Starting getCurrentLocation...');
      // safety timeout to avoid infinite spinner if OS never returns
      if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = setTimeout(() => {
        console.warn('📍 Location request timed out (safety timeout).');
        setIsLoading(false);
      }, 15000);
      
      // التحقق من الأذونات
      let hasPermission = false;
      
      if (Platform.OS === 'android') {
        const fineLocationGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        const coarseLocationGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
        
        if (fineLocationGranted || coarseLocationGranted) {
          hasPermission = true;
        } else {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'أذونات الموقع',
              message: 'يحتاج التطبيق للوصول لموقعك الحالي',
              buttonNeutral: 'اسألني لاحقاً',
              buttonNegative: 'رفض',
              buttonPositive: 'موافق',
            }
          );
          hasPermission = result === PermissionsAndroid.RESULTS.GRANTED;
        }
      } else {
        hasPermission = true;
      }

      if (!hasPermission) {
        Alert.alert('أذونات الموقع مطلوبة', 'يحتاج التطبيق للوصول لموقعك لاستخدام هذه الميزة.');
        if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
        setIsLoading(false);
        return;
      }

      // الحصول على الموقع
      Geolocation.getCurrentPosition(
        async (position) => {
          console.log('📍 Position received:', position);
          const { latitude, longitude } = position.coords;
          const coords = { lat: latitude, lng: longitude };

          // جرّب الحصول على عنوان مقروء، وإلا احتفظ بما كتبه المستخدم أو استخدم موقع الخريطة العام
          let displayName: string | undefined = undefined;
          try {
            const resp = await apiService.mapsReverseGeocode({
              lat: latitude,
              lng: longitude,
              language: 'ar',
            });
            if (resp.success && resp.data?.address) {
              displayName = resp.data.address;
            }
          } catch (geoErr) {
            console.error('🔍 Error reverse geocoding current location:', geoErr);
          }

          // لو فشل العنوان، استخدم آخر نص أدخله المستخدم (إن لم يكن إحداثيات) قبل اللجوء للنص العام
          const fallbackText =
            (!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(searchValue) && searchValue) ||
            undefined;

          const finalText = prettifyName(displayName || fallbackText || '', coords);

          setSearchValue(finalText);
          setLocation(coords);
          safeOnChange(finalText, coords);

          Alert.alert('نجح!', `تم الحصول على موقعك`);
          if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
          locationTimeoutRef.current = null;
          setIsLoading(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          let errorMessage = 'تعذر الحصول على الموقع الحالي';
          
          switch (error.code) {
            case 1:
              errorMessage = 'تم رفض الوصول للموقع. يرجى السماح بالوصول للموقع في إعدادات التطبيق.';
              break;
            case 2:
              errorMessage = 'خطأ في الحصول على الموقع. تأكد من تفعيل خدمة الموقع.';
              break;
            case 3:
              errorMessage = 'انتهت مهلة الحصول على الموقع. حاول مرة أخرى.';
              break;
          }
          Alert.alert('خطأ', errorMessage);
          if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
          locationTimeoutRef.current = null;
          setIsLoading(false);
        },
        {
          // Casual map viewing doesn't need sub-10m precision; false keeps the
          // GPS chip cool and drops battery cost significantly.
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
        }
      );
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('خطأ', 'تعذر الحصول على الموقع الحالي');
      if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
      setIsLoading(false);
    }
  };

  // معالجة اختيار موقع من الخريطة
  const handleMapLocationSelect = (locationData: { lat: number; lng: number; name: string }) => {
    console.log('📍 Map location selected:', locationData);
    const coords = normalizeLatLng(locationData.lat, locationData.lng);
    if (!coords) {
      if (__DEV__) {
        console.warn('MapLocationPicker: received invalid map coordinates', locationData);
      }
      return;
    }
    const prettyName = prettifyName(
      locationData.name || searchValue || value,
      coords
    );
    setSearchValue(prettyName);
    setLocation(coords);
    safeOnChange(prettyName, coords);
    setIsLoading(false);
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (locationTimeoutRef.current) {
        clearTimeout(locationTimeoutRef.current);
        locationTimeoutRef.current = null;
      }
      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current);
        onChangeTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <View style={[styles.container, showHeader && styles.containerFullScreen]}>
      {showHeader && (
        <View style={[styles.pickerHeader, { paddingTop: Platform.OS === 'ios' ? insets.top + 10 : 50 }]}>
          <TouchableOpacity
            style={styles.pickerHeaderBack}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="رجوع"
          >
            <AppIcon name="close" size={IconSize.md} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.pickerHeaderTitle}>اختر الموقع</Text>
          <View style={styles.placeholder} />
        </View>
      )}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchValue}
          onChangeText={handleInputChange}
          placeholder={placeholder}
          placeholderTextColor="#95a5a6"
        />
        
        {/* زر الموقع الحالي */}
        <TouchableOpacity
          style={[styles.locationButton, isLoading && styles.buttonDisabled]}
          onPress={getCurrentLocation}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppIcon name="location" size={18} color="#fff" />
          )}
        </TouchableOpacity>

        {/* زر الخريطة */}
        {showMap && (
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => setShowMapView(!showMapView)}
          >
            <AppIcon name="map" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* قائمة الاقتراحات */}
      {showSuggestions && searchResults.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {searchResults.map((result, index) => (
            <TouchableOpacity
              key={`${result.place_id}-${index}`}
              style={styles.suggestionItem}
              onPress={() => selectLocation(result)}
            >
              <View style={styles.suggestionRow}>
                <AppIcon name="location" size={15} color="#02B7B4" />
                <Text style={styles.suggestionText}>{result.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* الخريطة العادية */}
      {showMapView && showMap && !showFullScreenMap && (
        <View style={styles.mapContainer}>
          <MapViewComponent
            onLocationSelect={handleMapLocationSelect}
            initialLocation={location || undefined}
            height={250}
          />
          {/* أزرار التحكم في الخريطة */}
          <View style={styles.mapControls}>
            <TouchableOpacity
              style={styles.fullScreenButton}
              onPress={() => setShowFullScreenMap(true)}
            >
              <View style={styles.mapControlLabel}>
                <AppIcon name="expand" size={14} color="#fff" />
                <Text style={styles.fullScreenButtonText}>تكبير</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeMapButton}
              onPress={() => setShowMapView(false)}
            >
              <Text style={styles.closeMapButtonText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* زر تأكيد الموقع بعد اختياره */}
      {location && !isLoading && (
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => {
            const finalText = prettifyName(
              searchValue || `${location.lat}, ${location.lng}`,
              location
            );
            safeOnChange(finalText, location);
            Alert.alert('تم الحفظ', 'تم تأكيد موقعك للاستخدام في الطلب.');
            if (locationTimeoutRef.current) {
              clearTimeout(locationTimeoutRef.current);
              locationTimeoutRef.current = null;
            }
            setIsLoading(false);
            if (onClose) onClose();
          }}
        >
          <Text style={styles.confirmButtonText}>تأكيد الموقع</Text>
        </TouchableOpacity>
      )}

      {/* الخريطة في وضع ملء الشاشة */}
      <Modal
        visible={showFullScreenMap}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.fullScreenMapContainer}>
          <View style={[styles.fullScreenMapHeader, { paddingTop: Platform.OS === 'ios' ? insets.top + 10 : 50 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowFullScreenMap(false)}
            >
              <Text style={styles.backButtonText}>← رجوع</Text>
            </TouchableOpacity>
            <Text style={styles.fullScreenMapTitle}>اختر موقعك</Text>
            <View style={styles.placeholder} />
          </View>
          
          <View style={styles.fullScreenMapContent}>
            <MapViewComponent
              onLocationSelect={(locationData) => {
                handleMapLocationSelect(locationData);
                setShowFullScreenMap(false);
                setShowMapView(false);
              }}
              initialLocation={location || undefined}
              height={Dimensions.get('window').height - 100}
            />
          </View>
        </View>
      </Modal>

      {/* مؤشر التحميل */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#02B7B4" />
          <Text style={styles.loadingText}>جارٍ البحث...</Text>
        </View>
      )}

      {/* تعليمات الاستخدام */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsText}>
          اكتب للبحث، استخدم زر الموقع الحالي، أو افتح الخريطة لتحديد المكان.
        </Text>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  containerFullScreen: {
    flex: 1,
    backgroundColor: '#fff',
    marginBottom: 0,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#02B7B4',
  },
  pickerHeaderBack: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerHeaderTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#2c3e50',
    textAlign: 'right',
    paddingVertical: 4,
  },
  locationButton: {
    backgroundColor: '#02B7B4',
    borderRadius: 8,
    padding: 8,
    marginLeft: 8,
  },
  mapButton: {
    backgroundColor: '#27ae60',
    borderRadius: 8,
    padding: 8,
    marginLeft: 5,
  },
  confirmButton: {
    marginTop: 12,
    backgroundColor: '#02B7B4',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#02B7B4',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    marginTop: 8,
    maxHeight: 200,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  suggestionItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#2c3e50',
    textAlign: 'right',
  },
  mapContainer: {
    marginTop: 10,
    position: 'relative',
  },
  mapControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 10,
  },
  fullScreenButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 1000,
  },
  mapControlLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fullScreenButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeMapButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 1000,
  },
  closeMapButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fullScreenMapContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fullScreenMapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#02B7B4',
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fullScreenMapTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },
  fullScreenMapContent: {
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#7f8c8d',
  },
  instructionsContainer: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  instructionsText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
});

export default MapLocationPicker;
