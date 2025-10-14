import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';

import { apiService, Pet } from '../../services/api';
import PetDetailsScreen from './PetDetailsScreen';
import BreedingRequestScreen from '../breeding-request/BreedingRequestScreen';

const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };
const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=400&q=80';

// Filter options
const PET_TYPE_OPTIONS: Array<{ id: 'all' | 'dogs' | 'cats'; label: string; icon: string }> = [
  { id: 'all', label: 'الكل', icon: '🐾' },
  { id: 'dogs', label: 'كلاب', icon: '🐕' },
  { id: 'cats', label: 'قطط', icon: '🐱' },
];

const GENDER_OPTIONS: Array<{ id: 'all' | 'male' | 'female'; label: string; icon: string }> = [
  { id: 'all', label: 'الجميع', icon: '⚥' },
  { id: 'male', label: 'ذكور', icon: '♂️' },
  { id: 'female', label: 'إناث', icon: '♀️' },
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

type MarkerData = {
  id: number;
  name: string;
  breed: string;
  gender: string;
  age: string;
  lat: number;
  lng: number;
  image: string;
};

const getImageUrl = (url?: string) => {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return DEFAULT_IMAGE;
  }
  let normalized = url.trim();
  normalized = normalized.replace('http://', 'https://');
  if (normalized.startsWith('https:/') && !normalized.startsWith('https://')) {
    normalized = normalized.replace('https:/', 'https://');
  }
  if (normalized.includes('https:/.petow.app')) {
    normalized = normalized.replace(/https:\/\/.?petow\.app/g, 'https://api.petow.app');
  }
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://api.petow.app${normalized.startsWith('/') ? '' : '/'}${normalized}`;
  }
  if (normalized.includes('/api/media/')) {
    normalized = normalized.replace('/api/media/', '/media/');
  }
  return normalized;
};

