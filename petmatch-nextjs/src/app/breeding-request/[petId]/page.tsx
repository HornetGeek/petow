'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { apiService, Pet, VeterinaryClinic } from '@/lib/api';

export default function BreedingRequestPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const petId = params.petId as string;
  
  const [targetPet, setTargetPet] = useState<Pet | null>(null);
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [veterinaryClinics, setVeterinaryClinics] = useState<VeterinaryClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [requestData, setRequestData] = useState({
    myPetId: '',
    meetingDate: '',
    message: '',
    contactPhone: '',
    veterinaryClinic: '',
    agreedToTerms: false
  });

  useEffect(() => {
    if (isAuthenticated && petId) {
      loadData();
    }
  }, [isAuthenticated, petId]);

  const loadData = async () => {
    try {
      const [targetPetData, myPetsData, clinicsData] = await Promise.all([
        apiService.getPet(parseInt(petId)),
        apiService.getMyPets(),
        apiService.getVeterinaryClinics()
      ]);

      setTargetPet(targetPetData);
      console.log('🏥 Clinics data:', clinicsData);
      setVeterinaryClinics(clinicsData);
      
      // Filter my pets to show only compatible gender
      const compatiblePets = myPetsData.results?.filter(pet => 
        pet.gender !== targetPetData.gender && 
        pet.pet_type === targetPetData.pet_type &&
        pet.is_fertile &&
        pet.status === 'available'
      ) || [];
      
      setMyPets(compatiblePets);

      if (compatiblePets.length === 0) {
        setError('ليس لديك حيوانات متوافقة للتزاوج مع هذا الحيوان. يجب أن يكون الجنس مختلف ونوع الحيوان متطابق.');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setRequestData(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      setRequestData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (!requestData.veterinaryClinic) {
        setError('يجب اختيار عيادة بيطرية للمقابلة');
        setSubmitting(false);
        return;
      }

      if (!requestData.agreedToTerms) {
        setError('يجب الموافقة على الشروط والأحكام');
        setSubmitting(false);
        return;
      }

      const submitData = {
        target_pet_id: parseInt(petId),
        my_pet_id: parseInt(requestData.myPetId),
        meeting_date: requestData.meetingDate,
        message: requestData.message,
        contact_phone: requestData.contactPhone,
        veterinary_clinic: requestData.veterinaryClinic
      };

      await apiService.createBreedingRequest(submitData);
      
      setSuccess('تم إرسال طلب المقابلة بنجاح! سيتم إشعارك عند الرد على الطلب.');
      
      setTimeout(() => {
        router.push('/my-breeding-requests');
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute message="يجب تسجيل الدخول لطلب مقابلة للتزاوج">
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
            <p style={{ color: 'var(--text-light)' }}>جاري تحميل البيانات...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-light)' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
        {/* Page Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(14,165,233,0.05) 100%)',
          borderRadius: '20px',
          padding: '2rem',
          marginBottom: '2rem',
          border: '1px solid rgba(99,102,241,0.1)',
          textAlign: 'center'
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
            <i className="fas fa-heart"></i>
          </div>
          
          <h1 style={{ 
            fontSize: '2rem', 
            color: 'var(--text)', 
            marginBottom: '0.5rem',
            fontWeight: '800'
          }}>
            طلب مقابلة للتزاوج
          </h1>
          <p style={{ color: 'var(--text-light)', fontSize: '1.1rem' }}>
            اطلب مقابلة تعارف مع {targetPet?.name} في عيادة بيطرية
          </p>
        </div>

        {/* Target Pet Info */}
        {targetPet && (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '1.5rem',
            marginBottom: '2rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
            border: '2px solid rgba(99,102,241,0.1)'
          }}>
            <h3 style={{
              fontSize: '1.3rem',
              color: 'var(--text)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="fas fa-paw" style={{ color: 'var(--primary)' }}></i>
              الحيوان المطلوب للتزاوج
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', alignItems: 'center' }}>
              <img 
                src={targetPet.main_image} 
                alt={targetPet.name}
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  border: '2px solid var(--bg-light)'
                }}
              />
              
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: 'var(--text)' }}>
                  {targetPet.name}
                </h4>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '14px', color: 'var(--muted)' }}>
                  <span><i className="fas fa-venus-mars"></i> {targetPet.gender_display}</span>
                  <span><i className="fas fa-birthday-cake"></i> {targetPet.age_display}</span>
                  <span><i className="fas fa-tag"></i> {targetPet.breed_name}</span>
                  <span><i className="fas fa-map-marker-alt"></i> {targetPet.location}</span>
                </div>
                                   {!targetPet.is_free && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '6px 12px', 
                    background: 'var(--primary)', 
                    color: 'white', 
                    borderRadius: '20px', 
                    display: 'inline-block',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    حالة التزاوج: متاح مجاناً
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error/Success Messages */}
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

        {/* Breeding Request Form */}
        {myPets.length > 0 && (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '2rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <form onSubmit={handleSubmit}>
              {/* My Pet Selection */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontSize: '1.2rem',
                  color: 'var(--text)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-pets"></i>
                  اختر حيوانك الأليف
                </h3>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '1rem'
                }}>
                  {myPets.map(pet => (
                    <label 
                      key={pet.id}
                      style={{
                        display: 'block',
                        cursor: 'pointer',
                        borderRadius: '12px',
                        border: `2px solid ${requestData.myPetId === pet.id.toString() ? 'var(--primary)' : '#e2e8f0'}`,
                        background: requestData.myPetId === pet.id.toString() ? 'rgba(99,102,241,0.05)' : 'white',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <input
                        type="radio"
                        name="myPetId"
                        value={pet.id}
                        checked={requestData.myPetId === pet.id.toString()}
                        onChange={handleChange}
                        style={{ display: 'none' }}
                      />
                      
                      <div style={{ padding: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '12px', alignItems: 'center' }}>
                          <img 
                            src={pet.main_image} 
                            alt={pet.name}
                            style={{
                              width: '80px',
                              height: '80px',
                              borderRadius: '8px',
                              objectFit: 'cover'
                            }}
                          />
                          
                          <div>
                            <h4 style={{ margin: '0 0 4px', fontSize: '1rem' }}>{pet.name}</h4>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                              <div>{pet.gender_display} • {pet.age_display}</div>
                              <div>{pet.breed_name}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Form Fields */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2rem'
              }}>
                {/* Meeting Date */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    تاريخ المقابلة المقترح <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="date"
                    name="meetingDate"
                    value={requestData.meetingDate}
                    onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
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

                {/* Contact Phone */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    color: 'var(--text)',
                    fontWeight: '600'
                  }}>
                    رقم الهاتف للتواصل *
                  </label>
                  <input
                    type="tel"
                    name="contactPhone"
                    value={requestData.contactPhone}
                    onChange={handleChange}
                    required
                    placeholder="05xxxxxxxx"
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

              {/* Veterinary Clinic */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontWeight: '600'
                }}>
                  العيادة البيطرية للمقابلة <span style={{ color: 'red' }}>*</span>
                </label>
                <select
                  name="veterinaryClinic"
                  value={requestData.veterinaryClinic}
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
                  <option value="">اختر العيادة البيطرية</option>
                  {Array.isArray(veterinaryClinics) && veterinaryClinics.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name} - {clinic.city}
                    </option>
                  ))}
                </select>
                
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-light)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <i className="fas fa-info-circle" style={{ color: '#22c55e' }}></i>
                  سيتم ترتيب المقابلة في العيادة البيطرية لضمان الأمان والفحص الصحي
                </div>
              </div>

              {/* Message */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontWeight: '600'
                }}>
                  رسالة شخصية (اختيارية)
                </label>
                <textarea
                  name="message"
                  value={requestData.message}
                  onChange={handleChange}
                  rows={4}
                  placeholder="اكتب رسالة تعريفية عن حيوانك وسبب اهتمامك بهذه المقابلة..."
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

              {/* Terms Agreement */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  padding: '1rem',
                  background: 'rgba(99,102,241,0.05)',
                  borderRadius: '10px',
                  border: '2px solid rgba(99,102,241,0.1)'
                }}>
                  <input
                    type="checkbox"
                    name="agreedToTerms"
                    checked={requestData.agreedToTerms}
                    onChange={handleChange}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ color: 'var(--text)', fontWeight: '500' }}>
                    أوافق على الشروط والأحكام وأتحمل المسؤولية الكاملة عن المقابلة والفحص البيطري
                  </span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
                paddingTop: '1rem',
                borderTop: '2px solid var(--bg-light)'
              }}>
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
                  disabled={submitting || !requestData.myPetId || !requestData.veterinaryClinic || !requestData.agreedToTerms}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    borderRadius: '10px',
                    background: submitting || !requestData.myPetId || !requestData.veterinaryClinic || !requestData.agreedToTerms ? 
                      '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    cursor: submitting || !requestData.myPetId || !requestData.veterinaryClinic || !requestData.agreedToTerms ? 
                      'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: submitting || !requestData.myPetId || !requestData.veterinaryClinic || !requestData.agreedToTerms ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {submitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-calendar-check"></i>
                      إرسال طلب المقابلة
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
} 