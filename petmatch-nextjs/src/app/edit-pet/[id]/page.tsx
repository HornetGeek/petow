'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import MapLocationPicker from '@/components/MapLocationPicker';
import ProtectedRoute from '@/components/ProtectedRoute';
import { apiService, Breed, Pet } from '@/lib/api';

export default function EditPetPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const petId = params.id as string;
  
  const [pet, setPet] = useState<Pet | null>(null);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [imageFiles, setImageFiles] = useState<{
    main_image?: File;
    image_2?: File;
    image_3?: File;
    image_4?: File;
  }>({});

  const [locationCoordinates, setLocationCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

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
    is_free: true,
    is_fertile: true,
    is_trained: false,
    good_with_kids: true,
    good_with_pets: true,
    health_status: '',
    breeding_history: '',
    main_image: '',
    image_2: '',
    image_3: '',
    image_4: ''
  });

  useEffect(() => {
    if (isAuthenticated && petId) {
      loadData();
    }
  }, [isAuthenticated, petId]);

  const loadData = async () => {
    try {
      console.log('🔍 Loading pet data for ID:', petId);
      
      // Check authentication first
      const token = localStorage.getItem('authToken');
      console.log('🔑 Auth token exists:', !!token);
      console.log('👤 Current user from AuthContext:', !!user);
      
      if (user) {
        console.log('👤 Current user details:', { id: user.id, email: user.email, name: user.first_name });
      } else {
        console.error('❌ No user data available from AuthContext');
        setError('لم يتم تحميل بيانات المستخدم. يرجى تسجيل الدخول مرة أخرى.');
        setLoading(false);
        return;
      }

      const [petData, breedsData] = await Promise.all([
        apiService.getPet(parseInt(petId)),
        apiService.getBreeds()
      ]);

      console.log('🐾 Pet data loaded successfully:', {
        id: petData.id,
        name: petData.name,
        owner_name: petData.owner_name,
        owner_email: petData.owner_email
      });

      setPet(petData);
      setBreeds(Array.isArray(breedsData) ? breedsData : []);
      
      // Check if current user owns this pet by comparing owner email
      console.log('🔍 Ownership check:', {
        userEmail: user.email,
        petOwnerEmail: petData.owner_email,
        matches: user.email === petData.owner_email
      });
      
      if (petData.owner_email !== user.email) {
        console.error('❌ Ownership check failed - user does not own this pet');
        setError('ليس لديك صلاحية لتعديل هذا الحيوان الأليف. يمكنك فقط تعديل الحيوانات التي تملكها.');
        setLoading(false);
        return;
      } else {
        console.log('✅ Ownership check passed - user owns this pet');
      }
      
      // Populate form with existing pet data
      setPetData({
        name: petData.name || '',
        pet_type: petData.pet_type || 'cats',
        breed: petData.breed?.toString() || '',
        gender: petData.gender || 'M',
        age_months: petData.age_months?.toString() || '',
        weight: petData.weight?.toString() || '',
        color: petData.color || '',
        description: petData.description || '',
        temperament: petData.temperament || '',
        location: petData.location || '',
        is_free: true,
        is_fertile: petData.is_fertile || true,
        is_trained: petData.is_trained || false,
        good_with_kids: petData.good_with_kids !== undefined ? petData.good_with_kids : true,
        good_with_pets: petData.good_with_pets !== undefined ? petData.good_with_pets : true,
        health_status: petData.health_status || '',
        breeding_history: petData.breeding_history || '',
        main_image: petData.main_image || '',
        image_2: petData.image_2 || '',
        image_3: petData.image_3 || '',
        image_4: petData.image_4 || ''
      });
      
      console.log('✅ Form data populated successfully');
      
    } catch (err) {
      console.error('💥 Error loading pet data:', err);
      if (err instanceof Error) {
        console.error('💥 Error details:', {
          message: err.message,
          stack: err.stack
        });
        
        if (err.message.includes('403') || err.message.includes('permission') || err.message.includes('صلاحية')) {
          setError('ليس لديك صلاحية للوصول إلى هذا الحيوان الأليف. يمكنك فقط تعديل الحيوانات التي تملكها.');
        } else if (err.message.includes('404')) {
          setError('لم يتم العثور على الحيوان الأليف المطلوب.');
        } else if (err.message.includes('401')) {
          setError('انتهت صلاحية جلسة المستخدم. يرجى تسجيل الدخول مرة أخرى.');
        } else {
          setError(err.message || 'خطأ في تحميل البيانات');
        }
      } else {
        setError('خطأ في تحميل البيانات');
      }
    } finally {
      setLoading(false);
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

  const handleLocationChange = (location: string, coordinates?: { lat: number; lng: number }) => {
    setPetData(prev => ({
      ...prev,
      location: location
    }));
    
    if (coordinates) {
      setLocationCoordinates(coordinates);
      console.log('Selected coordinates:', coordinates);
    }
  };

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
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      console.log('💾 Starting pet update for ID:', petId);
      console.log('💾 Update data:', petData);
      console.log('💾 Image files:', imageFiles);
      
      // Check authentication before submitting
      const token = localStorage.getItem('authToken');
      console.log('🔑 Auth check before submit - token exists:', !!token);
      console.log('👤 Auth check before submit - user exists:', !!user);
      
      if (!user) {
        console.error('❌ No user data available for submission');
        setError('لم يتم العثور على بيانات المستخدم. يرجى تسجيل الدخول مرة أخرى.');
        return;
      }

      // Create FormData for handling both text and file data
      const formData = new FormData();
      
      // Add text fields
      formData.append('name', petData.name);
      formData.append('pet_type', petData.pet_type);
      formData.append('breed', petData.breed);
      formData.append('gender', petData.gender);
      formData.append('age_months', petData.age_months);
      formData.append('weight', petData.weight);
      formData.append('color', petData.color);
      formData.append('description', petData.description);
      formData.append('temperament', petData.temperament);
      formData.append('location', petData.location);
      
      // Add coordinates if available
      if (locationCoordinates) {
        formData.append('latitude', locationCoordinates.lat.toString());
        formData.append('longitude', locationCoordinates.lng.toString());
      }
      
      formData.append('is_free', petData.is_free.toString());
      formData.append('is_fertile', petData.is_fertile.toString());
      formData.append('is_trained', petData.is_trained.toString());
      formData.append('good_with_kids', petData.good_with_kids.toString());
      formData.append('good_with_pets', petData.good_with_pets.toString());
      formData.append('health_status', petData.health_status);
      formData.append('breeding_history', petData.breeding_history);
      


      // Add image files - only send new files if selected
      if (imageFiles.main_image) {
        formData.append('main_image', imageFiles.main_image);
      }
      
      // Handle additional images - only send new files if selected
      ['image_2', 'image_3', 'image_4'].forEach(imageKey => {
        if (imageFiles[imageKey as keyof typeof imageFiles]) {
          formData.append(imageKey, imageFiles[imageKey as keyof typeof imageFiles]!);
        }
      });

      console.log('💾 Prepared FormData with files');
      
      // Debug: Log all FormData entries
      console.log('🔍 FormData contents:');
      for (let [key, value] of formData.entries()) {
        console.log(`${key}:`, value);
      }

      // Use a custom API call with FormData
      const response = await fetch(`http://localhost:8000/api/pets/${petId}/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Token ${token}`,
          // Don't set Content-Type - let browser set it automatically for FormData
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log('✅ Pet updated successfully!');
      setSuccess('تم تحديث معلومات الحيوان الأليف بنجاح!');
      
      // Redirect to my pets page after 2 seconds
      setTimeout(() => {
        router.push('/my-pets');
      }, 2000);
      
    } catch (err) {
      console.error('💥 Error updating pet:', err);
      if (err instanceof Error) {
        console.error('💥 Update error details:', {
          message: err.message,
          stack: err.stack
        });
        
        if (err.message.includes('403') || err.message.includes('permission') || err.message.includes('صلاحية')) {
          setError('ليس لديك صلاحية لتعديل هذا الحيوان الأليف. تأكد من أنك تملك هذا الحيوان.');
        } else if (err.message.includes('401')) {
          setError('انتهت صلاحية جلسة المستخدم. يرجى تسجيل الدخول مرة أخرى.');
        } else {
          setError(err.message || 'حدث خطأ في تحديث الحيوان الأليف');
        }
      } else {
        setError('حدث خطأ في تحديث الحيوان الأليف');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الحيوان الأليف؟ لا يمكن التراجع عن هذا الإجراء.')) {
      return;
    }

    try {
      setSaving(true);
      await apiService.deletePet(parseInt(petId));
      router.push('/my-pets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في حذف الحيوان الأليف');
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute message="يجب تسجيل الدخول لتعديل الحيوان">
      <Content />
    </ProtectedRoute>
  );

  function Content() {
    if (loading) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <i className="fas fa-spinner fa-spin" style={{
              fontSize: '3rem',
              color: 'var(--primary)'
            }}></i>
            <p style={{ color: 'var(--text-light)' }}>جاري تحميل بيانات الحيوان الأليف...</p>
          </div>
        </div>
      );
    }

  if (!pet) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>لم يتم العثور على الحيوان الأليف</h1>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-light)' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
        }}>
          {/* Header */}
          <div style={{ 
            textAlign: 'center',
            marginBottom: '2rem',
            paddingBottom: '1rem',
            borderBottom: '2px solid var(--bg-light)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 1rem',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '2rem'
            }}>
              <i className="fas fa-edit"></i>
            </div>
            
            <h1 style={{ 
              fontSize: '2rem', 
              color: 'var(--text)', 
              marginBottom: '0.5rem' 
            }}>
              تعديل {pet.name}
            </h1>
            <p style={{ color: 'var(--text-light)' }}>
              تحديث معلومات الحيوان الأليف
            </p>
          </div>

          {/* Messages */}
          {error && (
            <div style={{
              background: '#fee',
              color: '#c53030',
              padding: '1rem',
              borderRadius: '10px',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="fas fa-exclamation-circle"></i>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: '#f0fff4',
              color: '#38a169',
              padding: '1rem',
              borderRadius: '10px',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="fas fa-check-circle"></i>
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
                <i className="fas fa-info-circle"></i>
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
                    <option value="other">أخرى</option>
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
                    {breeds.map(breed => (
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
                    الموقع *
                  </label>
                  <MapLocationPicker
                    value={petData.location}
                    onChange={handleLocationChange}
                    placeholder="ابحث عن موقعك أو انقر على الخريطة"
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    حالة التزاوج
                  </label>
                  <input
                    type="number"
                    name="breeding_fee"
                    value="متاح للتزاوج مجاناً"
                    disabled
                    readOnly
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '2rem',
                marginTop: '1rem'
              }}>
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
            </div>

            {/* Description */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: 'var(--text)',
                fontWeight: '600'
              }}>
                الوصف العام
              </label>
              <textarea
                name="description"
                value={petData.description}
                onChange={handleChange}
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid var(--bg-light)',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Characteristics Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.2rem',
                color: 'var(--text)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-star"></i>
                المميزات والخصائص
              </h3>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    الطباع والمزاج
                  </label>
                  <input
                    type="text"
                    name="temperament"
                    value={petData.temperament}
                    onChange={handleChange}
                    placeholder="مثال: هادئ ومحبوب، نشيط وودود"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '12px',
                  border: '2px solid var(--bg-light)',
                  borderRadius: '10px',
                  transition: 'all 0.3s ease'
                }}>
                  <input
                    type="checkbox"
                    name="is_trained"
                    checked={petData.is_trained}
                    onChange={handleChange}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <i className="fas fa-graduation-cap" style={{ color: 'var(--primary)' }}></i>
                  <span style={{ color: 'var(--text)', fontWeight: '600' }}>
                    مدرب
                  </span>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '12px',
                  border: '2px solid var(--bg-light)',
                  borderRadius: '10px',
                  transition: 'all 0.3s ease'
                }}>
                  <input
                    type="checkbox"
                    name="good_with_kids"
                    checked={petData.good_with_kids}
                    onChange={handleChange}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <i className="fas fa-child" style={{ color: 'var(--primary)' }}></i>
                  <span style={{ color: 'var(--text)', fontWeight: '600' }}>
                    مناسب للأطفال
                  </span>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '12px',
                  border: '2px solid var(--bg-light)',
                  borderRadius: '10px',
                  transition: 'all 0.3s ease'
                }}>
                  <input
                    type="checkbox"
                    name="good_with_pets"
                    checked={petData.good_with_pets}
                    onChange={handleChange}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <i className="fas fa-paw" style={{ color: 'var(--primary)' }}></i>
                  <span style={{ color: 'var(--text)', fontWeight: '600' }}>
                    مناسب مع الحيوانات الأخرى
                  </span>
                </label>
              </div>
            </div>

            {/* Health & Breeding History Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.2rem',
                color: 'var(--text)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-heartbeat"></i>
                الصحة وتاريخ التزاوج
              </h3>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '1rem'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    الحالة الصحية والتطعيمات
                  </label>
                  <textarea
                    name="health_status"
                    value={petData.health_status}
                    onChange={handleChange}
                    rows={3}
                    placeholder="مثال: تم تطعيمه بالكامل، آخر فحص في 2024-01-15، صحة ممتازة"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    تاريخ التزاوج والنتاج (اختياري)
                  </label>
                  <textarea
                    name="breeding_history"
                    value={petData.breeding_history}
                    onChange={handleChange}
                    rows={3}
                    placeholder="مثال: لم يتزاوج من قبل، أو تزاوج مرتين وأنتج 6 صغار"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid var(--bg-light)',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Image Upload Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.4rem',
                color: 'var(--text)',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontWeight: '700'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px'
                }}>
                  <i className="fas fa-images"></i>
                </div>
                صور الحيوان الأليف
              </h3>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1.5rem'
              }}>
                {/* Main Image */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(14,165,233,0.05) 100%)',
                  borderRadius: '20px',
                  padding: '24px',
                  border: '2px solid rgba(99,102,241,0.1)',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 15px 35px rgba(99,102,241,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    borderRadius: '20px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    <i className="fas fa-star" style={{ marginLeft: '4px' }}></i>
                    رئيسية
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
                  
                  {petData.main_image ? (
                    <div style={{ 
                      marginBottom: '16px',
                      position: 'relative',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      boxShadow: '0 8px 25px rgba(0,0,0,0.1)'
                    }}>
                      <img 
                        src={petData.main_image} 
                        alt="Current main image"
                        style={{
                          width: '100%',
                          height: '180px',
                          objectFit: 'cover'
                        }}
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        right: '0',
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                        color: 'white',
                        padding: '12px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        <i className="fas fa-check-circle" style={{ marginLeft: '6px', color: '#10B981' }}></i>
                        الصورة الحالية
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      height: '180px',
                      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                      border: '2px dashed #cbd5e1',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px',
                      color: '#64748b'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <i className="fas fa-image" style={{ fontSize: '48px', marginBottom: '8px', opacity: 0.5 }}></i>
                        <p style={{ margin: 0, fontWeight: '600' }}>لا توجد صورة</p>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ position: 'relative' }}>
                    <input
                      type="file"
                      name="main_image"
                      accept="image/*"
                      onChange={handleImageChange}
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        width: '100%',
                        height: '100%',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      padding: '14px 20px',
                      borderRadius: '12px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(99,102,241,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}>
                      <i className="fas fa-cloud-upload-alt"></i>
                      {imageFiles.main_image ? 'تم اختيار صورة جديدة' : 'اختر صورة جديدة'}
                    </div>
                  </div>
                  
                  {imageFiles.main_image && (
                    <div style={{
                      marginTop: '12px',
                      padding: '8px 12px',
                      background: 'rgba(16,185,129,0.1)',
                      borderRadius: '8px',
                      color: '#059669',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <i className="fas fa-check"></i>
                      {imageFiles.main_image.name}
                    </div>
                  )}
                </div>

                {/* Additional Images */}
                {['image_2', 'image_3', 'image_4'].map((imageName, index) => (
                  <div key={imageName} style={{
                    background: 'white',
                    borderRadius: '20px',
                    padding: '24px',
                    border: '2px solid rgba(99,102,241,0.08)',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.08)';
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '15px',
                      right: '15px',
                      background: 'rgba(99,102,241,0.1)',
                      color: '#4f46e5',
                      borderRadius: '20px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      #{index + 2}
                    </div>
                    
                    <label style={{
                      display: 'block',
                      marginBottom: '12px',
                      color: 'var(--text)',
                      fontWeight: '600',
                      fontSize: '15px'
                    }}>
                      صورة إضافية {index + 2}
                    </label>
                    
                    {petData[imageName as keyof typeof petData] ? (
                      <div style={{ 
                        marginBottom: '16px',
                        position: 'relative',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.08)'
                      }}>
                        <img 
                          src={petData[imageName as keyof typeof petData] as string} 
                          alt={`Current additional image ${index + 2}`}
                          style={{
                            width: '100%',
                            height: '160px',
                            objectFit: 'cover'
                          }}
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          background: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          حالية
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        height: '160px',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                        border: '2px dashed #d1d5db',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px',
                        color: '#9ca3af'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <i className="fas fa-plus" style={{ fontSize: '32px', marginBottom: '6px', opacity: 0.5 }}></i>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: '500' }}>اختيارية</p>
                        </div>
                      </div>
                    )}
                    
                    <div style={{ position: 'relative' }}>
                      <input
                        type="file"
                        name={imageName}
                        accept="image/*"
                        onChange={handleImageChange}
                        style={{
                          position: 'absolute',
                          opacity: 0,
                          width: '100%',
                          height: '100%',
                          cursor: 'pointer'
                        }}
                      />
                      <div style={{
                        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                        color: '#4f46e5',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.3s ease',
                        border: '2px solid rgba(99,102,241,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)';
                        e.currentTarget.style.color = 'white';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
                        e.currentTarget.style.color = '#4f46e5';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}>
                        <i className="fas fa-upload"></i>
                        {imageFiles[imageName as keyof typeof imageFiles] ? 'تم الاختيار' : 'رفع صورة'}
                      </div>
                    </div>
                    
                    {imageFiles[imageName as keyof typeof imageFiles] && (
                      <div style={{
                        marginTop: '10px',
                        padding: '6px 10px',
                        background: 'rgba(16,185,129,0.1)',
                        borderRadius: '6px',
                        color: '#059669',
                        fontSize: '12px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <i className="fas fa-check-circle"></i>
                        {(imageFiles[imageName as keyof typeof imageFiles] as File)?.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              <div style={{
                marginTop: '2rem',
                padding: '20px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(147,51,234,0.05) 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(59,130,246,0.1)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '14px'
                  }}>
                    <i className="fas fa-info"></i>
                  </div>
                  <h4 style={{
                    margin: 0,
                    color: 'var(--text)',
                    fontWeight: '700',
                    fontSize: '16px'
                  }}>
                    نصائح لأفضل النتائج
                  </h4>
                </div>
                <ul style={{
                  margin: 0,
                  paddingRight: '20px',
                  color: 'var(--muted)',
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}>
                  <li>اختر صورة جديدة فقط إذا كنت تريد تغيير الصورة الحالية</li>
                  <li>الصور المقبولة: JPG, PNG, GIF (بحد أقصى 5MB)</li>
                  <li>للحصول على أفضل جودة، استخدم صور بدقة عالية وإضاءة جيدة</li>
                  <li>تأكد من وضوح الحيوان في الصورة الرئيسية</li>
                </ul>
              </div>
            </div>
            
            {/* Submit Buttons */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'space-between',
              paddingTop: '1rem',
              borderTop: '2px solid var(--bg-light)'
            }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  border: '2px solid #e53e3e',
                  borderRadius: '10px',
                  background: 'white',
                  color: '#e53e3e',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  opacity: saving ? 0.7 : 1
                }}
              >
                <i className="fas fa-trash" style={{ marginLeft: '8px' }}></i>
                حذف الحيوان الأليف
              </button>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => router.back()}
                  style={{
                    padding: '12px 24px',
                    border: '2px solid #ccc',
                    borderRadius: '10px',
                    background: 'white',
                    color: '#666',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  إلغاء
                </button>
                
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {saving ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save"></i>
                      حفظ التغييرات
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
    );
  }
} 