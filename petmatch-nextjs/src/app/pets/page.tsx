'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiService, Pet, Breed } from '@/lib/api';
import Header from '@/components/Header';

export default function PetsPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState({
    search: '',
    pet_type: '',
    location: '',
    gender: '',
    breed: '',


    is_fertile: false
  });
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    // طلب موقع المستخدم عند تحميل الصفحة
    getCurrentLocation();
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadPets();
  }, [filters, sortBy, userLocation]);

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Could not get user location:', error);
          // لا نظهر خطأ للمستخدم، فقط نعمل بدون المسافة
        }
      );
    }
  };

  const loadInitialData = async () => {
    try {
      const [petsResponse, breedsResponse] = await Promise.all([
        apiService.getPets(),
        apiService.getBreeds()
      ]);
      setPets(petsResponse.results || []);
      setBreeds(Array.isArray(breedsResponse) ? breedsResponse : []);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const loadPets = async () => {
    try {
      setLoading(true);
      const params: any = {};
      
      if (filters.search) params.search = filters.search;
      if (filters.pet_type) params.pet_type = filters.pet_type;
      if (filters.location) params.location = filters.location;
      if (filters.gender) params.gender = filters.gender;
      if (filters.breed) params.breed = parseInt(filters.breed);
  
  
      if (filters.is_fertile) params.is_fertile = true;
      
      // Add user location for distance calculation
      if (userLocation) {
        params.user_lat = userLocation.lat;
        params.user_lng = userLocation.lng;
      }
      
      // Set ordering
      switch (sortBy) {
        case 'newest':
          params.ordering = '-created_at';
          break;
        case 'oldest':
          params.ordering = 'created_at';
          break;

        case 'age_young':
          params.ordering = 'age_months';
          break;
        case 'age_old':
          params.ordering = '-age_months';
          break;
      }

      const response = await apiService.getPets(params);
      setPets(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string | boolean) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleToggleFavorite = async (petId: number) => {
    try {
      // Check if user is authenticated
      const token = localStorage.getItem('authToken');
      if (!token) {
        // Redirect to login or show login modal
        alert('يرجى تسجيل الدخول لإضافة الحيوانات للمفضلة');
        return;
      }
      
      await apiService.toggleFavorite(petId);
      // Optionally update the UI to show favorite status
      // You might want to add a favorites state to track this
    } catch (err) {
      console.error('Error toggling favorite:', err);
      if (err instanceof Error && err.message.includes('403')) {
        alert('يرجى تسجيل الدخول لإضافة الحيوانات للمفضلة');
      }
    }
  };

  if (loading && pets.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <span>جاري التحميل...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-content">
          <i className="fas fa-exclamation-circle"></i>
          <h3>خطأ في التحميل</h3>
          <p>{error}</p>
          <button onClick={loadInitialData} className="btn btn-primary">
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pets-page">
      <Header />

      <div className="container">
        {/* Enhanced Filters */}
        <div className="filters-section slide-in-left">
          <div className="filters-header">
            <h1>
              <i className="fas fa-search"></i>
              وصل حيوانك بالشريك المناسب -- أمان وثقة
            </h1>
            <p>استخدم الفلاتر للعثور على الحيوان المناسب - {pets.length} حيوان متاح</p>
          </div>
          
          <div className="filters-grid">
            <div className="filter-group">
              <label>
                <i className="fas fa-search"></i>
                البحث
              </label>
              <input
                type="text"
                placeholder="ابحث بالاسم أو السلالة..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label>
                <i className="fas fa-paw"></i>
                نوع الحيوان
              </label>
              <select
                value={filters.pet_type}
                onChange={(e) => handleFilterChange('pet_type', e.target.value)}
                className="filter-select"
              >
                <option value="">جميع الأنواع</option>
                <option value="cats">قطط</option>
                <option value="dogs">كلاب</option>
                <option value="birds">طيور</option>
                <option value="other">أخرى</option>
              </select>
            </div>

            <div className="filter-group">
              <label>
                <i className="fas fa-map-marker-alt"></i>
                الموقع
              </label>
              <input
                type="text"
                placeholder="المدينة أو المحافظة..."
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label>
                <i className="fas fa-venus-mars"></i>
                الجنس
              </label>
              <select
                value={filters.gender}
                onChange={(e) => handleFilterChange('gender', e.target.value)}
                className="filter-select"
              >
                <option value="">كلا الجنسين</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>

            <div className="filter-group">
              <label>
                <i className="fas fa-dna"></i>
                السلالة
              </label>
              <select
                value={filters.breed}
                onChange={(e) => handleFilterChange('breed', e.target.value)}
                className="filter-select"
              >
                <option value="">جميع السلالات</option>
                {breeds.map(breed => (
                  <option key={breed.id} value={breed.id.toString()}>
                    {breed.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>
                <i className="fas fa-sort"></i>
                الترتيب
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="filter-select"
              >
                <option value="newest">الأحدث</option>
                <option value="oldest">الأقدم</option>
                <option value="name">الاسم</option>
                <option value="age">العمر</option>
              </select>
            </div>
          </div>

          <div className="filters-footer">
            <label className="fertile-filter">
              <input
                type="checkbox"
                checked={filters.is_fertile}
                onChange={(e) => handleFilterChange('is_fertile', e.target.checked)}
              />
              <span className="checkmark"></span>
              <span>جاهز للتزاوج فقط</span>
            </label>

            <div className="view-controls">
              <div className="view-toggle">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  aria-label="عرض شبكي"
                >
                  <i className="fas fa-th"></i>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  aria-label="عرض قائمة"
                >
                  <i className="fas fa-list"></i>
                </button>
              </div>
              
              <div className="results-info">
                <span className="results-count">{pets.length} حيوان</span>
                {loading && <div className="loading-dots"><span></span><span></span><span></span></div>}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Pets Grid */}
        {pets.length === 0 && !loading ? (
          <div className="no-results fade-in">
            <div className="no-results-icon">
              <i className="fas fa-search"></i>
            </div>
            <h3>لم يتم العثور على نتائج</h3>
            <p>جرب تعديل معايير البحث أو الفلاتر للحصول على نتائج أفضل</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              <i className="fas fa-refresh"></i>
              إعادة التحميل
            </button>
          </div>
        ) : (
          <div className={`pets-grid ${viewMode} fade-in`}>
            {pets.map((pet, index) => (
              <Link key={pet.id} href={`/pets/${pet.id}`} className="pet-card-link">
                <article className="pet-card scale-on-tap" style={{animationDelay: `${index * 0.1}s`}}>
                  <div className="pet-image-wrapper">
                    <div className="pet-image-container">
                      <img
                        src={pet.main_image || '/placeholder-pet.jpg'}
                        alt={`صورة ${pet.name} - ${pet.pet_type_display}`}
                        className="pet-image"
                        loading="lazy"
                      />
                      <div className="image-overlay">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleFavorite(pet.id);
                          }}
                          className="favorite-btn"
                          aria-label="إضافة للمفضلة"
                        >
                          <i className="fas fa-heart"></i>
                        </button>
                      </div>
                    </div>
                    
                    <div className="pet-badges">
                      <span className={`status-badge ${pet.status}`}>
                        {pet.status_display}
                      </span>
                      {pet.is_fertile && (
                        <span className="fertile-badge">
                          <i className="fas fa-check-circle"></i>
                          جاهز للتزاوج
                        </span>
                      )}
                      {(pet.vaccination_certificate || pet.health_certificate || pet.has_health_certificates) && (
                        <span className="certified-badge">
                          <i className="fas fa-certificate"></i>
                          موثق طبياً
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="pet-content">
                    <div className="pet-header">
                      <h3 className="pet-name">{pet.name}</h3>
                      <div className="pet-type-gender">
                        <span className="pet-type">
                          <i className="fas fa-paw"></i>
                          {pet.pet_type_display}
                        </span>
                        <span className="pet-gender">
                          <i className={`fas fa-${pet.gender === 'male' ? 'mars' : 'venus'}`}></i>
                          {pet.gender_display}
                        </span>
                      </div>
                    </div>
                    
                    <div className="pet-details">
                      {pet.breed_name && (
                        <div className="detail-row">
                          <i className="fas fa-dna"></i>
                          <span>{pet.breed_name}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <i className="fas fa-birthday-cake"></i>
                        <span>{pet.age_display}</span>
                      </div>
                      {pet.location && (
                        <div className="detail-row">
                          <i className="fas fa-map-marker-alt"></i>
                          <span>{pet.location}</span>
                        </div>
                      )}
                      {pet.distance_display && (
                        <div className="detail-row distance-row">
                          <i className="fas fa-route"></i>
                          <span className="distance-text">{pet.distance_display}</span>
                        </div>
                      )}
                    </div>
                    
                    {pet.description && (
                      <p className="pet-description">{pet.description}</p>
                    )}
                    
                    <div className="pet-footer">
                      <div className="pet-price">
                        <span className="price-label">التزاوج</span>
                        <span className="price-value">مجاني</span>
                      </div>
                      <button className="contact-btn">
                        <i className="fas fa-comments"></i>
                        تواصل
                      </button>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        /* Modern Design System */
        .pets-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          padding-bottom: 2rem;
        }

        .container {
          padding-top: 2rem;
        }

        /* Filters Section */
        .filters-section {
          background: white;
          border-radius: 24px;
          padding: 2rem;
          margin-bottom: 3rem;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .filters-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid var(--gray-100);
        }

        .filters-header h1 {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          font-size: clamp(1.8rem, 4vw, 2.2rem);
          font-weight: 800;
          color: var(--dark);
          margin-bottom: 1rem;
          background: linear-gradient(135deg, var(--dark) 0%, var(--primary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .filters-header h1 i {
          color: var(--primary);
          font-size: 1.5rem;
        }

        .filters-header p {
          color: var(--muted);
          font-size: 1.1rem;
          font-weight: 500;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 768px) {
          .filters-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }

        .filter-group {
          display: flex;
          flex-direction: column;
        }

        .filter-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: var(--dark);
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }

        .filter-group label i {
          color: var(--primary);
          width: 16px;
        }

        .filter-input,
        .filter-select {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 2px solid var(--gray-200);
          border-radius: 12px;
          font-size: 1rem;
          font-family: "Cairo", sans-serif;
          transition: all 0.3s ease;
          background: white;
        }

        .filter-input:focus,
        .filter-select:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
          transform: translateY(-2px);
        }

        .filters-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1.5rem;
          border-top: 2px solid var(--gray-100);
        }

        @media (max-width: 768px) {
          .filters-footer {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
          }
        }

        .fertile-filter {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          font-weight: 600;
          color: var(--dark);
          position: relative;
        }

        .fertile-filter input {
          display: none;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          border: 2px solid var(--gray-300);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          position: relative;
        }

        .fertile-filter input:checked + .checkmark {
          background: var(--primary);
          border-color: var(--primary);
        }

        .fertile-filter input:checked + .checkmark::after {
          content: "✓";
          color: white;
          font-weight: bold;
          font-size: 14px;
        }

        .view-controls {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .view-toggle {
          display: flex;
          background: var(--gray-100);
          border-radius: 12px;
          padding: 4px;
          gap: 2px;
        }

        .view-btn {
          background: transparent;
          border: none;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--muted);
          min-height: 40px;
          min-width: 40px;
        }

        .view-btn.active {
          background: white;
          color: var(--primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .results-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .results-count {
          font-weight: 600;
          color: var(--dark);
        }

        /* No Results */
        .no-results {
          text-align: center;
          padding: 4rem 2rem;
          background: white;
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
        }

        .no-results-icon {
          width: 120px;
          height: 120px;
          background: linear-gradient(135deg, var(--gray-100) 0%, var(--gray-200) 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 2rem;
        }

        .no-results-icon i {
          font-size: 3rem;
          color: var(--muted);
        }

        .no-results h3 {
          color: var(--dark);
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }

        .no-results p {
          color: var(--muted);
          margin-bottom: 2rem;
        }

        /* Enhanced Pets Grid */
        .pets-grid {
          display: grid;
          gap: 2rem;
        }

        .pets-grid.grid {
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        }

        .pets-grid.list {
          grid-template-columns: 1fr;
        }

        @media (max-width: 768px) {
          .pets-grid.grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          }
        }

        @media (max-width: 480px) {
          .pets-grid.grid {
            grid-template-columns: 1fr;
          }
        }

        .pet-card-link {
          text-decoration: none;
          color: inherit;
        }

        .pet-card {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.04);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
          animation: fadeInUp 0.6s ease forwards;
          opacity: 0;
        }

        .pets-grid.list .pet-card {
          flex-direction: row;
          align-items: stretch;
        }

        .pet-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
          border-color: var(--primary);
        }

        /* Pet Image Wrapper */
        .pet-image-wrapper {
          position: relative;
          overflow: hidden;
        }

        .pet-image-container {
          position: relative;
          width: 100%;
          height: 280px;
          overflow: hidden;
        }

        .pets-grid.list .pet-image-container {
          width: 300px;
          height: 220px;
        }

        @media (max-width: 768px) {
          .pets-grid.list .pet-image-container {
            width: 200px;
            height: 180px;
          }
        }

        @media (max-width: 480px) {
          .pets-grid.list .pet-card {
            flex-direction: column;
          }
          
          .pets-grid.list .pet-image-container {
            width: 100%;
            height: 220px;
          }
        }

        .pet-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.6s ease;
        }

        .pet-card:hover .pet-image {
          transform: scale(1.1);
        }

        .image-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.2) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .pet-card:hover .image-overlay {
          opacity: 1;
        }

        .favorite-btn {
          position: absolute;
          top: 12px;
          left: 12px;
          background: rgba(255, 255, 255, 0.95);
          border: none;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          opacity: 0;
          transform: translateY(-10px);
        }

        .pet-card:hover .favorite-btn {
          opacity: 1;
          transform: translateY(0);
        }

        .favorite-btn:hover {
          background: var(--error);
          color: white;
          transform: scale(1.1);
        }

        .favorite-btn i {
          color: var(--error);
          font-size: 1.2rem;
          transition: color 0.3s ease;
        }

        .favorite-btn:hover i {
          color: white;
        }

        /* Pet Badges */
        .pet-badges {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .status-badge {
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .status-badge.available {
          background: rgba(16, 185, 129, 0.9);
          color: white;
        }

        .status-badge.unavailable {
          background: rgba(245, 158, 11, 0.9);
          color: white;
        }

        .fertile-badge {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(34, 197, 94, 0.9);
          color: white;
          padding: 0.3rem 0.6rem;
          border-radius: 16px;
          font-size: 0.7rem;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }

        .certified-badge {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(59, 130, 246, 0.9);
          color: white;
          padding: 0.3rem 0.6rem;
          border-radius: 16px;
          font-size: 0.7rem;
          font-weight: 600;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        /* Pet Content */
        .pet-content {
          padding: 1.5rem;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .pets-grid.list .pet-content {
          padding: 1.25rem;
        }

        .pet-header {
          margin-bottom: 1rem;
        }

        .pet-name {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--dark);
          margin: 0 0 0.5rem;
          line-height: 1.2;
        }

        .pet-type-gender {
          display: flex;
          gap: 1rem;
        }

        .pet-type,
        .pet-gender {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--muted);
        }

        .pet-type i,
        .pet-gender i {
          font-size: 0.9rem;
          color: var(--primary);
        }

        .pet-details {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .detail-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--muted);
          font-size: 0.9rem;
        }

        .detail-row i {
          width: 16px;
          color: var(--primary);
        }

        .distance-row {
          color: var(--success);
          font-weight: 600;
        }

        .distance-row i {
          color: var(--success);
        }

        .distance-text {
          color: var(--success);
          font-weight: 600;
        }

        .pet-description {
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 1rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .pet-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: auto;
          padding-top: 1rem;
          border-top: 1px solid var(--gray-100);
        }

        .pet-price {
          display: flex;
          flex-direction: column;
        }

        .price-label {
          font-size: 0.75rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .price-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--success);
        }

        .contact-btn {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          border: none;
          padding: 0.6rem 1.2rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .contact-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
        }

        /* Loading States & Error States */
        .loading-container,
        .error-container {
          min-height: 100vh;
          background: var(--bg);
          display: flex;
          justify-content: center;
          align-items: center;
          padding: var(--container-padding);
        }

        .loading-content,
        .error-content {
          text-align: center;
          background: white;
          padding: 3rem 2rem;
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
          max-width: 500px;
          width: 100%;
        }

        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .error-content i {
          font-size: 4rem;
          color: var(--error);
          margin-bottom: 1.5rem;
        }

        .error-content h3 {
          margin: 0 0 1rem;
          color: var(--dark);
          font-size: 1.5rem;
        }

        .error-content p {
          margin: 0 0 2rem;
          color: var(--muted);
          line-height: 1.6;
        }

        /* Enhanced Animations */
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        /* Touch improvements */
        @media (hover: none) and (pointer: coarse) {
          .pet-card:hover {
            transform: none;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
          }
          
          .favorite-btn,
          .view-btn,
          .contact-btn {
            min-height: 44px;
            min-width: 44px;
          }
          
          .image-overlay,
          .favorite-btn {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Responsive improvements */
        @media (max-width: 480px) {
          .hero-section {
            padding: 1.5rem 0;
          }
          
          .filters-section {
            padding: 1.5rem;
            margin-bottom: 2rem;
          }
          
          .pet-card {
            margin-bottom: 1rem;
          }
        }
      `}</style>
    </div>
  );
} 