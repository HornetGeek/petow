import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import MapView, { MapPressEvent, Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT, Region } from 'react-native-maps';

import { apiService } from '../services/api';
import { normalizeLatLng } from '../utils/coordinates';
import AppIcon from './icons/AppIcon';

interface MapViewProps {
  onLocationSelect?: (location: { lat: number; lng: number; name: string }) => void;
  initialLocation?: { lat: number; lng: number };
  height?: number;
}

const DEFAULT_LOCATION = { lat: 31.2001, lng: 29.9187 };
const DEFAULT_DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };

const MapViewComponent: React.FC<MapViewProps> = ({
  onLocationSelect,
  initialLocation,
  height = 300,
}) => {
  const mapRef = useRef<MapView | null>(null);
  const normalizedInitialLocation = useMemo(
    () => normalizeLatLng(initialLocation?.lat, initialLocation?.lng),
    [initialLocation?.lat, initialLocation?.lng],
  );

  const [isLoading, setIsLoading] = useState(!normalizedInitialLocation);
  const [locationName, setLocationName] = useState<string>('');
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(
    normalizedInitialLocation,
  );

  const markerLocation = currentLocation || DEFAULT_LOCATION;

  const initialRegion: Region = useMemo(
    () => ({
      latitude: markerLocation.lat,
      longitude: markerLocation.lng,
      ...DEFAULT_DELTA,
    }),
    [markerLocation.lat, markerLocation.lng],
  );

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      const status = await Geolocation.requestAuthorization('whenInUse');
      return status === 'granted';
    }

    const fineLocationGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    const coarseLocationGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    );
    if (fineLocationGranted || coarseLocationGranted) {
      return true;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'أذونات الموقع',
        message: 'يحتاج التطبيق للوصول لموقعك الحالي لعرض الخريطة',
        buttonNeutral: 'اسألني لاحقاً',
        buttonNegative: 'رفض',
        buttonPositive: 'موافق',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const reverseGeocodeAddress = useCallback(async (lat: number, lng: number): Promise<string> => {
    const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const response = await apiService.mapsReverseGeocode({ lat, lng, language: 'ar' });
    if (!response.success || !response.data?.address) {
      return fallback;
    }
    return response.data.address;
  }, []);

  const setLocationAndNotify = useCallback(
    async (latValue: unknown, lngValue: unknown, notify: boolean = true) => {
      const normalizedLocation = normalizeLatLng(latValue, lngValue);
      if (!normalizedLocation) {
        if (__DEV__) {
          console.warn('MapViewComponent: ignored invalid coordinates', {
            lat: latValue,
            lng: lngValue,
          });
        }
        return;
      }

      const { lat, lng } = normalizedLocation;
      const nextLocation = { lat, lng };
      setCurrentLocation(nextLocation);
      mapRef.current?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          ...DEFAULT_DELTA,
        },
        350,
      );

      let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      try {
        address = await reverseGeocodeAddress(lat, lng);
      } catch (_error) {
        // keep fallback coordinates when reverse-geocoding fails
      }

      setLocationName(address);
      if (notify && onLocationSelect) {
        onLocationSelect({ lat, lng, name: address });
      }
    },
    [onLocationSelect, reverseGeocodeAddress],
  );

  const getCurrentLocation = useCallback(async () => {
    try {
      setIsLoading(true);
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        Alert.alert(
          'أذونات الموقع مطلوبة',
          'يرجى السماح بالوصول للموقع من إعدادات التطبيق.',
        );
        setIsLoading(false);
        return;
      }

      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          await setLocationAndNotify(latitude, longitude);
          setIsLoading(false);
        },
        (error) => {
          let errorMessage = 'تعذر الحصول على الموقع الحالي';
          switch (error.code) {
            case 1:
              errorMessage = 'تم رفض الوصول للموقع. يرجى السماح بالوصول للموقع من الإعدادات.';
              break;
            case 2:
              errorMessage = 'خطأ في الحصول على الموقع. تأكد من تفعيل خدمة الموقع.';
              break;
            case 3:
              errorMessage = 'انتهت مهلة الحصول على الموقع. حاول مرة أخرى.';
              break;
            default:
              break;
          }
          Alert.alert('خطأ', errorMessage);
          setIsLoading(false);
        },
        {
          // Casual map viewing doesn't need sub-10m precision; false keeps the
          // GPS chip from warming up and drops battery cost significantly.
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
        },
      );
    } catch (_error) {
      Alert.alert('خطأ', 'تعذر الحصول على الموقع الحالي');
      setIsLoading(false);
    }
  }, [requestLocationPermission, setLocationAndNotify]);

  const handleMapPress = useCallback(
    async (event: MapPressEvent) => {
      if (!onLocationSelect) {
        return;
      }
      const { latitude, longitude } = event.nativeEvent.coordinate;
      await setLocationAndNotify(latitude, longitude);
    },
    [onLocationSelect, setLocationAndNotify],
  );

  useEffect(() => {
    if (__DEV__ && initialLocation && !normalizedInitialLocation) {
      console.warn('MapViewComponent: invalid initialLocation ignored', initialLocation);
    }
  }, [initialLocation, normalizedInitialLocation]);

  useEffect(() => {
    if (normalizedInitialLocation) {
      setLocationAndNotify(normalizedInitialLocation.lat, normalizedInitialLocation.lng, false).finally(() => {
        setIsLoading(false);
      });
      return;
    }
    getCurrentLocation();
  }, [getCurrentLocation, normalizedInitialLocation, setLocationAndNotify]);

  if (isLoading) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator size="large" color="#02B7B4" />
        <Text style={styles.loadingText}>جاري تحميل الخريطة...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        onPress={handleMapPress}
      >
        <Marker
          coordinate={{ latitude: markerLocation.lat, longitude: markerLocation.lng }}
          draggable={!!onLocationSelect}
          tracksViewChanges={false}
          onDragEnd={async (event) => {
            if (!onLocationSelect) {
              return;
            }
            const { latitude, longitude } = event.nativeEvent.coordinate;
            await setLocationAndNotify(latitude, longitude);
          }}
        />
      </MapView>

      {!!onLocationSelect && (
        <TouchableOpacity style={styles.myLocationButton} onPress={getCurrentLocation}>
          <AppIcon name="location" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      {locationName ? (
        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <AppIcon name="location" size={14} color="#02B7B4" />
            <Text style={styles.locationText}>{locationName}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  myLocationButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#02B7B4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  locationInfo: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.93)',
    padding: 8,
    borderRadius: 8,
    elevation: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    color: '#2c3e50',
  },
});

export default MapViewComponent;
