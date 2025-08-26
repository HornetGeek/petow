'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, Pet } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function AdoptionPage() {
  const { user } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    pet_type: '',
    gender: '',
    location: ''
  });
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    // الحصول على موقع المستخدم
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Error getting location:', error);
        }
      );
    }
  }, []);

  useEffect(() => {
    fetchAdoptionPets();
  }, [filters, userLocation]);

  const fetchAdoptionPets = async () => {
    try {
      setLoading(true);
      // إضافة موقع المستخدم للفلاتر إذا كان متاحاً
      const filtersWithLocation = {
        ...filters,
        ...(userLocation && {
          user_lat: userLocation.lat,
          user_lng: userLocation.lng
        })
      };
      
      console.log('🔍 Frontend: Sending filters:', filtersWithLocation);
      console.log('🔍 Frontend: userLocation:', userLocation);
      
      const data = await apiService.getAdoptionPets(filtersWithLocation);
      console.log('🔍 Frontend: Received data:', data);
      setPets(data);
    } catch (error) {
      console.error('Error fetching adoption pets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <ProtectedRoute>
      <div className="adoption-page">
        <div className="container">
          <div className="page-header">
            <h1>🏠 التبني</h1>
            <p>ابحث عن رفيق جديد وامنحه منزلاً دافئاً</p>
          </div>

          {/* Navigation Links */}
          <div className="adoption-nav">
            <Link href="/adoption" className="nav-link active">
              <i className="fas fa-heart"></i>
              الحيوانات المتاحة للتبني
            </Link>
            <Link href="/adoption/my-requests" className="nav-link">
              <i className="fas fa-paper-plane"></i>
              طلباتي
            </Link>
            <Link href="/adoption/received" className="nav-link">
              <i className="fas fa-inbox"></i>
              الطلبات المستقبلة
            </Link>
          </div>

          {/* Filters */}
          <div className="filters-section">
            {/* Location Button */}
            <div className="location-section">
              <button 
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        setUserLocation({
                          lat: position.coords.latitude,
                          lng: position.coords.longitude
                        });
                      },
                      (error) => {
                        console.log('Error getting location:', error);
                        alert('حدث خطأ في تحديد موقعك. تأكد من السماح بالوصول للموقع.');
                      }
                    );
                  } else {
                    alert('متصفحك لا يدعم تحديد الموقع.');
                  }
                }}
                className="location-btn"
                type="button"
              >
                <i className="fas fa-map-marker-alt"></i>
                {userLocation ? 'تحديث الموقع' : 'تحديد موقعي'}
              </button>
              {userLocation && (
                <div className="location-info">
                  <i className="fas fa-check-circle"></i>
                  تم تحديد موقعك
                </div>
              )}
            </div>
            
            <div className="filters-grid">
              <div className="filter-group">
                <label>نوع الحيوان</label>
                <select 
                  value={filters.pet_type} 
                  onChange={(e) => handleFilterChange('pet_type', e.target.value)}
                >
                  <option value="">جميع الأنواع</option>
                  <option value="cats">قطط</option>
                  <option value="dogs">كلاب</option>
                  <option value="birds">طيور</option>
                  <option value="other">أخرى</option>
                </select>
              </div>

              <div className="filter-group">
                <label>الجنس</label>
                <select 
                  value={filters.gender} 
                  onChange={(e) => handleFilterChange('gender', e.target.value)}
                >
                  <option value="">الكل</option>
                  <option value="M">ذكر</option>
                  <option value="F">أنثى</option>
                </select>
              </div>

              <div className="filter-group">
                <label>الموقع</label>
                <input 
                  type="text" 
                  placeholder="ابحث بالموقع..."
                  value={filters.location}
                  onChange={(e) => handleFilterChange('location', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Pets Grid */}
          {loading ? (
            <div className="loading">
              <i className="fas fa-spinner fa-spin"></i>
              جاري التحميل...
            </div>
          ) : (
            <div className="pets-grid">
              {pets.length === 0 ? (
                <div className="no-pets">
                  <i className="fas fa-heart-broken"></i>
                  <h3>لا توجد حيوانات متاحة للتبني</h3>
                  <p>جرب تغيير المرشحات أو تحقق لاحقاً</p>
                </div>
              ) : (
                pets.map((pet) => (
                  <div key={pet.id} className="pet-card">
                    <div className="pet-image">
                      <Image
                        src={pet.main_image || '/placeholder-pet.jpg'}
                        alt={pet.name}
                        width={300}
                        height={200}
                        className="pet-img"
                      />
                      <div className="pet-status adoption">متاح للتبني</div>
                    </div>
                    
                    <div className="pet-info">
                      <h3>{pet.name}</h3>
                      <div className="pet-details">
                        <span><i className="fas fa-paw"></i> {pet.pet_type_display}</span>
                        <span><i className="fas fa-venus-mars"></i> {pet.gender_display}</span>
                        <span><i className="fas fa-calendar"></i> {pet.age_display}</span>
                      </div>
                      <p className="pet-description">{pet.description}</p>
                      <div className="pet-location">
                        <i className="fas fa-map-marker-alt"></i>
                        {pet.location}
                        {pet.distance_display && pet.distance_display !== "الموقع غير محدد" && (
                          <span className="distance-badge">
                            <i className="fas fa-ruler"></i>
                            {pet.distance_display}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="pet-actions">
                      <Link 
                        href={`/adoption/request/${pet.id}`}
                        className="btn-adopt"
                      >
                        <i className="fas fa-heart"></i>
                        طلب التبني
                      </Link>
                      <Link 
                        href={`/pets/${pet.id}`}
                        className="btn-details"
                      >
                        التفاصيل
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <style jsx>{`
          .adoption-page {
            min-height: 100vh;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 2rem 0;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 1rem;
          }

          .page-header {
            text-align: center;
            margin-bottom: 2rem;
          }

          .page-header h1 {
            font-size: 2.5rem;
            color: #2c3e50;
            margin-bottom: 0.5rem;
          }

          .page-header p {
            color: #7f8c8d;
            font-size: 1.1rem;
          }

          .adoption-nav {
            display: flex;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 2rem;
            flex-wrap: wrap;
          }

          .nav-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: white;
            border-radius: 25px;
            text-decoration: none;
            color: #34495e;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }

          .nav-link:hover,
          .nav-link.active {
            background: #e74c3c;
            color: white;
            transform: translateY(-2px);
          }

          .filters-section {
            background: white;
            padding: 1.5rem;
            border-radius: 15px;
            margin-bottom: 2rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          
          .location-section {
            margin-bottom: 1.5rem;
            text-align: center;
          }
          
          .location-btn {
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 25px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
          }
          
          .location-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4);
          }
          
          .location-info {
            margin-top: 1rem;
            padding: 0.8rem 1.5rem;
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white;
            border-radius: 15px;
            font-size: 0.9rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
          }

          .filters-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
          }

          .filter-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #2c3e50;
          }

          .filter-group select,
          .filter-group input {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #ecf0f1;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s ease;
          }

          .filter-group select:focus,
          .filter-group input:focus {
            outline: none;
            border-color: #e74c3c;
          }

          .loading {
            text-align: center;
            padding: 3rem;
            color: #7f8c8d;
            font-size: 1.2rem;
          }

          .pets-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 2rem;
          }

          .no-pets {
            text-align: center;
            padding: 3rem;
            color: #7f8c8d;
          }

          .no-pets i {
            font-size: 3rem;
            margin-bottom: 1rem;
            color: #e74c3c;
          }

          .pet-card {
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 6px 25px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
          }

          .pet-card:hover {
            transform: translateY(-5px);
          }

          .pet-image {
            position: relative;
            height: 200px;
            overflow: hidden;
          }

          .pet-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
          }

          .pet-card:hover .pet-img {
            transform: scale(1.05);
          }

          .pet-status {
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 0.25rem 0.75rem;
            border-radius: 15px;
            font-size: 0.75rem;
            font-weight: 600;
            color: white;
          }

          .pet-status.adoption {
            background: #e74c3c;
          }

          .pet-info {
            padding: 1.5rem;
          }

          .pet-info h3 {
            margin: 0 0 1rem 0;
            color: #2c3e50;
            font-size: 1.25rem;
          }

          .pet-details {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
            flex-wrap: wrap;
          }

          .pet-details span {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.875rem;
            color: #7f8c8d;
          }

          .pet-description {
            color: #34495e;
            line-height: 1.5;
            margin-bottom: 1rem;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .pet-location {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #e74c3c;
            font-weight: 500;
            flex-wrap: wrap;
          }
          
          .distance-badge {
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            padding: 0.3rem 0.6rem;
            border-radius: 15px;
            font-size: 0.8rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.3rem;
            box-shadow: 0 2px 8px rgba(52, 152, 219, 0.3);
          }

          .pet-actions {
            padding: 1rem 1.5rem;
            border-top: 1px solid #ecf0f1;
            display: flex;
            gap: 1rem;
          }

          .btn-adopt {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem;
            background: #e74c3c;
            color: white;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.3s ease;
          }

          .btn-adopt:hover {
            background: #c0392b;
          }

          .btn-details {
            padding: 0.75rem 1rem;
            background: white;
            border: 2px solid #e74c3c;
            color: #e74c3c;
            border-radius: 8px;
            text-decoration: none;
            transition: all 0.3s ease;
          }

          .btn-details:hover {
            background: #e74c3c;
            color: white;
          }

          @media (max-width: 768px) {
            .pets-grid {
              grid-template-columns: 1fr;
            }
            
            .filters-grid {
              grid-template-columns: 1fr;
            }
            
            .adoption-nav {
              flex-direction: column;
              align-items: center;
            }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
} 