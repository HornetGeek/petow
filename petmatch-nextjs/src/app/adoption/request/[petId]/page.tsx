'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/lib/api';
import Header from '@/components/Header';

// --- Types
interface Pet {
  id: number;
  name: string;
  pet_type: string;
  breed: string;
  age_months: number;
  gender: string;
  main_image: string;
}

interface AdoptionFormData {
  adopter_name: string;
  adopter_email: string;
  adopter_phone: string;
  adopter_age: number;
  adopter_occupation: string;
  adopter_address: string;
  adopter_id_number: string;
}

export default function AdoptionApplicationPage() {
  const router = useRouter();
  const params = useParams();
  const { user, isAuthenticated } = useAuth();

  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<AdoptionFormData>({
    adopter_name: '',
    adopter_email: '',
    adopter_phone: '',
    adopter_age: 0,
    adopter_occupation: '',
    adopter_address: '',
    adopter_id_number: '',
  });

  const petId = params.petId as string;

  // Prefill from auth
  useEffect(() => {
    if (user) {
      setFormData((p) => ({
        ...p,
        adopter_name: p.adopter_name || (user.full_name ?? ''),
        adopter_email: p.adopter_email || (user.email ?? ''),
        adopter_phone: p.adopter_phone || (user.phone ?? ''),
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    const fetchPet = async () => {
      try {
        setLoading(true);
        const response = await apiService.getPet(parseInt(petId));
        setPet({
          ...response,
          breed: typeof response.breed === 'number' ? String(response.breed) : response.breed,
        });
      } catch (err) {
        console.error('Error fetching pet:', err);
        setError('حدث خطأ أثناء تحميل بيانات الحيوان.');
      } finally {
        setLoading(false);
      }
    };

    if (petId) fetchPet();
  }, [petId, isAuthenticated, router]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, type } = e.target;
    const value = type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData((p) => ({
      ...p,
      [name]: type === 'number' ? parseInt(String(value)) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAuthenticated) {
      setError('يرجى تسجيل الدخول أولاً');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create minimal data for API
      const apiData = {
        ...formData,
        pet: parseInt(petId),
        // Add required fields with default values
        housing_type: 'apartment',
        family_members: 1,
        experience_level: 'beginner',
        time_availability: 'full_time',
        family_agreement: true,
        agrees_to_follow_up: true,
        agrees_to_vet_care: true,
        agrees_to_training: true,
        feeding_plan: 'ستتم العناية بالتغذية بانتظام',
        exercise_plan: 'ستتم ممارسة التمارين يومياً',
        vet_care_plan: 'ستتم المتابعة البيطرية المنتظمة',
        emergency_plan: 'سيتم التعامل مع الطوارئ فوراً',
        reason_for_adoption: 'الرغبة في تربية حيوان أليف',
        other_pets: false,
        has_other_pets: false,
        has_yard: false,
        yard_size: '',
        children_ages: '',
        other_pets_details: '',
        previous_experience: '',
        special_requirements: '',
        signature_image: null,
        additional_documents: null,
        national_id_front: null,
        national_id_back: null,
      };

      await apiService.createAdoptionRequest(apiData);
      router.push('/adoption/my-requests');
    } catch (err: any) {
      console.error('Error submitting adoption request:', err);
      setError('حدث خطأ أثناء إرسال طلب التبني. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <span>جاري تحميل بيانات الحيوان...</span>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="error-container">
        <div className="error-content">
          <i className="fas fa-exclamation-circle"></i>
          <h3>لم يتم العثور على الحيوان</h3>
          <p>تحقق من الرابط أو عُد لصفحة التبني</p>
          <button onClick={() => router.push('/adoption')} className="btn btn-primary">
            العودة إلى صفحة التبني
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adoption-request-page">
      <Header />
      
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-background">
          <div className="hero-pattern"></div>
        </div>
        
        <div className="container">
          <div className="hero-content">
            {/* Pet Image Display */}
            <div className="hero-pet-image">
              <div className="pet-image-frame">
                <img 
                  src={pet.main_image} 
                  alt={pet.name} 
                  className="hero-pet-img"
                />
                <div className="pet-image-glow"></div>
                <div className="pet-image-border"></div>
              </div>
            </div>
            
            <h1 className="hero-title">
              <i className="fas fa-heart title-heart"></i>
              طلب تبني {pet.name}
            </h1>
            
            <p className="hero-description">
              املأ البيانات التالية لإتمام طلب التبني - نحن هنا لضمان وصول الحيوان لأسرة محبة ومناسبة
            </p>
            
            {/* Pet Info Pills */}
            <div className="hero-pet-info">
              <div className="info-pill type-pill">
                <i className="fas fa-paw"></i>
                <span>{pet.pet_type === 'cats' ? 'قط' : 'كلب'}</span>
              </div>
              <div className="info-pill breed-pill">
                <i className="fas fa-dna"></i>
                <span>{pet.breed}</span>
              </div>
              <div className="info-pill age-pill">
                <i className="fas fa-calendar-alt"></i>
                <span>{pet.age_months} شهر</span>
              </div>
              <div className="info-pill gender-pill">
                <i className="fas fa-venus-mars"></i>
                <span>{pet.gender === 'M' ? 'ذكر' : 'أنثى'}</span>
              </div>
            </div>
            
            <div className="hero-divider"></div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container">
        <div className="content-wrapper">
          
          {/* Form Section - LEFT SIDE */}
          <div className="form-section">
            <div className="form-container">
              {error && (
                <div className="error-alert">
                  <i className="fas fa-exclamation-triangle"></i>
                  <div className="error-content">
                    <strong>خطأ</strong>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="adoption-form">
                <div className="form-section-header">
                  <h3>
                    <i className="fas fa-user"></i>
                    المعلومات الشخصية
                  </h3>
                </div>
                
                <div className="form-grid">
                  <div className="form-group">
                    <label>
                      <i className="fas fa-user"></i>
                      الاسم الكامل *
                    </label>
                    <input
                      type="text"
                      name="adopter_name"
                      value={formData.adopter_name}
                      onChange={onChange}
                      required
                      placeholder="اكتب اسمك الكامل"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <i className="fas fa-envelope"></i>
                      البريد الإلكتروني *
                    </label>
                    <input
                      type="email"
                      name="adopter_email"
                      value={formData.adopter_email}
                      onChange={onChange}
                      required
                      placeholder="example@email.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <i className="fas fa-phone"></i>
                      رقم الهاتف *
                    </label>
                    <input
                      type="tel"
                      name="adopter_phone"
                      value={formData.adopter_phone}
                      onChange={onChange}
                      required
                      placeholder="01234567890"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <i className="fas fa-birthday-cake"></i>
                      العمر *
                    </label>
                    <input
                      type="number"
                      name="adopter_age"
                      value={formData.adopter_age}
                      onChange={onChange}
                      min="18"
                      required
                      placeholder="25"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <i className="fas fa-briefcase"></i>
                      المهنة *
                    </label>
                    <input
                      type="text"
                      name="adopter_occupation"
                      value={formData.adopter_occupation}
                      onChange={onChange}
                      required
                      placeholder="مهنتك"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <i className="fas fa-id-card"></i>
                      رقم الهوية *
                    </label>
                    <input
                      type="text"
                      name="adopter_id_number"
                      value={formData.adopter_id_number}
                      onChange={onChange}
                      required
                      placeholder="رقم البطاقة الوطنية"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>
                      <i className="fas fa-map-marker-alt"></i>
                      العنوان *
                    </label>
                    <textarea
                      name="adopter_address"
                      value={formData.adopter_address}
                      onChange={onChange}
                      required
                      rows={4}
                      placeholder="اكتب عنوانك بالتفصيل"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="submit-button"
                  >
                    {submitting ? (
                      <>
                        <div className="loading-spinner"></div>
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-heart"></i>
                        إرسال طلب التبني
                      </>
                    )}
                  </button>

                  <div className="info-card">
                    <div className="info-header">
                      <i className="fas fa-info-circle"></i>
                      <strong>ملاحظة مهمة</strong>
                    </div>
                    <p>
                      سيتم مراجعة طلبك والتواصل معك خلال 48 ساعة. نحن نهتم بضمان وصول الحيوان لأسرة محبة ومناسبة.
                    </p>
                  </div>
                </div>
              </form>
            </div>
          </div>


        </div>
      </div>

      {/* Styles */}
      <style jsx>{`
        .adoption-request-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        }

        /* Hero Section */
        .hero-section {
          position: relative;
          padding: 4rem 0;
          margin-bottom: 3rem;
          overflow: hidden;
        }

        .hero-background {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, var(--primary-light) 0%, var(--secondary) 100%);
        }

        .hero-pattern {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
          opacity: 0.3;
        }

        .hero-content {
          position: relative;
          z-index: 2;
          text-align: center;
          color: white;
        }

        /* Hero Pet Image */
        .hero-pet-image {
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: center;
        }

        .pet-image-frame {
          position: relative;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          overflow: hidden;
          margin: 0 auto;
        }

        .hero-pet-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
          transition: all 0.3s ease;
        }

        .pet-image-glow {
          position: absolute;
          top: -10px;
          left: -10px;
          right: -10px;
          bottom: -10px;
          background: linear-gradient(45deg, var(--primary), var(--secondary), var(--accent));
          border-radius: 50%;
          opacity: 0.3;
          filter: blur(20px);
          animation: glow 3s ease-in-out infinite alternate;
        }

        .pet-image-border {
          position: absolute;
          top: -5px;
          left: -5px;
          right: -5px;
          bottom: -5px;
          border: 3px solid transparent;
          border-radius: 50%;
          background: linear-gradient(45deg, var(--primary), var(--secondary)) border-box;
          -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: destination-out;
          mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          animation: rotate 10s linear infinite;
        }

        /* Hero Pet Info Pills */
        .hero-pet-info {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin: 1.5rem 0;
          flex-wrap: wrap;
        }

        .info-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.8rem 1.2rem;
          border-radius: 25px;
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .info-pill:hover {
          transform: translateY(-3px);
          background: rgba(255, 255, 255, 0.25);
          box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }

        .info-pill i {
          font-size: 1rem;
        }

        .type-pill {
          background: linear-gradient(135deg, rgba(2, 183, 180, 0.8), rgba(2, 183, 180, 0.6));
        }

        .breed-pill {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(34, 197, 94, 0.6));
        }

        .age-pill {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.8), rgba(99, 102, 241, 0.6));
        }

        .gender-pill {
          background: linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(236, 72, 153, 0.6));
        }

        .hero-icon {
          width: 80px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.3);
          animation: pulse 2s infinite;
        }

        .hero-icon i {
          color: white;
          font-size: 2rem;
        }

        .hero-title {
          font-size: clamp(32px, 5vw, 48px);
          font-weight: 900;
          margin-bottom: 1rem;
          text-shadow: 0 4px 8px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
        }

        .title-heart {
          color: var(--accent);
          font-size: 0.8em;
          animation: pulse 2s infinite;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }

        .hero-description {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1.2rem;
          max-width: 600px;
          margin: 0 auto 2rem;
          line-height: 1.6;
        }

        .hero-divider {
          width: 100px;
          height: 4px;
          background: white;
          border-radius: 2px;
          margin: 0 auto;
          box-shadow: 0 2px 8px rgba(255,255,255,0.3);
        }

        /* Content Layout */
        .content-wrapper {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        /* Pet Info Section */
        .pet-info-section {
          display: flex;
          justify-content: flex-start;
        }

        .pet-card {
          background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
          padding: 2rem;
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          border: 1px solid var(--gray-200);
          width: 100%;
          max-width: 380px;
          text-align: center;
          position: relative;
          overflow: hidden;
          position: sticky;
          top: 2rem;
        }

        .pet-card::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, var(--primary-light) 0%, transparent 70%);
          opacity: 0.03;
          animation: float 8s ease-in-out infinite;
        }

        .pet-image-container {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          overflow: hidden;
          margin: 0 auto 1.5rem;
          border: 3px solid var(--primary);
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
          position: relative;
        }

        .pet-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pet-image-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(45deg, transparent 0%, rgba(255,255,255,0.1) 100%);
          border-radius: 50%;
        }

        .pet-name {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--dark);
          margin-bottom: 2rem;
          text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .pet-details-grid {
          display: grid;
          gap: 1rem;
        }

        .detail-card {
          padding: 1.2rem;
          border-radius: 15px;
          border: 2px solid;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .detail-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }

        .detail-card::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
          transition: all 0.3s ease;
          opacity: 0;
        }

        .detail-card:hover::before {
          opacity: 1;
        }

        .type-card {
          background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%);
          border-color: var(--primary);
        }

        .breed-card {
          background: linear-gradient(135deg, var(--success-light) 0%, var(--success) 100%);
          border-color: var(--success);
        }

        .age-card {
          background: linear-gradient(135deg, var(--secondary-light) 0%, var(--secondary) 100%);
          border-color: var(--secondary);
        }

        .gender-card {
          background: linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%);
          border-color: var(--accent);
        }

        .detail-icon {
          color: white;
          font-size: 1.2rem;
          margin-bottom: 0.5rem;
        }

        .detail-label {
          color: white;
          font-weight: 700;
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
        }

        .detail-value {
          color: white;
          font-weight: 600;
          font-size: 1rem;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        /* Form Section */
        .form-section {
          width: 100%;
        }

        .form-container {
          background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
          padding: 3rem;
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          border: 1px solid var(--gray-200);
          position: relative;
          overflow: hidden;
        }

        .form-container::before {
          content: '';
          position: absolute;
          top: -30%;
          left: -30%;
          width: 160%;
          height: 160%;
          background: radial-gradient(circle, var(--secondary-light) 0%, transparent 60%);
          opacity: 0.03;
          animation: float 8s ease-in-out infinite reverse;
        }

        .error-alert {
          background: linear-gradient(135deg, var(--error-light) 0%, var(--error) 100%);
          border: 1px solid var(--error);
          border-radius: 15px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 15px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
          color: white;
        }

        .error-alert i {
          font-size: 1.5rem;
          animation: pulse 2s infinite;
        }

        .error-content strong {
          display: block;
          font-size: 1.1rem;
          margin-bottom: 4px;
        }

        .error-content p {
          margin: 0;
          opacity: 0.9;
        }

        .adoption-form {
          position: relative;
          z-index: 2;
        }

        .form-section-header {
          margin-bottom: 2.5rem;
        }

        .form-section-header h3 {
          font-size: 1.5rem;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 15px;
          font-weight: 800;
          padding: 1.5rem 2rem;
          background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%);
          color: white;
          border-radius: 15px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .form-section-header i {
          font-size: 1.3rem;
        }

        .form-grid {
          display: grid;
          gap: 2rem;
          grid-template-columns: 1fr;
        }

        @media (min-width: 768px) {
          .form-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-group {
          background: white;
          padding: 1.5rem;
          border-radius: 15px;
          border: 2px solid var(--gray-200);
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          transition: all 0.3s ease;
        }

        .form-group:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
          border-color: var(--primary);
        }

        .form-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          color: var(--dark);
          font-weight: 700;
          font-size: 1rem;
        }

        .form-group label i {
          color: var(--primary);
          font-size: 0.9rem;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid var(--gray-200);
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.3s ease;
          font-family: 'Cairo, sans-serif';
          background: var(--gray-50);
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--primary);
          background: white;
          box-shadow: 0 0 0 4px rgba(2, 183, 180, 0.1);
        }

        .form-group textarea {
          resize: vertical;
          min-height: 100px;
        }

        /* Form Actions */
        .form-actions {
          border-top: 2px solid var(--gray-200);
          padding-top: 2.5rem;
          margin-top: 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .submit-button {
          width: 100%;
          padding: 20px 32px;
          font-size: 1.2rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          cursor: pointer;
          border: none;
          border-radius: 15px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
          color: white;
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
          position: relative;
          overflow: hidden;
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(0,0,0,0.2);
        }

        .submit-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .submit-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s;
          animation: shimmer 2s infinite;
        }

        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top: 3px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .info-card {
          background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%);
          padding: 2rem;
          border-radius: 15px;
          text-align: center;
          border: 2px solid var(--primary);
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
          position: relative;
          overflow: hidden;
        }

        .info-card::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
          animation: float 10s ease-in-out infinite;
        }

        .info-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          margin-bottom: 12px;
          position: relative;
          z-index: 2;
        }

        .info-header i {
          color: white;
          font-size: 1.5rem;
          animation: pulse 2s infinite;
        }

        .info-header strong {
          color: white;
          font-size: 1.3rem;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .info-card p {
          color: white;
          margin: 0;
          font-size: 1.1rem;
          line-height: 1.7;
          opacity: 0.95;
          position: relative;
          z-index: 2;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        /* Animations */
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes glow {
          0% { opacity: 0.3; transform: scale(1); }
          100% { opacity: 0.6; transform: scale(1.1); }
        }

        @keyframes rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .hero-section {
            padding: 3rem 0;
          }
          
          .form-container {
            padding: 2rem;
          }
          
          .pet-image-frame {
            width: 140px;
            height: 140px;
          }
          
          .hero-pet-info {
            gap: 0.8rem;
          }
          
          .info-pill {
            padding: 0.6rem 1rem;
            font-size: 0.8rem;
          }
          
          .form-grid {
            gap: 1.5rem;
          }
          
          .form-group {
            padding: 1.2rem;
          }
        }

        @media (max-width: 480px) {
          .hero-title {
            font-size: 28px;
          }
          
          .hero-description {
            font-size: 1rem;
          }
          
          .form-container {
            padding: 1.5rem;
          }
          
          .pet-card {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
} 