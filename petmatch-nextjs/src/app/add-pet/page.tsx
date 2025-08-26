'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import MapLocationPicker from '@/components/MapLocationPicker';
import ProtectedRoute from '@/components/ProtectedRoute';
import { apiService, Breed } from '@/lib/api';

export default function AddPetPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [imageFiles, setImageFiles] = useState<{
    main_image?: File;
    image_2?: File;
    image_3?: File;
    image_4?: File;
    vaccination_certificate?: File;
    health_certificate?: File;
    disease_free_certificate?: File;
    additional_certificate?: File;
  }>({});

  const [locationCoordinates, setLocationCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [locationValue, setLocationValue] = useState('');

  const [petData, setPetData] = useState({
    name: '',
    pet_type: 'cats',
    breed: '',
    gender: 'M',
    age_months: '',
    weight: '',
    color: '',
    description: '',
    temperament: '',
    location: '',
    status: '', // User chooses between breeding or adoption
    is_free: true,
    is_fertile: true,
    is_trained: false,
    good_with_kids: true,
    good_with_pets: true,
    health_status: '',
    vaccination_status: '',
    breeding_history: '',
    main_image: '',
    image_2: '',
    image_3: '',
    image_4: ''
  });

  useEffect(() => {
    loadBreeds();
  }, []);

  useEffect(() => {
    if (petData.location && petData.location !== locationValue) {
      setLocationValue(petData.location);
    }
  }, [petData.location, locationValue]);

  // Wait for user data to be loaded
  if (isAuthenticated && !user) {
    return (
      <ProtectedRoute message="يجب تسجيل الدخول لإضافة حيوان">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px',
          color: 'var(--text)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem' }}></i>
            <p>جاري تحميل بيانات المستخدم...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const loadBreeds = async () => {
    try {
      const breedsData = await apiService.getBreeds();
      setBreeds(Array.isArray(breedsData) ? breedsData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل السلالات');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setPetData(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      setPetData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleLocationChange = useCallback((location: string, coordinates?: { lat: number; lng: number }) => {
    setLocationValue(location);
    setPetData(prev => ({
      ...prev,
      location: location
    }));
    
    if (coordinates) {
      setLocationCoordinates(coordinates);
    }
  }, []);

  const mapLocationPickerProps = useMemo(() => ({
    value: locationValue,
    onChange: handleLocationChange,
    placeholder: "ابحث عن موقعك أو انقر على الخريطة"
  }), [locationValue, handleLocationChange]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      setImageFiles(prev => ({
        ...prev,
        [name]: files[0]
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Debug logging
      console.log('Debug - isAuthenticated:', isAuthenticated);
      console.log('Debug - user:', user);
      console.log('Debug - authToken:', localStorage.getItem('authToken'));
      
      // Check if token exists and is valid
      const token = localStorage.getItem('authToken');
      console.log('Debug - Token from localStorage:', token);
      console.log('Debug - Token length:', token ? token.length : 0);
      console.log('Debug - Token starts with:', token ? token.substring(0, 10) + '...' : 'N/A');
      
      if (!token) {
        setError('لم يتم العثور على بيانات الدخول. يرجى تسجيل الدخول مرة أخرى.');
        setLoading(false);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/auth');
        }, 2000);
        return;
      }
      
      if (!user || !isAuthenticated) {
        setError('لم يتم العثور على بيانات المستخدم. يرجى تسجيل الدخول مرة أخرى.');
        setLoading(false);
        return;
      }
      
      if (!imageFiles.main_image) {
        setError('الصورة الرئيسية مطلوبة');
        setLoading(false);
        return;
      }

      if (!petData.name.trim()) {
        setError('اسم الحيوان مطلوب');
        setLoading(false);
        return;
      }

      if (!petData.breed) {
        setError('نوع السلالة مطلوب');
        setLoading(false);
        return;
      }

      if (!petData.status) {
        setError('نوع الإعلان مطلوب');
        setLoading(false);
        return;
      }

      // التحقق من وجود الإحداثيات
      if (!locationCoordinates) {
        setError('يرجى تحديد موقع الحيوان على الخريطة');
        setLoading(false);
        return;
      }

      // Update locationValue to petData before submission
      const finalPetData = {
        ...petData,
        location: locationValue,
        latitude: locationCoordinates.lat,
        longitude: locationCoordinates.lng
      };

      console.log('🔍 Sending pet data with coordinates:', finalPetData);
      const response = await apiService.createPet(finalPetData, imageFiles);
      
      setSuccess('تم إضافة الحيوان الأليف بنجاح!');
      setTimeout(() => {
        router.push('/my-pets');
      }, 2000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  const isBreeding = petData.status === 'available' || petData.status === 'mating' || petData.status === 'pregnant' || petData.status === 'unavailable';
  const isAdoption = petData.status === 'available_for_adoption';

    return (
    <ProtectedRoute>
        <div style={{
        minHeight: '100vh',
        background: 'var(--bg-light)',
        padding: '2rem 0'
        }}>
          <div style={{ 
          maxWidth: '800px',
          margin: '0 auto',
          padding: '0 1rem'
          }}>
            <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '2rem',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
          }}>
            <h1 style={{ 
              fontSize: '2rem', 
              fontWeight: 'bold',
              color: 'var(--text)', 
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              إضافة حيوان أليف
            </h1>

          {error && (
            <div style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                color: '#dc2626',
              padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
                background: '#d1fae5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
              padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Basic Information */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.2rem',
                color: 'var(--text)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                  <i className="fas fa-info-circle" style={{ color: 'var(--primary)' }}></i>
                المعلومات الأساسية
              </h3>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    اسم الحيوان *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={petData.name}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                      placeholder="أدخل اسم الحيوان"
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    نوع الحيوان *
                  </label>
                  <select
                    name="pet_type"
                    value={petData.pet_type}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="cats">قطط</option>
                    <option value="dogs">كلاب</option>
                    <option value="birds">طيور</option>
                      <option value="rabbits">أرانب</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    السلالة *
                  </label>
                  <select
                    name="breed"
                    value={petData.breed}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="">اختر السلالة</option>
                    {breeds
                      .filter(breed => breed.pet_type === petData.pet_type)
                      .map(breed => (
                        <option key={breed.id} value={breed.id}>
                          {breed.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    الجنس *
                  </label>
                  <select
                    name="gender"
                    value={petData.gender}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="M">ذكر</option>
                    <option value="F">أنثى</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                      العمر بالأشهر *
                  </label>
                  <input
                    type="number"
                    name="age_months"
                    value={petData.age_months}
                    onChange={handleChange}
                    required
                    min="1"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                      placeholder="مثال: 12"
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                      الوزن (كيلو) *
                  </label>
                  <input
                    type="number"
                    name="weight"
                    value={petData.weight}
                    onChange={handleChange}
                      required
                      min="0.1"
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                      placeholder="مثال: 4.5"
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                      اللون *
                  </label>
                  <input
                    type="text"
                    name="color"
                    value={petData.color}
                    onChange={handleChange}
                      required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                    placeholder="مثال: بني، أبيض، أسود"
                  />
                </div>
              </div>
            </div>

              {/* Type Selection */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.2rem',
                color: 'var(--text)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                  <i className="fas fa-heart" style={{ color: 'var(--primary)' }}></i>
                  نوع الإعلان *
              </h3>
                <select
                  name="status"
                  value={petData.status}
                    onChange={handleChange}
                  required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                >
                  <option value="">اختر نوع الإعلان</option>
                  <option value="available">متاح للتزاوج</option>
                  <option value="available_for_adoption">متاح للتبني</option>
                </select>
                </div>

              {/* Location */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontSize: '1.2rem',
                    color: 'var(--text)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-map-marker-alt" style={{ color: 'var(--primary)' }}></i>
                  الموقع *
                </h3>
                <MapLocationPicker {...mapLocationPickerProps} />
                {locationCoordinates && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: 'var(--success-light)',
                    color: 'var(--success)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <i className="fas fa-check-circle"></i>
                    تم تحديد الموقع: {locationCoordinates.lat.toFixed(6)}, {locationCoordinates.lng.toFixed(6)}
                  </div>
                )}
                {!locationCoordinates && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: 'var(--warning-light)',
                    color: 'var(--warning)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <i className="fas fa-exclamation-triangle"></i>
                    انقر على الخريطة لتحديد موقع الحيوان بدقة
                  </div>
                )}
              </div>

              {/* Breeding-specific fields */}
              {isBreeding && (
                <>
                  <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{
                      fontSize: '1.2rem',
                      color: 'var(--text)',
                      marginBottom: '1rem',
                display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
              }}>
                      <i className="fas fa-heart-pulse" style={{ color: 'var(--primary)' }}></i>
                      معلومات التزاوج
                    </h3>
                    
                    <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    name="is_fertile"
                    checked={petData.is_fertile}
                    onChange={handleChange}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ color: 'var(--text)', fontWeight: '600' }}>
                    قادر على التزاوج
                  </span>
                </label>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontWeight: '600'
                }}>
                        تاريخ التزاوج السابق
                </label>
                <textarea
                        name="breeding_history"
                        value={petData.breeding_history}
                  onChange={handleChange}
                        rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid var(--bg-light)',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    resize: 'vertical'
                  }}
                        placeholder="اذكر تاريخ التزاوج السابق إن وجد..."
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontWeight: '600'
                }}>
                        حالة التطعيم
                </label>
                <input
                  type="text"
                        name="vaccination_status"
                        value={petData.vaccination_status}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid var(--bg-light)',
                    borderRadius: '10px',
                    fontSize: '1rem'
                  }}
                        placeholder="مثال: مطعم بالكامل"
                />
              </div>
            </div>

            {/* Health Certificates Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.4rem',
                color: 'var(--text)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontWeight: '700'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px'
                }}>
                  <i className="fas fa-certificate"></i>
                </div>
                الشهادات الصحية المطلوبة
              </h3>

              <div style={{
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <i className="fas fa-info-circle" style={{ 
                  color: '#2563eb', 
                  fontSize: '20px',
                  marginTop: '2px'
                }}></i>
                <div>
                  <h4 style={{ 
                    margin: '0 0 8px 0', 
                    color: '#2563eb', 
                    fontSize: '16px',
                    fontWeight: '700' 
                  }}>
                    الشهادات الصحية (اختيارية)
                  </h4>
                  <p style={{ 
                    margin: 0, 
                    color: '#1e40af', 
                    fontSize: '14px',
                    lineHeight: '1.5'
                  }}>
                    رفع الشهادات الصحية يزيد من ثقة المالكين الآخرين ويجعل حيوانك أكثر جاذبية للتزاوج. 
                    الحيوانات التي لديها شهادات صحية تحصل على مؤشر "موثق طبياً" في قوائم البحث.
                  </p>
                </div>
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1.5rem'
              }}>
                {/* Vaccination Certificate */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(5,150,105,0.05) 100%)',
                  borderRadius: '20px',
                  padding: '24px',
                  border: '2px solid rgba(16,185,129,0.1)',
                  transition: 'all 0.3s ease',
                  position: 'relative'
                }}>
                                      <div style={{
                      position: 'absolute',
                      top: '15px',
                      right: '15px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      borderRadius: '20px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      <i className="fas fa-heart" style={{ marginLeft: '4px' }}></i>
                      موصى بها
                    </div>
                    
                    <label style={{
                      display: 'block',
                      marginBottom: '12px',
                      color: 'var(--text)',
                      fontWeight: '700',
                      fontSize: '16px'
                    }}>
                      شهادة التطعيمات
                    </label>
                  
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--muted)',
                    marginBottom: '16px',
                    lineHeight: '1.5'
                  }}>
                    شهادة تثبت حصول الحيوان على جميع التطعيمات الأساسية (السعار، الثلاثي/السباعي، إلخ)
                  </p>

                    <div style={{
                      height: '120px',
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                      border: '2px dashed #10b981',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px',
                          color: '#059669',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'hidden'
                        }}>
                                          <input
                        type="file"
                        name="vaccination_certificate"
                        accept="image/*,application/pdf"
                        onChange={handleImageChange}
                        style={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                              opacity: 0,
                          cursor: 'pointer'
                        }}
                      />
                          {imageFiles.vaccination_certificate ? (
                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                              <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#f0f9ff',
                                borderRadius: '10px',
                                border: '2px solid #0ea5e9'
                              }}>
                                <div style={{ textAlign: 'center' }}>
                                  <i className="fas fa-file-pdf" style={{ fontSize: '32px', marginBottom: '8px', color: '#0ea5e9' }}></i>
                                  <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', color: '#0ea5e9' }}>
                                    {imageFiles.vaccination_certificate.name}
                                  </p>
                                  <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8, color: '#0ea5e9' }}>
                                    تم الرفع بنجاح
                                  </p>
                                </div>
                              </div>
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}>
                                ✓ تم الرفع
                              </div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center' }}>
                              <i className="fas fa-certificate" style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                              <p style={{ margin: 0, fontWeight: '600', fontSize: '14px' }}>رفع شهادة التطعيمات</p>
                              <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>PDF, JPG, PNG</p>
                            </div>
                          )}
                  </div>
                </div>

                {/* Health Certificate */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(37,99,235,0.05) 100%)',
                  borderRadius: '20px',
                  padding: '24px',
                  border: '2px solid rgba(59,130,246,0.1)',
                  transition: 'all 0.3s ease',
                  position: 'relative'
                }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '12px',
                      color: 'var(--text)',
                      fontWeight: '700',
                      fontSize: '16px'
                    }}>
                          شهادة صحية عامة
                    </label>
                  
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--muted)',
                    marginBottom: '16px',
                    lineHeight: '1.5'
                  }}>
                          تقرير من طبيب بيطري يؤكد سلامة الحيوان من الأمراض والطفيليات
                  </p>

                    <div style={{
                      height: '120px',
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      border: '2px dashed #3b82f6',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px',
                          color: '#2563eb',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'hidden'
                        }}>
                                          <input
                        type="file"
                        name="health_certificate"
                        accept="image/*,application/pdf"
                        onChange={handleImageChange}
                        style={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                              opacity: 0,
                          cursor: 'pointer'
                        }}
                      />
                          {imageFiles.health_certificate ? (
                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                              <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#eff6ff',
                                borderRadius: '10px',
                                border: '2px solid #3b82f6'
                              }}>
                                <div style={{ textAlign: 'center' }}>
                                  <i className="fas fa-file-pdf" style={{ fontSize: '32px', marginBottom: '8px', color: '#3b82f6' }}></i>
                                  <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', color: '#3b82f6' }}>
                                    {imageFiles.health_certificate.name}
                                  </p>
                                  <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8, color: '#3b82f6' }}>
                                    تم الرفع بنجاح
                                  </p>
                                </div>
                              </div>
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}>
                                ✓ تم الرفع
                              </div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center' }}>
                              <i className="fas fa-file-medical" style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                              <p style={{ margin: 0, fontWeight: '600', fontSize: '14px' }}>رفع الشهادة الصحية</p>
                              <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>PDF, JPG, PNG</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Adoption-specific fields */}
              {isAdoption && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.2rem',
                    color: 'var(--text)',
                    marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                    <i className="fas fa-heart" style={{ color: '#e74c3c' }}></i>
                    معلومات التبني
                  </h3>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1rem'
                  }}>
                  <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '12px',
                      border: '2px solid #ecf0f1',
                      borderRadius: '10px'
                    }}>
                      <input
                        type="checkbox"
                        name="is_trained"
                        checked={petData.is_trained}
                        onChange={handleChange}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <i className="fas fa-graduation-cap" style={{ color: '#e74c3c' }}></i>
                      <span style={{ color: '#2c3e50', fontWeight: '600' }}>
                        مدرب
                      </span>
                  </label>
                  
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '12px',
                      border: '2px solid #ecf0f1',
                      borderRadius: '10px'
                    }}>
                      <input
                        type="checkbox"
                        name="good_with_kids"
                        checked={petData.good_with_kids}
                        onChange={handleChange}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <i className="fas fa-child" style={{ color: '#e74c3c' }}></i>
                      <span style={{ color: '#2c3e50', fontWeight: '600' }}>
                        مناسب للأطفال
                      </span>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '12px',
                      border: '2px solid #ecf0f1',
                      borderRadius: '10px'
                    }}>
                      <input
                        type="checkbox"
                        name="good_with_pets"
                        checked={petData.good_with_pets}
                        onChange={handleChange}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <i className="fas fa-paw" style={{ color: '#e74c3c' }}></i>
                      <span style={{ color: '#2c3e50', fontWeight: '600' }}>
                        مناسب مع الحيوانات الأخرى
                      </span>
                    </label>
                      </div>
                    </div>
                  )}
                  
              {/* Common fields for both */}
              {(isBreeding || isAdoption) && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.2rem',
                    color: 'var(--text)',
                    marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                    gap: '8px'
                    }}>
                    <i className="fas fa-file-text" style={{ color: 'var(--primary)' }}></i>
                    الوصف والصحة
                  </h3>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                      الوصف العام *
                    </label>
                    <textarea
                      name="description"
                      value={petData.description}
                      onChange={handleChange}
                      rows={4}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid var(--bg-light)',
                        borderRadius: '10px',
                        fontSize: '1rem',
                        resize: 'vertical'
                      }}
                      placeholder={
                        isAdoption 
                          ? "اكتب وصفاً مفصلاً عن الحيوان، شخصيته، وسبب حاجته للتبني..."
                          : "اكتب وصفاً شاملاً عن حيوانك الأليف..."
                      }
                    />
                  </div>
                  
                  <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'block',
                      marginBottom: '8px',
                    color: 'var(--text)',
                      fontWeight: '600'
                  }}>
                      المزاج والطباع *
                  </label>
                    <input
                      type="text"
                      name="temperament"
                      value={petData.temperament}
                      onChange={handleChange}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid var(--bg-light)',
                        borderRadius: '10px',
                        fontSize: '1rem'
                      }}
                      placeholder="مثال: هادئ، نشيط، ودود"
                    />
              </div>
              
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                    color: 'var(--text)',
                      fontWeight: '600'
                    }}>
                      الحالة الصحية *
                    </label>
                    <input
                      type="text"
                      name="health_status"
                      value={petData.health_status}
                      onChange={handleChange}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid var(--bg-light)',
                        borderRadius: '10px',
                        fontSize: '1rem'
                      }}
                      placeholder="مثال: ممتاز، جيد"
                    />
                </div>
                  </div>
              )}

              {/* Images */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.4rem',
                color: 'var(--text)',
                  marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontWeight: '700'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px'
                }}>
                    <i className="fas fa-camera"></i>
                </div>
                  صور الحيوان
              </h3>

                <div style={{
                  background: 'rgba(139, 92, 246, 0.05)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '2rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <i className="fas fa-lightbulb" style={{ 
                    color: '#8b5cf6', 
                    fontSize: '20px',
                    marginTop: '2px'
                  }}></i>
                  <div>
                    <h4 style={{ 
                      margin: '0 0 8px 0', 
                      color: '#8b5cf6', 
                      fontSize: '16px',
                      fontWeight: '700' 
                    }}>
                      نصائح للصور المثالية
                    </h4>
                    <p style={{ 
                      margin: 0, 
                      color: '#7c3aed', 
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}>
                      اختر صوراً واضحة وجميلة لحيوانك. الصور الجيدة تزيد من فرص نجاح الإعلان وتجذب المهتمين أكثر.
                    </p>
                  </div>
                </div>
              
              <div style={{
                display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1.5rem'
              }}>
                {/* Main Image */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(220,38,38,0.05) 100%)',
                  borderRadius: '20px',
                  padding: '24px',
                    border: '2px solid rgba(239,68,68,0.1)',
                  transition: 'all 0.3s ease',
                    position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: 'white',
                    borderRadius: '20px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    <i className="fas fa-star" style={{ marginLeft: '4px' }}></i>
                      مطلوبة
                  </div>
                  
                  <label style={{
                    display: 'block',
                    marginBottom: '12px',
                    color: 'var(--text)',
                    fontWeight: '700',
                    fontSize: '16px'
                  }}>
                    الصورة الرئيسية *
                  </label>
                  
                    <p style={{
                      fontSize: '13px',
                      color: 'var(--muted)',
                      marginBottom: '16px',
                      lineHeight: '1.5'
                    }}>
                      الصورة الأساسية التي ستظهر أولاً في البحث والإعلانات
                    </p>

                      <div style={{
                      height: '140px',
                      background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                      border: '2px dashed #ef4444',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px',
                      color: '#dc2626',
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                    <input
                      type="file"
                      name="main_image"
                      accept="image/*"
                      onChange={handleImageChange}
                      required
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                          opacity: 0,
                        cursor: 'pointer'
                      }}
                    />
                      {imageFiles.main_image ? (
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                          <img 
                            src={URL.createObjectURL(imageFiles.main_image)} 
                            alt="معاينة الصورة الرئيسية"
                            style={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'cover',
                              borderRadius: '10px'
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'rgba(0,0,0,0.7)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}>
                            ✓ تم الرفع
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <i className="fas fa-image" style={{ fontSize: '40px', marginBottom: '8px' }}></i>
                          <p style={{ margin: 0, fontWeight: '600', fontSize: '14px' }}>رفع الصورة الرئيسية</p>
                          <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>JPG, PNG (الحد الأقصى: 5MB)</p>
                        </div>
                      )}
                  </div>
                </div>

                {/* Additional Images */}
                  {[2, 3, 4].map(num => (
                    <div key={num} style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(124,58,237,0.05) 100%)',
                    borderRadius: '20px',
                    padding: '24px',
                      border: '2px solid rgba(139,92,246,0.1)',
                    transition: 'all 0.3s ease',
                      position: 'relative'
                    }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '12px',
                      color: 'var(--text)',
                        fontWeight: '700',
                        fontSize: '16px'
                    }}>
                        صورة إضافية {num}
                    </label>
                    
                      <p style={{
                        fontSize: '13px',
                        color: 'var(--muted)',
                        marginBottom: '16px',
                        lineHeight: '1.5'
                      }}>
                        صورة إضافية لإظهار تفاصيل أكثر عن الحيوان
                      </p>

                        <div style={{
                        height: '120px',
                        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                        border: '2px dashed #8b5cf6',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px',
                        color: '#7c3aed',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                      <input
                        type="file"
                          name={`image_${num}`}
                        accept="image/*"
                        onChange={handleImageChange}
                        style={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                            opacity: 0,
                          cursor: 'pointer'
                        }}
                      />
                        {imageFiles[`image_${num}` as keyof typeof imageFiles] ? (
                          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <img 
                              src={URL.createObjectURL(imageFiles[`image_${num}` as keyof typeof imageFiles] as File)} 
                              alt={`معاينة الصورة ${num}`}
                              style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover',
                                borderRadius: '10px'
                              }}
                            />
                            <div style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: 'rgba(0,0,0,0.7)',
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}>
                              ✓ تم الرفع
                            </div>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center' }}>
                            <i className="fas fa-images" style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                            <p style={{ margin: 0, fontWeight: '600', fontSize: '14px' }}>اختر صورة</p>
                            <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>JPG, PNG</p>
                          </div>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: loading ? '#9ca3af' : 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin" style={{ marginLeft: '8px' }}></i>
                    جارٍ الحفظ...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save" style={{ marginLeft: '8px' }}></i>
                    حفظ الإعلان
                  </>
                )}
              </button>
          </form>
        </div>
      </div>
    </div>
    </ProtectedRoute>
    );
} 