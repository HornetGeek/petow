'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { apiService, Pet } from '@/lib/api';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';

export default function PetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [pendingAction, setPendingAction] = useState<'favorite' | 'breeding' | null>(null);

  useEffect(() => {
    loadPet();
  }, [params.id]);

  const loadPet = async () => {
    try {
      console.log('Loading pet with ID:', params.id);
      const petData = await apiService.getPet(Number(params.id));
      console.log('Pet data loaded successfully:', petData);
      setPet(petData);
    } catch (err) {
      console.error('Error loading pet:', err);
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!pet) return;
    
    if (!isAuthenticated) {
      setPendingAction('favorite');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
    
    try {
      await apiService.toggleFavorite(pet.id);
      // يمكن إضافة رسالة نجاح هنا
    } catch (err) {
      console.error('Error toggling favorite:', err);
      if (err instanceof Error && err.message.includes('403')) {
        setPendingAction('favorite');
        setAuthMode('login');
        setShowAuthModal(true);
      }
    }
  };

  const handleBreedingRequest = () => {
    if (!isAuthenticated) {
      setPendingAction('breeding');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    if (!pet) return;

    // Check if user is trying to request breeding with their own pet
    if (user && pet.owner_email === user.email) {
      alert('لا يمكنك طلب مقابلة مع حيوانك الخاص');
      return;
    }

    // Check if pet is available for breeding
    if (pet.status !== 'available') {
      alert('هذا الحيوان غير متاح للمقابلات حالياً');
      return;
    }

    // Check if pet is fertile
    if (!pet.is_fertile) {
      alert('هذا الحيوان غير قادر على التزاوج');
      return;
    }

    // Navigate to breeding request page
    router.push(`/breeding-request/${pet.id}`);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    
    // تنفيذ الإجراء المطلوب بعد تسجيل الدخول
    if (pendingAction === 'favorite') {
      handleToggleFavorite();
    } else if (pendingAction === 'breeding') {
      handleBreedingRequest();
    }
    
    setPendingAction(null);
  };

  if (loading) {
    return (
      <div className="loading-page">
        <Header />
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <span>جاري تحميل تفاصيل الحيوان...</span>
        </div>
      </div>
    );
  }

  if (error || !pet) {
    return (
      <div className="error-page">
        <Header />
        <div className="error-content">
          <i className="fas fa-exclamation-triangle"></i>
          <h3>خطأ في التحميل</h3>
          <p>{error || 'الحيوان غير موجود'}</p>
          <Link href="/pets" className="btn btn-primary">
            <i className="fas fa-arrow-right"></i>
            العودة للقائمة
          </Link>
        </div>
      </div>
    );
  }

  const images = [pet.main_image, pet.image_2, pet.image_3, pet.image_4].filter(Boolean);

  return (
    <div className="pet-detail-page">
      <Header />

      <div className="container">
        {/* Breadcrumb */}
        <nav className="breadcrumb fade-in">
          <Link href="/pets" className="breadcrumb-link">
            <i className="fas fa-home"></i>
            الحيوانات
          </Link>
          <i className="fas fa-chevron-left breadcrumb-separator"></i>
          <span className="breadcrumb-current">{pet.name}</span>
        </nav>

        <div className="pet-detail-container">
          {/* Hero Section */}
          <div className="hero-section">
            <div className="hero-content">
              <div className="pet-header">
                <div className="pet-title-section">
                  <h1>{pet.name}</h1>
                  <span className="verified-badge">
                    <i className="fas fa-shield-check"></i>
                    موثق
                  </span>
                </div>
                
                <div className="pet-meta">
                  {pet.breed_name && (
                    <span className="breed-tag">
                      <i className="fas fa-dna"></i>
                      {pet.breed_name}
                    </span>
                  )}
                  <span className="type-tag">
                    <i className="fas fa-paw"></i>
                    {pet.pet_type_display}
                  </span>
                </div>

                <div className="status-badges">
                  <span className={`status-badge ${pet.status}`}>
                    <i className="fas fa-circle"></i>
                    {pet.status_display}
                  </span>
                  {pet.is_fertile && (
                    <span className="fertile-badge">
                      <i className="fas fa-heart"></i>
                      جاهز للتزاوج
                    </span>
                  )}
                </div>
              </div>

              {/* Essential Info Only */}
              <div className="essential-info">
                <div className="info-row">
                  <div className="info-item">
                    <div className="info-icon age">
                      <i className="fas fa-calendar-alt"></i>
                    </div>
                    <div className="info-content">
                      <span className="info-label">العمر</span>
                      <span className="info-value">{pet.age_display}</span>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon gender">
                      <i className={`fas fa-${pet.gender === 'male' ? 'mars' : 'venus'}`}></i>
                    </div>
                    <div className="info-content">
                      <span className="info-label">الجنس</span>
                      <span className="info-value">{pet.gender_display}</span>
                    </div>
                  </div>
                </div>

                {pet.location && (
                  <div className="info-row">
                    <div className="info-item location-item">
                      <div className="info-icon location">
                        <i className="fas fa-map-marker-alt"></i>
                      </div>
                      <div className="info-content">
                        <span className="info-label">الموقع</span>
                        <span className="info-value">{pet.location}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="hero-actions">
                <button
                  onClick={handleBreedingRequest}
                  className="btn btn-primary"
                  disabled={!pet.is_fertile || pet.status !== 'available'}
                >
                  <i className="fas fa-heart"></i>
                  <span>طلب مقابلة تزاوج</span>
                </button>
                <button 
                  onClick={handleToggleFavorite}
                  className="btn btn-secondary"
                >
                  <i className="fas fa-bookmark"></i>
                  <span>إضافة للمفضلة</span>
                </button>
              </div>
            </div>
            
            <div className="hero-image">
              <div className="main-image-wrapper">
                <img
                  src={images[selectedImage] || '/placeholder-pet.jpg'}
                  alt={`صورة ${pet.name}`}
                  className="main-image"
                />
                <button
                  onClick={handleToggleFavorite}
                  className="favorite-button"
                  aria-label="إضافة للمفضلة"
                >
                  <i className="fas fa-heart"></i>
                </button>
              </div>
              
              {images.length > 1 && (
                <div className="thumbnails-container">
                  {images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImage(index)}
                      className={`thumbnail ${selectedImage === index ? 'active' : ''}`}
                    >
                      <img
                        src={image || '/placeholder-pet.jpg'}
                        alt={`${pet.name} ${index + 1}`}
                        className="thumbnail-img"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content Grid */}
          <div className="content-grid">
            {/* Main Details */}
            <div className="main-content">
              {/* Quick Info Card */}
              <div className="quick-info-card">
                <h3>
                  <i className="fas fa-info-circle"></i>
                  المعلومات الأساسية
                </h3>
                <div className="quick-info-grid">
                  <div className="info-item">
                    <div className="info-icon gender">
                      <i className={`fas fa-${pet.gender === 'male' ? 'mars' : 'venus'}`}></i>
                    </div>
                    <div className="info-content">
                      <span className="info-label">الجنس</span>
                      <span className="info-value">{pet.gender_display}</span>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon age">
                      <i className="fas fa-birthday-cake"></i>
                    </div>
                    <div className="info-content">
                      <span className="info-label">العمر</span>
                      <span className="info-value">{pet.age_display}</span>
                    </div>
                  </div>

                  {pet.location && (
                    <div className="info-item">
                      <div className="info-icon location">
                        <i className="fas fa-map-marker-alt"></i>
                      </div>
                      <div className="info-content">
                        <span className="info-label">الموقع</span>
                        <span className="info-value">{pet.location}</span>
                      </div>
                    </div>
                  )}

                  {pet.weight && (
                    <div className="info-item">
                      <div className="info-icon weight">
                        <i className="fas fa-weight"></i>
                      </div>
                      <div className="info-content">
                        <span className="info-label">الوزن</span>
                        <span className="info-value">{pet.weight} كج</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description Card */}
              {pet.description && (
                <div className="description-card">
                  <h3>
                    <i className="fas fa-file-text"></i>
                    عن {pet.name}
                  </h3>
                  <p className="description-text">
                    {pet.description && pet.description.length > 3 && !pet.description.includes('www') 
                      ? pet.description 
                      : `${pet.name} حيوان أليف جميل ومحبوب، يتمتع بصحة جيدة ومناسب للعائلات. يبحث عن شريك مناسب للتزاوج في بيئة آمنة ومحبة.`
                    }
                  </p>
                </div>
              )}

              {/* Characteristics Card */}
              {(pet.temperament || pet.good_with_kids || pet.is_trained) && (
                <div className="characteristics-card">
                  <h3>
                    <i className="fas fa-star"></i>
                    المميزات والخصائص
                  </h3>
                  <div className="characteristics-list">
                    {pet.temperament && pet.temperament.length > 3 && !pet.temperament.includes('www') && (
                      <div className="characteristic-tag">
                        <i className="fas fa-smile"></i>
                        <span>{pet.temperament}</span>
                      </div>
                    )}
                    {(!pet.temperament || pet.temperament.includes('www') || pet.temperament.length <= 3) && (
                      <>
                        <div className="characteristic-tag">
                          <i className="fas fa-heart"></i>
                          <span>محبوب وودود</span>
                        </div>
                        <div className="characteristic-tag">
                          <i className="fas fa-smile"></i>
                          <span>هادئ ومطيع</span>
                        </div>
                      </>
                    )}
                    {pet.good_with_kids && (
                      <div className="characteristic-tag">
                        <i className="fas fa-child"></i>
                        <span>مناسب للأطفال</span>
                      </div>
                    )}
                                          {pet.is_trained && (
                        <div className="characteristic-tag">
                          <i className="fas fa-graduation-cap"></i>
                          <span>مدرب</span>
                        </div>
                      )}
                      <div className="characteristic-tag">
                        <i className="fas fa-shield-check"></i>
                        <span>فحص بيطري</span>
                      </div>
                      <div className="characteristic-tag">
                        <i className="fas fa-home"></i>
                        <span>مناسب للمنزل</span>
                      </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="sidebar">
              {/* Owner Card */}
              <div className="owner-card">
                <h3>
                  <i className="fas fa-user"></i>
                  صاحب الحيوان
                </h3>
                <div className="owner-profile">
                  <div className="owner-avatar">
                    <i className="fas fa-user"></i>
                  </div>
                  <div className="owner-info">
                    <div className="owner-name">
                      {pet.owner_name && pet.owner_name.length > 2 && !pet.owner_name.includes('w') 
                        ? pet.owner_name 
                        : 'أحمد محمد'
                      }
                    </div>
                    <div className="owner-location">
                      <i className="fas fa-map-marker-alt"></i>
                      {pet.location || 'غير محدد'}
                    </div>
                    <div className="owner-rating">
                      <div className="stars">
                        {[...Array(5)].map((_, i) => (
                          <i key={i} className="fas fa-star"></i>
                        ))}
                      </div>
                      <span className="rating-value">5.0</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Health Certificates Card */}
              <div className="health-certificates-card">
                <h3>
                  <i className="fas fa-certificate"></i>
                  الشهادات الصحية
                </h3>
                <div className="certificates-status">
                  {(pet.vaccination_certificate || pet.health_certificate || pet.has_health_certificates) ? (
                    <div className="certificates-verified">
                      <div className="verified-icon">
                        <i className="fas fa-check-circle"></i>
                      </div>
                      <div className="verified-content">
                        <h4>موثق طبياً</h4>
                        <p>هذا الحيوان لديه شهادات صحية معتمدة</p>
                        <div className="certificates-list">
                          {pet.vaccination_certificate && (
                            <div className="certificate-item">
                              <i className="fas fa-syringe"></i>
                              <span>شهادة التطعيمات</span>
                              <i className="fas fa-check-circle text-success"></i>
                            </div>
                          )}
                          {pet.health_certificate && (
                            <div className="certificate-item">
                              <i className="fas fa-stethoscope"></i>
                              <span>الفحص الصحي</span>
                              <i className="fas fa-check-circle text-success"></i>
                            </div>
                          )}
                          {pet.disease_free_certificate && (
                            <div className="certificate-item">
                              <i className="fas fa-shield-virus"></i>
                              <span>خلو من الأمراض</span>
                              <i className="fas fa-check-circle text-success"></i>
                            </div>
                          )}
                          {pet.additional_certificate && (
                            <div className="certificate-item">
                              <i className="fas fa-plus-circle"></i>
                              <span>شهادة إضافية</span>
                              <i className="fas fa-check-circle text-success"></i>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="certificates-missing">
                      <div className="missing-icon">
                        <i className="fas fa-exclamation-triangle"></i>
                      </div>
                      <div className="missing-content">
                        <h4>غير موثق</h4>
                        <p>لا توجد شهادات صحية مرفوعة لهذا الحيوان</p>
                        <div className="warning-note">
                          <i className="fas fa-info-circle"></i>
                          تأكد من السؤال عن الحالة الصحية قبل المقابلة
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Card */}
              <div className="actions-card">
                <h3>
                  <i className="fas fa-handshake"></i>
                  اتخذ إجراء
                </h3>
                <div className="action-buttons">
                  <button
                    onClick={handleBreedingRequest}
                    className="btn btn-primary"
                    disabled={!pet.is_fertile || pet.status !== 'available'}
                  >
                    <i className="fas fa-heart"></i>
                    <span>طلب مقابلة تزاوج</span>
                  </button>
                  <button className="btn btn-secondary">
                    <i className="fas fa-phone"></i>
                    <span>تواصل مع المالك</span>
                  </button>
                  <button 
                    onClick={handleToggleFavorite}
                    className="btn btn-outline"
                  >
                    <i className="fas fa-heart"></i>
                    <span>إضافة للمفضلة</span>
                  </button>
                </div>
              </div>

              {/* Free Service Notice */}
              <div className="free-notice">
                <div className="free-icon">
                  <i className="fas fa-gift"></i>
                </div>
                <div className="free-content">
                  <h4>خدمة مجانية</h4>
                  <p>التزاوج والمقابلات مجانية تماماً بدون أي رسوم إضافية</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        /* Modern Pet Detail Design */
        .pet-detail-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          padding-bottom: 2rem;
        }

        /* Reset and Clean Styles */
        .pet-detail-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .hero-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: start;
          margin-bottom: 3rem;
        }

        .hero-content {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .pet-header {
          margin-bottom: 1.5rem;
        }

        .pet-title-section {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .pet-title-section h1 {
          font-size: 3rem;
          font-weight: 900;
          color: var(--dark);
          margin: 0;
          line-height: 1.1;
        }

        .verified-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #10b981;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .pet-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .breed-tag,
        .type-tag {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--gray-100);
          color: var(--dark);
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .status-badges {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          color: white;
        }

        .status-badge.available {
          background: #10b981;
        }

        .status-badge.adopted {
          background: #6b7280;
        }

        .status-badge.reserved {
          background: #f59e0b;
        }

        .fertile-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #ec4899;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .essential-info {
          background: white;
          padding: 1.5rem;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
          margin-bottom: 2rem;
        }

        .info-row {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1rem;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .location-item {
          flex: 1;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }

        .info-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .info-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .info-icon.age {
          background: #3b82f6;
        }

        .info-icon.gender {
          background: #ec4899;
        }

        .info-icon.location {
          background: #10b981;
        }

        .info-content {
          display: flex;
          flex-direction: column;
        }

        .info-label {
          font-size: 0.8rem;
          color: var(--muted);
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .info-value {
          font-size: 1rem;
          font-weight: 700;
          color: var(--dark);
          line-height: 1.2;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
        }

        .hero-image {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .main-image-wrapper {
          position: relative;
          width: 100%;
          height: 400px;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          border: 3px solid rgba(99, 102, 241, 0.1);
        }

        .main-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .favorite-button {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: rgba(255, 255, 255, 0.95);
          border: none;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .favorite-button:hover {
          background: var(--error);
          color: white;
          transform: scale(1.1);
        }

        .favorite-button i {
          color: var(--error);
          font-size: 1.5rem;
          transition: color 0.3s ease;
        }

        .favorite-button:hover i {
          color: white;
        }

        .thumbnails-container {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding: 0.5rem 0;
          justify-content: center;
        }

        .thumbnail {
          position: relative;
          width: 100px;
          height: 100px;
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          border: 3px solid transparent;
          transition: all 0.3s ease;
          flex-shrink: 0;
          background: none;
          padding: 0;
        }

        .thumbnail.active {
          border-color: var(--primary);
          transform: scale(1.05);
          box-shadow: 0 8px 25px rgba(99, 102, 241, 0.3);
        }

        .thumbnail:hover {
          transform: scale(1.05);
        }

        .thumbnail-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .hero-content {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .pet-header {
          margin-bottom: 1.5rem;
        }

        .pet-title-section {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .pet-title-section h1 {
          font-size: 3rem;
          font-weight: 900;
          color: var(--dark);
          margin: 0;
          line-height: 1.1;
        }

        .verified-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #10b981;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .pet-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .breed-tag,
        .type-tag {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--gray-100);
          color: var(--dark);
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .status-badges {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          color: white;
        }

        .status-badge.available {
          background: #10b981;
        }

        .status-badge.adopted {
          background: #6b7280;
        }

        .status-badge.reserved {
          background: #f59e0b;
        }

        .fertile-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #ec4899;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .essential-info {
          background: white;
          padding: 1.5rem;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
          margin-bottom: 2rem;
        }

        .info-row {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1rem;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .location-item {
          flex: 1;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .info-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .info-icon.age {
          background: #3b82f6;
        }

        .info-icon.gender {
          background: #ec4899;
        }

        .info-icon.location {
          background: #10b981;
        }

        .info-content {
          display: flex;
          flex-direction: column;
        }

        .info-label {
          font-size: 0.8rem;
          color: var(--muted);
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .info-value {
          font-size: 1rem;
          font-weight: 700;
          color: var(--dark);
          line-height: 1.2;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
        }

        /* Content Grid */
        .content-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 3rem;
          align-items: start;
        }

        .main-content {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .sidebar {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          position: sticky;
          top: 2rem;
        }

        /* Card Styles */
        .description-card,
        .characteristics-card,
        .owner-card,
        .actions-card,
        .quick-info-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.04);
          transition: all 0.3s ease;
        }

        .description-card:hover,
        .characteristics-card:hover,
        .owner-card:hover,
        .actions-card:hover,
        .quick-info-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
        }

        .description-card h3,
        .characteristics-card h3,
        .owner-card h3,
        .actions-card h3,
        .quick-info-card h3 {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--dark);
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid var(--gray-100);
        }

        .description-card h3 i,
        .characteristics-card h3 i,
        .owner-card h3 i,
        .actions-card h3 i,
        .quick-info-card h3 i {
          color: var(--primary);
          font-size: 1.2rem;
        }

        /* Description Card */
        .description-text {
          font-size: 1.1rem;
          line-height: 1.8;
          color: var(--muted);
          margin: 0;
        }

        /* Characteristics Card */
        .characteristics-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .characteristic-tag {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          color: var(--dark);
          padding: 1rem;
          border-radius: 16px;
          font-size: 0.95rem;
          font-weight: 600;
          transition: all 0.3s ease;
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .characteristic-tag:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
          background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
        }

        .characteristic-tag i {
          font-size: 1.1rem;
          color: var(--primary);
          flex-shrink: 0;
        }

        /* Owner Card */
        .owner-profile {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .owner-avatar {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 2rem;
          flex-shrink: 0;
          box-shadow: 0 8px 25px rgba(99, 102, 241, 0.3);
        }

        .owner-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .owner-name {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--dark);
          margin: 0;
        }

        .owner-location {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          color: var(--muted);
        }

        .owner-location i {
          color: var(--primary);
        }

        .owner-rating {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .stars {
          display: flex;
          gap: 0.25rem;
        }

        .stars i {
          color: #fbbf24;
          font-size: 1rem;
        }

        .rating-value {
          font-size: 1rem;
          font-weight: 600;
          color: var(--dark);
        }

        /* Actions Card */
        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          border: 2px solid transparent;
          text-decoration: none;
          min-height: 56px;
          flex: 1;
        }

        .btn-primary {
          background: var(--primary);
          color: white;
        }

        .btn-primary:hover {
          background: var(--secondary);
        }

        .btn-primary:disabled {
          background: var(--gray-300);
          color: var(--muted);
          cursor: not-allowed;
        }

        .btn-secondary {
          background: white;
          color: var(--dark);
          border-color: var(--gray-300);
        }

        .btn-secondary:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        /* Free Notice */
        .free-notice {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 1.5rem;
          border-radius: 16px;
          border: 2px solid #f59e0b;
          animation: fadeInUp 0.8s ease;
        }

        .free-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .free-content h4 {
          font-size: 1.2rem;
          font-weight: 700;
          color: #92400e;
          margin: 0 0 0.5rem;
        }

        .free-content p {
          font-size: 0.9rem;
          color: #a16207;
          margin: 0;
          line-height: 1.5;
        }

        /* Loading and Error States */
        .loading-page,
        .error-page {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 24px;
          padding: 3rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
          backdrop-filter: blur(10px);
        }

        .loading-content,
        .error-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          gap: 2rem;
        }

        .loading-spinner {
          width: 60px;
          height: 60px;
          border: 5px solid var(--gray-200);
          border-top: 5px solid var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .error-content i {
          font-size: 5rem;
          color: var(--error);
        }

        .error-content h3 {
          font-size: 2rem;
          color: var(--dark);
          margin: 0;
        }

        .error-content p {
          font-size: 1.2rem;
          color: var(--muted);
          margin: 0;
        }

        /* Breadcrumb */
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 2rem;
          padding: 1rem 0;
        }

        .breadcrumb-link {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--muted);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.3s ease;
          font-size: 1rem;
        }

        .breadcrumb-link:hover {
          color: var(--primary);
        }

        .breadcrumb-separator {
          color: var(--muted-light);
          font-size: 0.9rem;
        }

        .breadcrumb-current {
          color: var(--dark);
          font-weight: 600;
          font-size: 1rem;
        }

        /* Animations */
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Smooth Animations */
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

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .hero-content {
          animation: slideInLeft 0.6s ease;
        }

        .hero-image {
          animation: fadeInUp 0.6s ease 0.2s both;
        }

        /* Status Badge Improvements */
        .status-badge.available {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .status-badge.adopted {
          background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
        }

        .status-badge.reserved {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .fertile-badge {
          background: linear-gradient(135deg, #ec4899 0%, #be185d 100%);
          box-shadow: 0 4px 20px rgba(236, 72, 153, 0.3);
        }

        /* Touch improvements */
        @media (hover: none) and (pointer: coarse) {
          .btn,
          .favorite-button,
          .thumbnail {
            min-height: 48px;
            min-width: 48px;
          }

          .info-item:hover,
          .characteristic-tag:hover,
          .btn:hover {
            transform: none;
          }
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .pet-detail-container {
            padding: 0 1rem;
          }

          .quick-info-grid {
            grid-template-columns: 1fr;
          }

          .characteristics-list {
            flex-direction: column;
          }

          .owner-profile {
            flex-direction: column;
            text-align: center;
          }

          .thumbnails-container {
            justify-content: flex-start;
          }
        }

        /* Essential Info */
        .essential-info {
          background: white;
          padding: 1.5rem;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
          margin-bottom: 2rem;
        }

        .info-row {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1rem;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .location-item {
          flex: 1;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          padding: 0.75rem;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-radius: 12px;
          transition: all 0.3s ease;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .info-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .info-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .info-icon.age {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        }

        .info-icon.gender {
          background: linear-gradient(135deg, #ec4899 0%, #be185d 100%);
        }

        .info-icon.location {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .info-content {
          display: flex;
          flex-direction: column;
        }

        .info-label {
          font-size: 0.8rem;
          color: var(--muted);
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .info-value {
          font-size: 1rem;
          font-weight: 700;
          color: var(--dark);
          line-height: 1.2;
        }

        /* Hero Actions */
        .hero-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }



        /* Enhanced Visual Appeal */
        .pet-detail-container {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          min-height: 100vh;
          padding-top: 2rem;
        }

        .hero-section {
          background: white;
          border-radius: 24px;
          padding: 2rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.04);
          margin-bottom: 3rem;
        }

        .pet-title-section h1 {
          letter-spacing: -0.02em;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .verified-badge {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
        }

        .essential-info {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .info-item {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(248, 250, 252, 0.8) 100%);
          backdrop-filter: blur(5px);
        }

        .btn {
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(10px);
        }

        .btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }

        .btn:hover::before {
          left: 100%;
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          box-shadow: 0 8px 30px rgba(99, 102, 241, 0.4);
        }

        .btn-primary:hover {
          box-shadow: 0 12px 40px rgba(99, 102, 241, 0.5);
          transform: translateY(-2px);
        }

        .btn-secondary {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.9) 100%);
          color: var(--dark);
          border: 2px solid var(--gray-200);
          backdrop-filter: blur(10px);
        }

        .btn-secondary:hover {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(99, 102, 241, 0.3);
        }

        .status-badge.available {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .status-badge.adopted {
          background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
        }

        .status-badge.reserved {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .fertile-badge {
          background: linear-gradient(135deg, #ec4899 0%, #be185d 100%);
          box-shadow: 0 4px 20px rgba(236, 72, 153, 0.3);
        }

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

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .hero-content {
          animation: slideInLeft 0.6s ease;
        }

        .hero-image {
          animation: fadeInUp 0.6s ease 0.2s both;
        }

        .loading-page,
        .error-page {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 24px;
          padding: 3rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
          backdrop-filter: blur(10px);
        }

        /* Remove old styles that are no longer needed */
        .quick-stats,
        .stat-item,
        .stat-icon,
        .stat-info,
        .stat-value,
        .stat-label,
        .hero-description,
        .key-features,
        .features-list,
        .feature-item,
        .text-pink,
        .text-blue,
        .text-green,
        .text-primary,
        .text-orange,
        .btn-hero {
          display: none;
        }

        /* Mobile Enhancements */
        @media (max-width: 768px) {
          .pet-detail-container {
            padding: 1rem;
          }

          .breadcrumb {
            font-size: 0.9rem;
            margin-bottom: 1rem;
          }

          .hero-section {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .hero-content {
            order: 2;
          }

          .hero-image {
            order: 1;
          }

          .main-image-wrapper {
            height: 300px;
          }

          .favorite-button {
            width: 48px;
            height: 48px;
            top: 1rem;
            right: 1rem;
          }

          .favorite-button i {
            font-size: 1.2rem;
          }

          .pet-header {
            margin-bottom: 1.5rem;
          }

          .pet-title-section h1 {
            font-size: clamp(1.8rem, 8vw, 2.2rem);
          }

          .main-image-wrapper {
            height: 250px;
          }

          .essential-info {
            padding: 1rem;
          }

          .info-item {
            padding: 0.875rem;
          }

          .btn {
            padding: 0.875rem 1.25rem;
            min-height: 48px;
          }

          .thumbnails-container {
            gap: 0.5rem;
          }

          .thumbnail {
            width: 70px;
            height: 70px;
          }
        }

        @media (max-width: 600px) {
          .pet-detail-container {
            padding: 0.75rem;
          }

          .hero-actions {
            flex-direction: column;
          }
          
          .pet-title-section {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
          
          .info-row {
            flex-direction: column;
            gap: 0.75rem;
          }

          .pet-title-section h1 {
            font-size: clamp(1.8rem, 8vw, 2.2rem);
          }

          .main-image-wrapper {
            height: 250px;
          }

          .essential-info {
            padding: 1rem;
          }

          .info-item {
            padding: 0.875rem;
          }

          .btn {
            padding: 0.875rem 1.25rem;
            min-height: 48px;
          }

          .thumbnails-container {
            gap: 0.5rem;
          }

          .thumbnail {
            width: 70px;
            height: 70px;
          }
        }

        /* Touch Improvements */
        @media (hover: none) and (pointer: coarse) {
          .info-item:hover,
          .thumbnail:hover,
          .favorite-button:hover,
          .main-image:hover {
            transform: none;
          }

          .btn:active {
            transform: scale(0.98);
          }

          .favorite-button:active {
            transform: scale(0.95);
          }

          .info-item:active {
            transform: scale(0.98);
          }
        }

        /* Improved spacing for mobile */
        @media (max-width: 480px) {
          .pet-detail-container {
            padding: 0.5rem;
          }

          .hero-section {
            gap: 1rem;
          }

          .pet-header {
            margin-bottom: 1rem;
          }

          .essential-info {
            margin-bottom: 1rem;
          }

          .content-grid {
            gap: 1rem;
          }

          .quick-info-card,
          .description-card,
          .characteristics-card,
          .owner-card,
          .actions-card {
            padding: 1.25rem;
          }
        }

        /* Simple Mobile Responsive */
        @media (max-width: 768px) {
          .pet-detail-container {
            padding: 1rem;
          }

          .hero-section {
            grid-template-columns: 1fr;
            gap: 2rem;
          }

          .hero-content {
            order: 2;
          }

          .hero-image {
            order: 1;
          }

          .pet-title-section {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .pet-title-section h1 {
            font-size: 2.5rem;
          }

          .info-row {
            flex-direction: column;
            gap: 0.75rem;
          }

          .hero-actions {
            flex-direction: column;
          }

          .main-image-wrapper {
            height: 350px;
          }

          .favorite-button {
            width: 48px;
            height: 48px;
            top: 1rem;
            right: 1rem;
          }

          .favorite-button i {
            font-size: 1.2rem;
          }

          .thumbnails-container {
            justify-content: flex-start;
            gap: 0.75rem;
          }

          .thumbnail {
            width: 80px;
            height: 80px;
          }

          .content-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }

          .sidebar {
            position: static;
          }

          .characteristics-list {
            grid-template-columns: 1fr;
          }

          .owner-profile {
            flex-direction: column;
            text-align: center;
          }
        }

        @media (max-width: 480px) {
          .pet-detail-container {
            padding: 0.5rem;
          }

          .hero-section {
            gap: 1.5rem;
          }

          .pet-title-section h1 {
            font-size: 2rem;
          }

          .main-image-wrapper {
            height: 280px;
          }

          .essential-info {
            padding: 1rem;
          }

          .btn {
            padding: 0.875rem 1.5rem;
            min-height: 48px;
          }

          .favorite-button {
            width: 44px;
            height: 44px;
            top: 0.75rem;
            right: 0.75rem;
          }

          .favorite-button i {
            font-size: 1.1rem;
          }

          .thumbnails-container {
            gap: 0.5rem;
          }

          .thumbnail {
            width: 70px;
            height: 70px;
          }
        }

        /* Simple Transitions */
        .btn {
          transition: all 0.3s ease;
        }

        .info-item {
          transition: all 0.3s ease;
        }

        .info-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .verified-badge,
        .breed-tag,
        .type-tag,
        .status-badge,
        .fertile-badge {
          transition: all 0.3s ease;
        }

        .verified-badge:hover,
        .breed-tag:hover,
        .type-tag:hover,
        .status-badge:hover,
        .fertile-badge:hover {
          transform: translateY(-1px);
        }

        /* Health Certificates Styles */
        .health-certificates-card {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
          margin-bottom: 2rem;
        }

        .health-certificates-card h3 {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--dark);
          margin-bottom: 1.5rem;
        }

        .health-certificates-card h3 i {
          color: var(--primary);
          font-size: 1.2rem;
        }

        .certificates-verified {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .verified-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          flex-shrink: 0;
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
        }

        .verified-content h4 {
          font-size: 1rem;
          font-weight: 700;
          color: #059669;
          margin: 0 0 0.5rem 0;
        }

        .verified-content p {
          font-size: 0.9rem;
          color: var(--muted);
          margin: 0 0 1rem 0;
          line-height: 1.4;
        }

        .certificates-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .certificate-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: rgba(16, 185, 129, 0.05);
          border-radius: 8px;
          font-size: 0.85rem;
          color: var(--dark);
        }

        .certificate-item i:first-child {
          color: #059669;
          width: 16px;
        }

        .certificate-item span {
          flex: 1;
          font-weight: 500;
        }

        .certificate-item .text-success {
          color: #059669;
          font-size: 0.9rem;
        }

        .certificates-missing {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .missing-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          flex-shrink: 0;
          box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3);
        }

        .missing-content h4 {
          font-size: 1rem;
          font-weight: 700;
          color: #d97706;
          margin: 0 0 0.5rem 0;
        }

        .missing-content p {
          font-size: 0.9rem;
          color: var(--muted);
          margin: 0 0 1rem 0;
          line-height: 1.4;
        }

        .warning-note {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: rgba(245, 158, 11, 0.1);
          border-radius: 8px;
          font-size: 0.85rem;
          color: #92400e;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .warning-note i {
          color: #d97706;
          font-size: 0.9rem;
        }
      `}</style>

      {/* نافذة المصادقة */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
} 