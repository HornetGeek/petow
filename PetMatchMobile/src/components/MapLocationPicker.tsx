import React, { useState, useEffect, useRef } from 'react';
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

interface MapLocationPickerProps {
  value?: string;
  onChange: (location: string, coordinates?: { lat: number; lng: number }) => void;
  placeholder?: string;
  showMap?: boolean;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
}

const MapLocationPicker: React.FC<MapLocationPickerProps> = ({ 
  value = '', 
  onChange, 
  placeholder = 'ابحث عن موقعك',
  showMap = true
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchValue, setSearchValue] = useState(value);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showMapView, setShowMapView] = useState(false);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize searchValue with value prop
  useEffect(() => {
    setSearchValue(value);
  }, [value]);

  // البحث في OpenStreetMap Nominatim API
  const searchLocation = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    try {
      console.log('🔍 Searching for:', query);
      setIsLoading(true);
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=ar,en&countrycodes=eg,sa,ae,jo,lb,kw,qa,bh,om,ma,tn,dz,ly,sd,so,ye,iq,sy,ps,lb,jo,sa,ae,kw,qa,bh,om,ma,tn,dz,ly,sd,so,ye,iq,sy,ps`
      );
      
      if (response.ok) {
        const results: SearchResult[] = await response.json();
        console.log('🔍 Search results:', results);
        setSearchResults(results);
        setShowSuggestions(true);
      } else {
        console.log('🔍 Search failed with status:', response.status);
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
    onChange(text);

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
  const selectLocation = (result: SearchResult) => {
    console.log('🔍 Location selected:', result);
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    setSearchValue(result.display_name);
    setLocation({ lat, lng });
    onChange(result.display_name, { lat, lng });
    setShowSuggestions(false);
  };

  // الحصول على الموقع الحالي
  const getCurrentLocation = async () => {
    try {
      setIsLoading(true);
      console.log('📍 Starting getCurrentLocation...');
      
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
        setIsLoading(false);
        return;
      }

      // الحصول على الموقع
      Geolocation.getCurrentPosition(
        async (position) => {
          console.log('📍 Position received:', position);
          const { latitude, longitude } = position.coords;
          
          // استخدام الإحداثيات مباشرة بدون reverse geocoding
          const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          console.log('📍 Using coordinates directly:', coords);
          
          setSearchValue(coords);
          setLocation({ lat: latitude, lng: longitude });
          onChange(coords, { lat: latitude, lng: longitude });
          
          console.log('📍 Updated searchValue to coords:', coords);
          Alert.alert('نجح!', `تم الحصول على الموقع: ${coords}`);
          
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
          setIsLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('خطأ', 'تعذر الحصول على الموقع الحالي');
      setIsLoading(false);
    }
  };

  // معالجة اختيار موقع من الخريطة
  const handleMapLocationSelect = (locationData: { lat: number; lng: number; name: string }) => {
    console.log('📍 Map location selected:', locationData);
    setSearchValue(locationData.name);
    setLocation({ lat: locationData.lat, lng: locationData.lng });
    onChange(locationData.name, { lat: locationData.lat, lng: locationData.lng });
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* حقل البحث */}
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
            <Text style={styles.locationButtonText}>📍</Text>
          )}
        </TouchableOpacity>

        {/* زر الخريطة */}
        {showMap && (
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => setShowMapView(!showMapView)}
          >
            <Text style={styles.mapButtonText}>🗺️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* قائمة الاقتراحات */}
      {showSuggestions && searchResults.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {searchResults.map((result, index) => (
            <TouchableOpacity
              key={`${result.lat}-${result.lon}-${index}`}
              style={styles.suggestionItem}
              onPress={() => selectLocation(result)}
            >
              <Text style={styles.suggestionText}>
                📍 {result.display_name}
              </Text>
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
              <Text style={styles.fullScreenButtonText}>🔍 تكبير</Text>
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

      {/* الخريطة في وضع ملء الشاشة */}
      <Modal
        visible={showFullScreenMap}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.fullScreenMapContainer}>
          <View style={styles.fullScreenMapHeader}>
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
          💡 اكتب للبحث، اضغط 📍 للموقع الحالي، أو اضغط 🗺️ لفتح الخريطة
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#2c3e50',
    textAlign: 'right',
  },
  locationButton: {
    backgroundColor: '#02B7B4',
    borderRadius: 8,
    padding: 10,
    marginLeft: 10,
  },
  mapButton: {
    backgroundColor: '#27ae60',
    borderRadius: 8,
    padding: 10,
    marginLeft: 5,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  mapButtonText: {
    color: '#fff',
    fontSize: 16,
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
  suggestionText: {
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
    padding: 20,
    backgroundColor: '#02B7B4',
    paddingTop: 50,
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
