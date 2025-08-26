'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, AdoptionRequestList } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function ReceivedAdoptionRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<AdoptionRequestList[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    fetchReceivedRequests();
  }, []);

  const fetchReceivedRequests = async () => {
    try {
      const data = await apiService.getReceivedAdoptionRequests();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching received adoption requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (requestId: number, action: 'approve' | 'reject' | 'complete') => {
    const confirmMessage = 
      action === 'approve' ? 'هل تريد قبول طلب التبني؟' :
      action === 'reject' ? 'هل تريد رفض طلب التبني؟' :
      'هل تريد تأكيد اكتمال عملية التبني؟';

    if (!confirm(confirmMessage)) return;

    try {
      setProcessing(requestId);
      await apiService.respondToAdoptionRequest(requestId, action);
      await fetchReceivedRequests(); // Refresh the list
      
      const successMessage = 
        action === 'approve' ? 'تم قبول طلب التبني بنجاح!' :
        action === 'reject' ? 'تم رفض طلب التبني' :
        'تم تأكيد اكتمال عملية التبني!';
      
      alert(successMessage);
    } catch (error) {
      console.error('Error responding to adoption request:', error);
      alert('حدث خطأ أثناء معالجة الطلب');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f39c12';
      case 'approved': return '#27ae60';
      case 'rejected': return '#e74c3c';
      case 'completed': return '#9b59b6';
      default: return '#7f8c8d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'fas fa-clock';
      case 'approved': return 'fas fa-check-circle';
      case 'rejected': return 'fas fa-times-circle';
      case 'completed': return 'fas fa-heart';
      default: return 'fas fa-question-circle';
    }
  };

  return (
    <ProtectedRoute>
      <div className="received-requests-page">
        <div className="container">
          <div className="page-header">
            <h1>📥 طلبات التبني المستقبلة</h1>
            <p>راجع طلبات تبني حيواناتك واتخذ القرار المناسب</p>
          </div>

          {/* Navigation */}
          <div className="adoption-nav">
            <Link href="/adoption" className="nav-link">
              <i className="fas fa-heart"></i>
              الحيوانات المتاحة للتبني
            </Link>
            <Link href="/adoption/my-requests" className="nav-link">
              <i className="fas fa-paper-plane"></i>
              طلباتي
            </Link>
            <Link href="/adoption/received" className="nav-link active">
              <i className="fas fa-inbox"></i>
              الطلبات المستقبلة
            </Link>
          </div>

          {/* Requests List */}
          {loading ? (
            <div className="loading">
              <i className="fas fa-spinner fa-spin"></i>
              جاري التحميل...
            </div>
          ) : (
            <div className="requests-container">
              {requests.length === 0 ? (
                <div className="no-requests">
                  <i className="fas fa-inbox"></i>
                  <h3>لا توجد طلبات تبني</h3>
                  <p>لم تستقبل أي طلبات تبني لحيواناتك بعد</p>
                </div>
              ) : (
                <div className="requests-list">
                  {requests.map((request) => (
                    <div key={request.id} className="request-card">
                      <div className="pet-info">
                        <div className="pet-image">
                          <Image
                            src={request.pet_image || '/placeholder-pet.jpg'}
                            alt={request.pet_name}
                            width={80}
                            height={80}
                            className="pet-img"
                          />
                        </div>
                        <div className="pet-details">
                          <h4>{request.pet_name}</h4>
                          <p><i className="fas fa-paw"></i> {request.pet_breed}</p>
                        </div>
                      </div>

                      <div className="adopter-info">
                        <div className="adopter-details">
                          <h5>طالب التبني</h5>
                          <div><strong>الاسم:</strong> {request.adopter_full_name}</div>
                          <div><strong>الهاتف:</strong> {request.adopter_phone}</div>
                          <div><strong>الميزانية الشهرية:</strong> {request.monthly_budget} د.ك</div>
                        </div>
                        <div className="request-date">
                          <i className="fas fa-calendar"></i>
                          {new Date(request.created_at).toLocaleDateString('ar-EG')}
                        </div>
                      </div>

                      <div className="status-actions">
                        <div 
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(request.status) }}
                        >
                          <i className={getStatusIcon(request.status)}></i>
                          {request.status_display}
                        </div>
                        
                        <div className="actions">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleResponse(request.id, 'approve')}
                                disabled={processing === request.id}
                                className="btn-approve"
                              >
                                {processing === request.id ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <i className="fas fa-check"></i>
                                )}
                                قبول
                              </button>
                              <button
                                onClick={() => handleResponse(request.id, 'reject')}
                                disabled={processing === request.id}
                                className="btn-reject"
                              >
                                {processing === request.id ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <i className="fas fa-times"></i>
                                )}
                                رفض
                              </button>
                            </>
                          )}
                          
                          {request.status === 'approved' && (
                            <button
                              onClick={() => handleResponse(request.id, 'complete')}
                              disabled={processing === request.id}
                              className="btn-complete"
                            >
                              {processing === request.id ? (
                                <i className="fas fa-spinner fa-spin"></i>
                              ) : (
                                <i className="fas fa-heart"></i>
                              )}
                              تأكيد التبني
                            </button>
                          )}
                          
                          <Link 
                            href={`/adoption/request/${request.id}`}
                            className="btn-details"
                          >
                            <i className="fas fa-eye"></i>
                            التفاصيل
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <style jsx>{`
          .received-requests-page {
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

          .loading {
            text-align: center;
            padding: 3rem;
            color: #7f8c8d;
            font-size: 1.2rem;
          }

          .requests-container {
            background: white;
            border-radius: 15px;
            padding: 2rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }

          .no-requests {
            text-align: center;
            padding: 3rem;
            color: #7f8c8d;
          }

          .no-requests i {
            font-size: 3rem;
            margin-bottom: 1rem;
            color: #e74c3c;
          }

          .no-requests h3 {
            margin-bottom: 1rem;
            color: #2c3e50;
          }

          .requests-list {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .request-card {
            display: grid;
            grid-template-columns: auto 1fr auto;
            gap: 1.5rem;
            padding: 1.5rem;
            border: 2px solid #ecf0f1;
            border-radius: 12px;
            transition: all 0.3s ease;
            align-items: center;
          }

          .request-card:hover {
            border-color: #e74c3c;
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(0,0,0,0.1);
          }

          .pet-info {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .pet-image {
            width: 80px;
            height: 80px;
            border-radius: 12px;
            overflow: hidden;
          }

          .pet-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .pet-details h4 {
            margin: 0 0 0.5rem 0;
            color: #2c3e50;
            font-size: 1.1rem;
          }

          .pet-details p {
            margin: 0;
            color: #7f8c8d;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .adopter-info {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .adopter-details h5 {
            margin: 0 0 0.5rem 0;
            color: #e74c3c;
            font-size: 1rem;
          }

          .adopter-details > div {
            margin-bottom: 0.25rem;
            font-size: 0.9rem;
            color: #34495e;
          }

          .request-date {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #7f8c8d;
            font-size: 0.9rem;
          }

          .status-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }

          .status-badge {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            color: white;
            font-weight: 600;
            font-size: 0.875rem;
            white-space: nowrap;
          }

          .actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            justify-content: center;
          }

          .actions button,
          .btn-details {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
          }

          .btn-approve {
            background: #27ae60;
            color: white;
          }

          .btn-approve:hover:not(:disabled) {
            background: #1e8449;
          }

          .btn-reject {
            background: #e74c3c;
            color: white;
          }

          .btn-reject:hover:not(:disabled) {
            background: #c0392b;
          }

          .btn-complete {
            background: #9b59b6;
            color: white;
          }

          .btn-complete:hover:not(:disabled) {
            background: #7d3c98;
          }

          .btn-details {
            background: white;
            border: 2px solid #e74c3c;
            color: #e74c3c;
          }

          .btn-details:hover {
            background: #e74c3c;
            color: white;
          }

          .actions button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          @media (max-width: 768px) {
            .request-card {
              grid-template-columns: 1fr;
              text-align: center;
            }
            
            .pet-info {
              justify-content: center;
            }
            
            .adoption-nav {
              flex-direction: column;
              align-items: center;
            }
            
            .actions {
              justify-content: center;
            }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
} 