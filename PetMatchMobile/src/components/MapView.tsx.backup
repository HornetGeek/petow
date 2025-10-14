import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';

interface MapViewProps {
  onLocationSelect?: (location: { lat: number; lng: number; name: string }) => void;
  initialLocation?: { lat: number; lng: number };
  height?: number;
}

const MapViewComponent: React.FC<MapViewProps> = ({ 
  onLocationSelect, 
  initialLocation,
  height = 300 
}) => {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(
    initialLocation || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [locationName, setLocationName] = useState<string>('');
  const [mapKey, setMapKey] = useState(0); // لإعادة تحميل الخريطة
  const webViewRef = useRef<WebView>(null);

  // HTML للخريطة باستخدام Leaflet
  const generateMapHTML = (lat: number, lng: number) => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <title>Leaflet Map</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
            body { 
                margin: 0; 
                padding: 0; 
                overflow: hidden;
                touch-action: manipulation;
            }
            #map { 
                height: 100vh; 
                width: 100vw; 
                cursor: pointer;
            }
            .leaflet-control-custom {
                background: white !important;
                border: 2px solid #ccc !important;
                border-radius: 4px !important;
                cursor: pointer !important;
                font-size: 18px !important;
                text-align: center !important;
                line-height: 36px !important;
            }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
            let map, marker;
            
            function initMap() {
                // إنشاء الخريطة
                map = L.map('map', {
                    zoomControl: true,
                    scrollWheelZoom: true,
                    doubleClickZoom: true,
                    boxZoom: true,
                    keyboard: true,
                    dragging: true,
                    touchZoom: true
                }).setView([${lat}, ${lng}], 13);
                
                // إضافة طبقة الخريطة
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);
                
                // إضافة علامة للموقع
                marker = L.marker([${lat}, ${lng}]).addTo(map);
                marker.bindPopup('الموقع المحدد').openPopup();
                
                // معالجة النقر على الخريطة
                map.on('click', function(e) {
                    try {
                        const lat = e.latlng.lat;
                        const lng = e.latlng.lng;
                        
                        // إزالة العلامة القديمة
                        if (marker) {
                            map.removeLayer(marker);
                        }
                        
                        // إضافة علامة جديدة
                        marker = L.marker([lat, lng]).addTo(map);
                        marker.bindPopup('الموقع الجديد').openPopup();
                        
                        // إرسال البيانات للتطبيق
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'locationSelected',
                                lat: lat,
                                lng: lng
                            }));
                        }
                    } catch (error) {
                        console.error('Error handling map click:', error);
                    }
                });
                
                // إضافة زر للعودة للموقع الحالي
                const currentLocationButton = L.control({position: 'topright'});
                currentLocationButton.onAdd = function(map) {
                    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                    div.style.width = '40px';
                    div.style.height = '40px';
                    div.innerHTML = '📍';
                    div.title = 'موقعي الحالي';
                    
                    div.onclick = function(e) {
                        e.stopPropagation();
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'getCurrentLocation'
                            }));
                        }
                    };
                    
                    return div;
                };
                currentLocationButton.addTo(map);
                
                // منع إغلاق الخريطة عند النقر
                map.getContainer().addEventListener('click', function(e) {
                    e.stopPropagation();
                });
            }
            
            // تهيئة الخريطة عند تحميل الصفحة
            document.addEventListener('DOMContentLoaded', initMap);
        </script>
    </body>
    </html>
  `;

  // الحصول على الموقع الحالي
  const getCurrentLocation = async () => {
    try {
      setIsLoading(true);
      
      // التحقق من الأذونات
      let hasPermission = false;
      
      if (Platform.OS === 'android') {
        const fineLocationGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        const coarseLocationGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
        
        if (fineLocationGranted || coarseLocationGranted) {
          hasPermission = true;
        } else {
          // طلب الأذونات - هذا سيظهر نافذة النظام
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'أذونات الموقع',
              message: 'يحتاج التطبيق للوصول لموقعك الحالي لعرض الخريطة',
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
        Alert.alert(
          'أذونات الموقع مطلوبة',
          'يحتاج التطبيق للوصول لموقعك لاستخدام ميزة الخريطة. يرجى السماح بالوصول للموقع في إعدادات التطبيق.',
          [
            { text: 'موافق', style: 'default' }
          ]
        );
        setIsLoading(false);
        return;
      }

      // الحصول على الموقع
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = { lat: latitude, lng: longitude };
          
          setCurrentLocation(newLocation);
          
          try {
            // البحث العكسي للحصول على اسم المكان
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ar,en`
            );
            
            if (response.ok) {
              const result = await response.json();
              const name = result.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
              setLocationName(name);
              
              if (onLocationSelect) {
                onLocationSelect({ lat: latitude, lng: longitude, name });
              }
            }
          } catch (error) {
            console.error('Error reverse geocoding:', error);
            const name = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setLocationName(name);
            
            if (onLocationSelect) {
              onLocationSelect({ lat: latitude, lng: longitude, name });
            }
          }
          
          // إعادة تحميل الخريطة بالموقع الجديد
          setMapKey(prev => prev + 1);
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

  // معالجة الرسائل من WebView
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'locationSelected') {
        const { lat, lng } = data;
        const newLocation = { lat, lng };
        setCurrentLocation(newLocation);
        
        // البحث العكسي للحصول على اسم المكان
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar,en`
        )
        .then(response => response.json())
        .then(result => {
          const name = result.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          setLocationName(name);
          
          if (onLocationSelect) {
            onLocationSelect({ lat, lng, name });
          }
        })
        .catch(error => {
          console.error('Error reverse geocoding:', error);
          const name = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          setLocationName(name);
          
          if (onLocationSelect) {
            onLocationSelect({ lat, lng, name });
          }
        });
      } else if (data.type === 'getCurrentLocation') {
        getCurrentLocation();
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  // معالجة أخطاء WebView
  const handleWebViewError = (error: any) => {
    console.error('WebView error:', error);
  };

  // الحصول على الموقع عند تحميل المكون
  useEffect(() => {
    if (!initialLocation) {
      getCurrentLocation();
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator size="large" color="#02B7B4" />
        <Text style={styles.loadingText}>جاري تحميل الخريطة...</Text>
      </View>
    );
  }

  const mapLat = currentLocation?.lat || 24.7136; // الرياض كموقع افتراضي
  const mapLng = currentLocation?.lng || 46.6753;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        key={mapKey} // إعادة تحميل الخريطة عند تغيير المفتاح
        ref={webViewRef}
        source={{ html: generateMapHTML(mapLat, mapLng) }}
        style={styles.webView}
        onMessage={handleWebViewMessage}
        onError={handleWebViewError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        bounces={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onShouldStartLoadWithRequest={() => true}
      />
      
      {locationName && (
        <View style={styles.locationInfo}>
          <Text style={styles.locationText}>📍 {locationName}</Text>
        </View>
      )}
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
  webView: {
    flex: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  locationInfo: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 8,
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#2c3e50',
    textAlign: 'center',
  },
});

export default MapViewComponent;
