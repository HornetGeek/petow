'use client';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { LatLng } from 'leaflet';
import React from 'react';

// تحميل الخريطة ديناميكياً لتجنب مشاكل SSR
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

interface MapLocationPickerProps {
  value: string;
  onChange: (location: string, coordinates?: { lat: number; lng: number }) => void;
  placeholder?: string;
}

interface SearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
}

const MapLocationPicker: React.FC<MapLocationPickerProps> = ({ value, onChange, placeholder = 'ابحث عن الموقع...' }) => {
  console.log('MapLocationPicker render with value:', value);
  console.log('MapLocationPicker render with value type:', typeof value);
  console.log('MapLocationPicker render with value length:', value?.length);
  
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([24.7136, 46.6753]); // الرياض كنقطة البداية
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [searchValue, setSearchValue] = useState(value || '');
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mapRef = useRef<any>(null);
  const isInternalUpdate = useRef(false);

  // تهيئة الخريطة عند التحميل
  useEffect(() => {
    if (mapRef.current && typeof mapRef.current.getPane === 'function') {
      // الخريطة جاهزة
      console.log('Map initialized successfully');
    }
  }, []);

  // تحديث الخريطة عند تغيير القيمة من الخارج فقط
  useEffect(() => {
    // تحديث القيمة فقط إذا لم يكن التحديث من الداخل
    if (!isInternalUpdate.current && value !== searchValue) {
    setSearchValue(value);
    }
    isInternalUpdate.current = false;
  }, [value]);

  // البحث في OpenStreetMap Nominatim API (مجاني)
  const searchLocation = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=ar,en`
      );
      
      if (response.ok) {
        const results: SearchResult[] = await response.json();
        setSearchResults(results);
        setShowSuggestions(results.length > 0);
      }
    } catch (error) {
      console.error('Error searching location:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // معالجة تغيير النص في حقل البحث
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    
    // إشارة أن التحديث من الداخل
    isInternalUpdate.current = true;
    onChange(newValue);

    // إلغاء البحث السابق
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // بحث جديد بعد تأخير (بدون تحريك الخريطة)
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(newValue);
    }, 800); // زيادة التأخير لتقليل الطلبات
  };

  // اختيار موقع من نتائج البحث
  const selectLocation = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    setSearchValue(result.display_name);
    
    // إشارة أن التحديث من الداخل
    isInternalUpdate.current = true;
    onChange(result.display_name, { lat, lng });
    
    setMapCenter([lat, lng]);
    setMarkerPosition([lat, lng]);
    setShowSuggestions(false);
    // إزالة setMapKey لمنع إعادة تحميل الخريطة
  };

  // الحصول على الموقع الحالي
  const getCurrentLocation = () => {
    setIsLoading(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          try {
            // البحث العكسي للحصول على اسم المكان
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ar,en`
            );
            
            if (response.ok) {
              const result = await response.json();
              const locationName = result.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
              
              setSearchValue(locationName);
              
              // إشارة أن التحديث من الداخل
              isInternalUpdate.current = true;
              onChange(locationName, { lat: latitude, lng: longitude });
              
              setMapCenter([latitude, longitude]);
              setMarkerPosition([latitude, longitude]);
            }
          } catch (error) {
            console.error('Error reverse geocoding:', error);
            // في حالة فشل البحث العكسي، استخدم الإحداثيات
            const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setSearchValue(coords);
            
            // إشارة أن التحديث من الداخل
            isInternalUpdate.current = true;
            onChange(coords, { lat: latitude, lng: longitude });
            setMapCenter([latitude, longitude]);
            setMarkerPosition([latitude, longitude]);
          }
          
          setIsLoading(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setIsLoading(false);
          alert('تعذر الحصول على الموقع الحالي. تأكد من السماح بالوصول للموقع.');
        }
      );
    } else {
      setIsLoading(false);
      alert('المتصفح لا يدعم خدمة تحديد الموقع');
    }
  };

  // معالجة النقر على الخريطة
  const handleMapClick = async (e: any) => {
    const { lat, lng } = e.latlng;
    
    try {
      setIsLoading(true);
      
      // البحث العكسي
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar,en`
      );
      
      if (response.ok) {
        const result = await response.json();
        const locationName = result.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        
        setSearchValue(locationName);
        
        // إشارة أن التحديث من الداخل
        isInternalUpdate.current = true;
        onChange(locationName, { lat, lng });
        
        setMarkerPosition([lat, lng]);
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      // في حالة الفشل، استخدم الإحداثيات
      const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setSearchValue(coords);
      
      // إشارة أن التحديث من الداخل
      isInternalUpdate.current = true;
      onChange(coords, { lat, lng });
      setMarkerPosition([lat, lng]);
    } finally {
      setIsLoading(false);
    }
  };

  // تنظيف timeout عند إلغاء تحميل المكون
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      {/* حقل البحث */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <div style={{
          position: 'relative',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '2px solid #f1f5f9',
          transition: 'all 0.3s ease',
          overflow: 'hidden'
        }}>
        <input
          type="text"
          value={searchValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          style={{
            width: '100%',
              padding: '16px 140px 16px 20px',
              border: 'none',
              borderRadius: '14px',
              fontSize: '16px',
              direction: 'rtl',
              background: 'transparent',
              outline: 'none',
              fontFamily: '"Cairo", sans-serif'
          }}
        />
        
        {/* أزرار الإجراءات */}
        <div style={{
          position: 'absolute',
            left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
            gap: '8px'
        }}>
          {/* زر الموقع الحالي */}
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={isLoading}
            style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
                borderRadius: '12px',
                padding: '12px 14px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              opacity: isLoading ? 0.6 : 1,
                minWidth: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
            }}
            title="الحصول على الموقع الحالي"
          >
            {isLoading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-location-arrow"></i>
            )}
          </button>

            {/* زر إعادة تعيين الخريطة */}
          <button
            type="button"
            onClick={() => {
              if (markerPosition) {
                setMapCenter(markerPosition);
              }
            }}
            style={{
                background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
              color: 'white',
              border: 'none',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                fontSize: '14px',
                minWidth: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(72, 187, 120, 0.3)'
            }}
              title="إعادة توسيط الخريطة"
          >
              <i className="fas fa-crosshairs"></i>
          </button>
          </div>
        </div>

        {/* قائمة الاقتراحات */}
        {showSuggestions && searchResults.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            right: '0',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            border: '1px solid #e2e8f0',
            zIndex: 1000,
            maxHeight: '200px',
            overflowY: 'auto',
            marginTop: '8px'
            }}>
            {searchResults.map((result, index) => (
              <div
                key={result.place_id}
                onClick={() => selectLocation(result)}
                style={{
                  padding: '16px 20px',
                  cursor: 'pointer',
                  borderBottom: index < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  direction: 'rtl'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
                  e.currentTarget.style.transform = 'translateX(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <div>
                  <i className="fas fa-map-marker-alt" style={{ 
                    color: '#667eea',
                    fontSize: '16px'
                  }}></i>
                  <div>
                    <div style={{ 
                      fontSize: '15px', 
                      fontWeight: '600', 
                      marginBottom: '4px',
                      color: '#2d3748'
                    }}>
                      {result.display_name.split(',')[0]}
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: '#718096',
                      lineHeight: '1.4'
                    }}>
                      {result.display_name}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* الخريطة */}
      <div style={{
        height: '400px',
        borderRadius: '16px',
        overflow: 'hidden',
        border: 'none',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        position: 'relative',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '3px'
      }}>
        <div style={{
          height: '300px',
          width: '100%',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
          border: '2px solid #e2e8f0',
          background: 'white'
      }}>
          {typeof window !== 'undefined' ? (
          <MapContainer
            center={mapCenter}
            zoom={13}
              style={{ height: '100%', width: '100%', borderRadius: '13px' }}
            ref={mapRef}
              key="map-container"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {markerPosition && (
              <Marker position={markerPosition}>
                <Popup>
                    <div style={{ 
                      textAlign: 'center', 
                      direction: 'rtl',
                      padding: '8px',
                      minWidth: '150px'
                    }}>
                      <div style={{
                        fontWeight: 'bold',
                        color: '#2d3748',
                        marginBottom: '8px',
                        fontSize: '14px'
                      }}>
                        📍 الموقع المحدد
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#718096',
                        lineHeight: '1.4'
                      }}>
                    {searchValue}
                      </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
          ) : (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8fafc',
              color: '#64748b',
              fontSize: '14px'
            }}>
              جارٍ تحميل الخريطة...
            </div>
        )}
        </div>

        {/* مؤشر التحميل */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '20px 24px',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '3px solid #f3f4f6',
              borderTop: '3px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <span style={{ 
              fontSize: '15px', 
              color: '#2d3748',
              fontWeight: '500'
            }}>
              جارٍ البحث...
            </span>
          </div>
        )}
      </div>

      {/* تعليمات الاستخدام */}
      <div style={{
        marginTop: '16px',
        padding: '16px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        borderRadius: '12px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{
          fontSize: '13px',
          color: '#64748b',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
          gap: '20px',
        flexWrap: 'wrap'
      }}>
          <span style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            fontWeight: '500'
          }}>
            <i className="fas fa-search" style={{ color: '#667eea' }}></i>
          اكتب للبحث
        </span>
          <span style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            fontWeight: '500'
          }}>
            <i className="fas fa-mouse-pointer" style={{ color: '#48bb78' }}></i>
          انقر على الخريطة
        </span>
          <span style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            fontWeight: '500'
          }}>
            <i className="fas fa-location-arrow" style={{ color: '#667eea' }}></i>
          احصل على موقعك
        </span>
        </div>
      </div>

      {/* CSS للخريطة - مطلوب لـ Leaflet */}
      <style jsx global>{`
        @import url('https://unpkg.com/leaflet@1.7.1/dist/leaflet.css');
        
        .leaflet-container {
          font-family: inherit;
        }
        
        .leaflet-popup-content-wrapper {
          direction: rtl;
        }
      `}</style>
    </div>
  );
};

export default React.memo(MapLocationPicker, (prevProps, nextProps) => {
  // مقارنة صارمة - إعادة render فقط إذا تغيرت القيمة فعلاً
  const valueChanged = prevProps.value !== nextProps.value;
  const placeholderChanged = prevProps.placeholder !== nextProps.placeholder;
  
  console.log('Memo comparison:', {
    prevValue: prevProps.value,
    nextValue: nextProps.value,
    valueChanged,
    placeholderChanged,
    shouldReRender: valueChanged || placeholderChanged
  });
  
  return !(valueChanged || placeholderChanged);
}); 