const generateMapHtml = (center: { lat: number; lng: number }, markers: MarkerData[]) => {
  const markersEncoded = encodeURIComponent(JSON.stringify(markers));

  return `<!DOCTYPE html>
  <html lang="ar">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
      <style>
        html, body, #map { height: 100%; margin: 0; padding: 0; }
        .leaflet-container { font-family: 'Helvetica Neue', Arial, sans-serif; }
        .pet-marker .marker-icon {
          width: 36px;
          height: 36px;
          border-radius: 18px;
          overflow: hidden;
          border: 2px solid rgba(255,255,255,0.95);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.25);
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pet-marker .marker-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .user-marker .user-dot {
          width: 22px;
          height: 22px;
          border-radius: 11px;
          background: #02B7B4;
          border: 4px solid rgba(2,183,180,0.35);
          box-shadow: 0 4px 12px rgba(2,183,180,0.35);
        }
        .popup {
          text-align: center;
          font-size: 14px;
          min-width: 120px;
        }
        .popup strong {
          display: block;
          margin-bottom: 4px;
          color: #1e293b;
        }
        .popup span {
          display: block;
          color: #64748b;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
      <script>
        const markers = JSON.parse(decodeURIComponent('${markersEncoded}'));
        const initialCenter = ${JSON.stringify(center)};
        let map;
        let userMarker;
        let clusterGroup;

        function addOrUpdateUserMarker(lat, lng) {
          if (!map) return;
          const userIcon = L.divIcon({
            className: 'user-marker',
            html: '<div class="user-dot"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          if (userMarker) {
            userMarker.setLatLng([lat, lng]);
          } else {
            userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
          }
        }

        function init() {
          map = L.map('map', { zoomControl: false }).setView([initialCenter.lat, initialCenter.lng], 12);
          L.control.zoom({ position: 'bottomright' }).addTo(map);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);

          if (initialCenter && initialCenter.lat && initialCenter.lng) {
            addOrUpdateUserMarker(initialCenter.lat, initialCenter.lng);
          }

          clusterGroup = L.markerClusterGroup({ disableClusteringAtZoom: 15, maxClusterRadius: 60 });
          map.addLayer(clusterGroup);

          // Chunk marker creation to avoid blocking the UI thread
          let i = 0;
          const batchSize = 100;
          function addBatch() {
            const end = Math.min(i + batchSize, markers.length);
            for (; i < end; i++) {
              const m = markers[i];
              const icon = L.divIcon({
                className: 'pet-marker',
                html: '<div class="marker-icon"><img src="' + (m.image || '')
                  .replace(/"/g, '&quot;') + '" alt="' + (m.name || '')
                  .replace(/"/g, '&quot;') + '" /></div>',
                iconSize: [36, 36],
                iconAnchor: [18, 28],
                popupAnchor: [0, -22],
              });

              const leafletMarker = L.marker([m.lat, m.lng], { icon });
              const popupHtml = \`<div class="popup"><strong>\${m.name}</strong><span>\${m.breed}</span><span>\${m.gender} • \${m.age}</span></div>\`;
              leafletMarker.bindPopup(popupHtml);
              leafletMarker.on('click', () => {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectPet', petId: m.id }));
                }
              });
              clusterGroup.addLayer(leafletMarker);
            }
            if (i < markers.length) {
              (window.requestAnimationFrame || setTimeout)(addBatch, 16);
            }
          }
          addBatch();

          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
          }
        }

        function handleMessage(event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'centerMap' && map) {
              map.flyTo([data.lat, data.lng], data.zoom || map.getZoom());
              addOrUpdateUserMarker(data.lat, data.lng);
            }
          } catch (error) {
            console.error('Map message error:', error);
          }
        }

        // Expose a safe bridge for React Native to call into WebView
        window.receiveFromNative = function (payload) {
          try {
            const evt = { data: JSON.stringify(payload) };
            handleMessage(evt);
          } catch (e) {
            console.error('receiveFromNative error', e);
          }
        };

        document.addEventListener('DOMContentLoaded', init);
        document.addEventListener('message', handleMessage);
        window.addEventListener && window.addEventListener('message', handleMessage);
      </script>
    </body>
  </html>`;
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

const PetMapScreen: React.FC = () => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [focusedPet, setFocusedPet] = useState<Pet | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [breedingPetId, setBreedingPetId] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Filter states
  const [petType, setPetType] = useState<'all' | 'dogs' | 'cats'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [ageFilter, setAgeFilter] = useState<typeof AGE_OPTIONS[number]['id']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCount, setFilterCount] = useState(0);

  const webViewRef = useRef<WebView | null>(null);
  const pendingCenterRef = useRef<{ lat: number; lng: number } | null>(DEFAULT_CENTER);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Filter count calculation
  useEffect(() => {
    let count = 0;
    if (petType !== 'all') count++;
    if (genderFilter !== 'all') count++;
    if (ageFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    setFilterCount(count);
  }, [petType, genderFilter, ageFilter, searchQuery]);

  // Parse age to months helper
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

  // Filter pets based on current filters
  const filteredPets = useMemo(() => {
    return pets.filter((pet) => {
      // Pet type filter
      if (petType !== 'all' && pet.pet_type !== petType) return false;

      // Gender filter
      if (genderFilter !== 'all') {
        const g = genderFilter === 'male' ? 'M' : 'F';
        if (pet.gender !== g) return false;
      }

      // Age filter
      if (ageFilter !== 'all') {
        const range = AGE_RANGES[ageFilter];
        const months = typeof pet.age_months === 'number' ? pet.age_months : parseAgeToMonths(pet.age_display);
        if (months === null) return false;
        if (typeof range.min === 'number' && months < range.min) return false;
        if (typeof range.max === 'number' && months > range.max) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableText = `${pet.name} ${pet.breed_name} ${pet.pet_type_display} ${pet.gender_display}`.toLowerCase();
        if (!searchableText.includes(query)) return false;
      }

      return true;
    });
  }, [pets, petType, genderFilter, ageFilter, searchQuery]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setPetType('all');
    setGenderFilter('all');
    setAgeFilter('all');
    setSearchQuery('');
  }, []);

  const markers = useMemo<MarkerData[]>(() => {
    return filteredPets
      .map((pet) => {
        // Prefer numeric latitude/longitude if present
        const lat = pet.latitude !== undefined && pet.latitude !== null ? Number(pet.latitude) : NaN;
        const lng = pet.longitude !== undefined && pet.longitude !== null ? Number(pet.longitude) : NaN;

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return {
            id: pet.id,
            name: pet.name,
            breed: pet.breed_name || 'غير محدد',
            gender: pet.gender_display,
            age: pet.age_display,
            lat,
            lng,
              image: getImageUrl(pet.main_image),
          } as MarkerData;
        }

        // If no numeric coords, try to parse from location string
        if (typeof pet.location === 'string') {
          const m = pet.location.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
          if (m) {
            const lat2 = parseFloat(m[1]);
            const lng2 = parseFloat(m[2]);
            if (Number.isFinite(lat2) && Number.isFinite(lng2)) {
              return {
                id: pet.id,
                name: pet.name,
                breed: pet.breed_name || 'غير محدد',
                gender: pet.gender_display,
                age: pet.age_display,
                lat: lat2,
                lng: lng2,
                image: getImageUrl(pet.main_image),
              } as MarkerData;
            }
          }
        }

        return null;
      })
      .filter((marker): marker is MarkerData => Boolean(marker));
  }, [filteredPets]);

  const mapHtml = useMemo(() => generateMapHtml(DEFAULT_CENTER, markers), [markers]);

  const sendCenterToMap = useCallback(
    (coords: { lat: number; lng: number }, zoom = 13) => {
      if (webViewRef.current && mapReady) {
        // Prefer calling a JS bridge to avoid message listeners being unreliable
        const js = `window.receiveFromNative && window.receiveFromNative({ type: 'centerMap', lat: ${coords.lat}, lng: ${coords.lng}, zoom: ${zoom} });`;
        webViewRef.current.injectJavaScript(js);
      } else {
        pendingCenterRef.current = coords;
      }
    },
    [mapReady]
  );

  const loadPets = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      // Fetch all pets across pages
      const response = await apiService.getAllPets({ ordering: '-created_at', page_size: 200 });

      if (response.success && response.data) {
        setPets(response.data);
      } else {
        setErrorMessage('تعذر تحميل الحيوانات على الخريطة. حاول مرة أخرى لاحقاً.');
      }
    } catch (error) {
      console.error('Error loading pets for map:', error);
      setErrorMessage('حدث خطأ أثناء تحميل البيانات. تحقق من الاتصال بالإنترنت.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserLocation = useCallback(async () => {
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
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
          pendingCenterRef.current = coords;
          sendCenterToMap(coords);
        },
        (error) => {
          console.warn('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  }, [sendCenterToMap]);

  useEffect(() => {
    loadPets();
    fetchUserLocation();
  }, [loadPets, fetchUserLocation]);

  useEffect(() => {
    userLocationRef.current = userLocation;
    if (userLocation) {
      pendingCenterRef.current = userLocation;
      sendCenterToMap(userLocation);
    }
  }, [userLocation, sendCenterToMap]);

  useEffect(() => {
    pendingCenterRef.current = userLocationRef.current || DEFAULT_CENTER;
    setMapReady(false);
  }, [markers]);

  useEffect(() => {
    if (mapReady && pendingCenterRef.current) {
      sendCenterToMap(pendingCenterRef.current);
      pendingCenterRef.current = null;
    }
  }, [mapReady, sendCenterToMap]);

  const handleMapMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapReady') {
          setMapReady(true);
        }

        if (data.type === 'selectPet') {
          const pet = pets.find((item) => item.id === data.petId);
          if (pet) {
            setFocusedPet(pet);
            const petLat = pet.latitude !== undefined && pet.latitude !== null ? Number(pet.latitude) : NaN;
            const petLng = pet.longitude !== undefined && pet.longitude !== null ? Number(pet.longitude) : NaN;
            if (Number.isFinite(petLat) && Number.isFinite(petLng)) {
              sendCenterToMap({ lat: petLat, lng: petLng }, 15);
            }
          }
        }
      } catch (error) {
        console.error('Failed to parse map message:', error);
      }
    },
    [pets, sendCenterToMap]
  );

  const handleRecenter = useCallback(() => {
    if (userLocationRef.current) {
      const target = userLocationRef.current;
      pendingCenterRef.current = target;
      sendCenterToMap(target);
    } else {
      // If we don't yet have a location, request it now
      fetchUserLocation();
    }
  }, [sendCenterToMap, fetchUserLocation]);

  const handleViewDetails = useCallback(
    (pet: Pet) => {
      setFocusedPet(null);
      setSelectedPetId(pet.id);
    },
    []
  );

  const handleRequestBreeding = useCallback(
    (pet: Pet) => {
      setFocusedPet(null);
      setBreedingPetId(pet.id);
    },
    []
  );

  if (breedingPetId) {
    return (
      <BreedingRequestScreen
        petId={breedingPetId}
        onClose={() => setBreedingPetId(null)}
        onOpenPetDetails={(pid) => {
          setBreedingPetId(null);
          setTimeout(() => setSelectedPetId(pid), 150);
        }}
      />
    );
  }

  if (selectedPetId) {
    return (
      <PetDetailsScreen
        petId={selectedPetId}
        onClose={() => setSelectedPetId(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        originWhitelist={["*"]}
        style={styles.map}
        onMessage={handleMapMessage}
      />

      {/* Modern Filter Bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث بالاسم أو السلالة..."
            placeholderTextColor="#95a5a6"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Text style={styles.searchIcon}>🔍</Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.filterButton, filterCount > 0 && styles.filterButtonActive]} 
          onPress={() => setShowFilters(true)}
        >
          <Text style={styles.filterIcon}>⚙️</Text>
          <Text style={styles.filterText}>فلاتر</Text>
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>


      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>جاري تحميل الحيوانات القريبة...</Text>
        </View>
      )}

      {!!errorMessage && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>⚠️ {errorMessage}</Text>
          <TouchableOpacity style={styles.bannerAction} onPress={loadPets}>
            <Text style={styles.bannerActionText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      )}

      {focusedPet && (
        <View style={styles.petCard}>
          <View style={styles.cardHeader}>
            <Image source={{ uri: getImageUrl(focusedPet.main_image) }} style={styles.petImage} />
            <View style={styles.cardInfo}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.petName}>{focusedPet.name}</Text>
                <TouchableOpacity onPress={() => setFocusedPet(null)}>
                  <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.petBreed}>{focusedPet.breed_name}</Text>
              <Text style={styles.petLocation}>📍 {focusedPet.location || 'غير محدد'}</Text>
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
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => handleViewDetails(focusedPet)}
            >
              <Text style={styles.secondaryButtonText}>عرض التفاصيل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => handleRequestBreeding(focusedPet)}
            >
              <Text style={styles.primaryButtonText}>💖 طلب تزاوج</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Filter Modal */}
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
              {/* Pet Type Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>نوع الحيوان</Text>
                <View style={styles.filterChips}>
                  {PET_TYPE_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.filterChip,
                        petType === option.id && styles.filterChipActive
                      ]}
                      onPress={() => setPetType(option.id)}
                    >
                      <Text style={styles.filterChipIcon}>{option.icon}</Text>
                      <Text style={[
                        styles.filterChipText,
                        petType === option.id && styles.filterChipTextActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Gender Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>الجنس</Text>
                <View style={styles.filterChips}>
                  {GENDER_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.filterChip,
                        genderFilter === option.id && styles.filterChipActive
                      ]}
                      onPress={() => setGenderFilter(option.id)}
                    >
                      <Text style={styles.filterChipIcon}>{option.icon}</Text>
                      <Text style={[
                        styles.filterChipText,
                        genderFilter === option.id && styles.filterChipTextActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Age Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>العمر</Text>
                <View style={styles.filterChips}>
                  {AGE_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.filterChip,
                        ageFilter === option.id && styles.filterChipActive
                      ]}
                      onPress={() => setAgeFilter(option.id)}
                    >
                      <Text style={[
                        styles.filterChipText,
                        ageFilter === option.id && styles.filterChipTextActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.clearButton} onPress={clearAllFilters}>
                <Text style={styles.clearButtonText}>مسح الكل</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.applyButton} 
                onPress={() => setShowFilters(false)}
              >
                <Text style={styles.applyButtonText}>تطبيق الفلاتر</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  map: {
    flex: 1,
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
  },
  loadingText: {
    marginTop: 16,
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBanner: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
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
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
  },
  petImage: {
    width: 88,
    height: 88,
    borderRadius: 18,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeIcon: {
    fontSize: 18,
    color: '#94a3b8',
  },
  petBreed: {
    color: '#64748b',
    marginTop: 4,
  },
  petLocation: {
    color: '#475569',
    marginTop: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 6,
  },
  badge: {
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1e293b',
    fontWeight: '600',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#667eea',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // Filter Bar Styles
  filterBar: {
    position: 'absolute',
    top: 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    paddingRight: 6,
  },
  searchIcon: { fontSize: 16, color: '#64748b' },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    position: 'relative',
  },
  filterButtonActive: {
    backgroundColor: '#667eea',
  },
  filterIcon: { fontSize: 14, marginRight: 4 },
  filterText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Filter Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  filterModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  filterCloseIcon: {
    fontSize: 24,
    color: '#64748b',
    padding: 4,
  },
  filterContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  filterChipIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  applyButton: {
    flex: 1,
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default PetMapScreen;
