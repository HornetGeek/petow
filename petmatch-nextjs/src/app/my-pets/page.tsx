'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { apiService, Pet } from '@/lib/api';

export default function MyPetsPage() {
  const { isAuthenticated } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      loadMyPets();
    }
  }, [isAuthenticated]);

  const loadMyPets = async () => {
    try {
      const response = await apiService.getMyPets();
      setPets(response.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute message="يجب تسجيل الدخول لعرض حيواناتك">
      <Content />
    </ProtectedRoute>
  );

    function Content() {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-light)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Page Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
              حيواناتي الأليفة
            </h1>
            <p style={{ color: 'var(--text-light)', fontSize: '1.1rem' }}>
              إدارة الحيوانات الأليفة المسجلة باسمك
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link
            href="/add-pet"
            style={{
                padding: '14px 28px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              textDecoration: 'none',
                borderRadius: '12px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '16px',
                boxShadow: '0 8px 25px rgba(102, 126, 234, 0.3)',
                transition: 'all 0.3s ease',
                border: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.3)';
              }}
            >
              <i className="fas fa-plus-circle"></i>
              إضافة حيوان أليف جديد
            </Link>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#fee',
            color: '#c53030',
            padding: '1rem',
            borderRadius: '10px',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
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
              <p style={{ color: 'var(--text-light)' }}>جاري تحميل حيواناتك الأليفة...</p>
            </div>
          </div>
        ) : pets.length === 0 ? (
          /* Empty State */
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '4rem 2rem',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              width: '100px',
              height: '100px',
              margin: '0 auto 2rem',
              borderRadius: '50%',
              background: 'var(--bg-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <i className="fas fa-paw" style={{
                fontSize: '3rem',
                color: 'var(--text-light)'
              }}></i>
            </div>
            
            <h2 style={{
              fontSize: '1.8rem',
              color: 'var(--text)',
              marginBottom: '1rem'
            }}>
              لم تقم بإضافة أي حيوانات أليفة بعد
            </h2>
            
            <p style={{
              color: 'var(--text-light)',
              marginBottom: '2rem',
              fontSize: '1.1rem'
            }}>
              ابدأ بإضافة حيوانك الأليف الأول للعثور على الشريك المثالي له
            </p>
            
            <Link
              href="/add-pet"
              style={{
                padding: '16px 32px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '1.1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <i className="fas fa-plus"></i>
              إضافة حيوان أليف الآن
            </Link>
          </div>
        ) : (
          /* Pets Grid */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '2rem'
          }}>
            {pets.map((pet) => (
              <div
                key={pet.id}
                style={{
                  background: 'white',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Pet Image */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '250px'
                }}>
                  <Image
                    src={pet.main_image || '/placeholder-pet.jpg'}
                    alt={pet.name}
                    fill
                    style={{ objectFit: 'cover' }}
                  />
                  
                  {/* Status Badge */}
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    background: pet.status === 'available' ? '#38a169' : '#ed8936',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}>
                    {pet.status_display}
                  </div>
                </div>

                {/* Pet Info */}
                <div style={{ padding: '1.5rem' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '1rem'
                  }}>
                    <div>
                      <h3 style={{
                        fontSize: '1.3rem',
                        color: 'var(--text)',
                        marginBottom: '0.5rem'
                      }}>
                        {pet.name}
                      </h3>
                      <p style={{
                        color: 'var(--text-light)',
                        fontSize: '0.9rem'
                      }}>
                        {pet.breed_name} • {pet.gender_display}
                      </p>
                    </div>
                    
                    <div style={{
                      background: 'var(--bg-light)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: 'var(--text)',
                      fontWeight: '600'
                    }}>
                      {pet.pet_type_display}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    <div>
                      <p style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-light)',
                        marginBottom: '4px'
                      }}>
                        العمر
                      </p>
                      <p style={{
                        fontWeight: '600',
                        color: 'var(--text)'
                      }}>
                        {pet.age_display}
                      </p>
                    </div>
                    
                    <div>
                      <p style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-light)',
                        marginBottom: '4px'
                      }}>
                        حالة التزاوج
                      </p>
                      <p style={{
                        fontWeight: '600',
                        color: 'var(--success)'
                      }}>
                        متاح مجاناً
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '10px'
                  }}>
                    <Link
                      href={`/pets/${pet.id}`}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: 'var(--bg-light)',
                        color: 'var(--text)',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        textAlign: 'center',
                        fontWeight: '600',
                        fontSize: '0.9rem'
                      }}
                    >
                      عرض التفاصيل
                    </Link>
                    
                    <Link
                      href={`/edit-pet/${pet.id}`}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        textAlign: 'center',
                        fontWeight: '600',
                        fontSize: '0.9rem'
                      }}
                    >
                      تعديل
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    );
  }
} 