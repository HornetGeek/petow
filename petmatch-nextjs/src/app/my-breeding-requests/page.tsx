'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ProtectedRoute from '@/components/ProtectedRoute';
import { apiService, BreedingRequest } from '@/lib/api';

export default function MyBreedingRequestsPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('sent');
  const [sentRequests, setSentRequests] = useState<BreedingRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<BreedingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      loadRequests();
    }
  }, [isAuthenticated]);

  const loadRequests = async () => {
    try {
      const [sent, received] = await Promise.all([
        apiService.getMyBreedingRequests(),
        apiService.getReceivedBreedingRequests()
      ]);
      setSentRequests(sent);
      setReceivedRequests(received);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleResponseToRequest = async (requestId: number, response: 'accept' | 'reject') => {
    try {
      // تحويل accept/reject إلى approve/reject لتطابق الـ API
      const apiResponse = response === 'accept' ? 'approve' : 'reject';
      
      console.log(`Responding to request ${requestId} with ${apiResponse}`);
      await apiService.respondToBreedingRequest(requestId, apiResponse);
      
      console.log('✅ Response sent successfully');
      
      // Reload requests
      await loadRequests();
    } catch (err) {
      console.error('❌ Error responding to request:', err);
      setError(err instanceof Error ? err.message : 'خطأ في الاستجابة للطلب');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'accepted': return '#10b981';
      case 'rejected': return '#ef4444';
      case 'completed': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'fas fa-clock';
      case 'accepted': return 'fas fa-check-circle';
      case 'rejected': return 'fas fa-times-circle';
      case 'completed': return 'fas fa-heart';
      default: return 'fas fa-circle';
    }
  };

  const handleCreateChat = async (breedingRequestId: number) => {
    try {
      const response = await apiService.createChatRoom(breedingRequestId);
      router.push(`/chat/${response.chat_room.firebase_chat_id}`);
    } catch (err: any) {
      console.error('Error creating chat:', err);
      
      // Handle specific error cases
      const errorMessage = err.message || err.error || 'خطأ في إنشاء المحادثة';
      
      if (errorMessage.includes('توجد محادثة بالفعل')) {
        // Try to get existing chat room
        try {
          const existingChat = await apiService.getChatRoomByBreedingRequest(breedingRequestId);
          if (existingChat) {
            router.push(`/chat/${existingChat.firebase_chat_id}`);
            return;
          }
        } catch (getChatErr) {
          console.error('Error getting existing chat:', getChatErr);
        }
        setError('توجد محادثة بالفعل لهذا الطلب');
      } else if (errorMessage.includes('لا يمكن إنشاء محادثة إلا للطلبات المقبولة')) {
        setError('لا يمكن إنشاء محادثة إلا للطلبات المقبولة');
      } else {
        setError(errorMessage);
      }
    }
  };

  const navigateToChat = (firebaseChatId: string) => {
    router.push(`/chat/${firebaseChatId}`);
  };

  return (
    <ProtectedRoute message="يجب تسجيل الدخول لعرض طلبات التزاوج">
      <Content />
    </ProtectedRoute>
  );

    function Content() {
    if (loading) {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-light)' }}>
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
            <p style={{ color: 'var(--text-light)' }}>جاري تحميل طلبات التزاوج...</p>
          </div>
        </div>
      </div>
    );
  }

      return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-light)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ color: 'var(--text-light)', textDecoration: 'none' }}>
            الرئيسية
          </Link>
          <span style={{ margin: '0 0.5rem', color: 'var(--text-light)' }}>›</span>
          <span style={{ color: 'var(--text)' }}>طلبات التزاوج</span>
        </div>

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
            طلبات التزاوج
          </h1>
          <p style={{ color: 'var(--text-light)', fontSize: '1.1rem' }}>
            إدارة طلبات التزاوج المرسلة والواردة
          </p>
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

        {/* Tabs */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          marginBottom: '2rem'
        }}>
          <div style={{
            display: 'flex',
            borderBottom: '2px solid var(--bg-light)'
          }}>
            <button
              onClick={() => setActiveTab('sent')}
              style={{
                flex: 1,
                padding: '1.5rem',
                border: 'none',
                background: activeTab === 'sent' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'sent' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '1.1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <i className="fas fa-paper-plane"></i>
              الطلبات المرسلة ({sentRequests.length})
            </button>
            
            <button
              onClick={() => setActiveTab('received')}
              style={{
                flex: 1,
                padding: '1.5rem',
                border: 'none',
                background: activeTab === 'received' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'received' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '1.1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <i className="fas fa-inbox"></i>
              الطلبات الواردة ({receivedRequests.length})
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '2rem' }}>
            {activeTab === 'sent' ? (
              <div>
                {sentRequests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                    <div style={{
                      width: '120px',
                      height: '120px',
                      margin: '0 auto 2rem',
                      borderRadius: '50%',
                      background: 'var(--bg-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '3rem',
                      color: 'var(--text-light)'
                    }}>
                      <i className="fas fa-paper-plane"></i>
                    </div>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text)' }}>
                      لم ترسل أي طلبات تزاوج بعد
                    </h3>
                    <p style={{ color: 'var(--text-light)', marginBottom: '2rem' }}>
                      ابدأ بتصفح الحيوانات الأليفة وأرسل طلبات التزاوج
                    </p>
                    <Link
                      href="/pets"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        background: 'var(--primary)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '10px',
                        fontWeight: '600'
                      }}
                    >
                      <i className="fas fa-search"></i>
                      تصفح الحيوانات
                    </Link>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gap: '1.5rem'
                  }}>
                    {sentRequests.map(request => (
                      <RequestCard 
                        key={request.id} 
                        request={request} 
                        type="sent"
                        onResponse={handleResponseToRequest}
                        onCreateChat={handleCreateChat}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {receivedRequests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                    <div style={{
                      width: '120px',
                      height: '120px',
                      margin: '0 auto 2rem',
                      borderRadius: '50%',
                      background: 'var(--bg-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '3rem',
                      color: 'var(--text-light)'
                    }}>
                      <i className="fas fa-inbox"></i>
                    </div>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text)' }}>
                      لا توجد طلبات تزاوج واردة
                    </h3>
                    <p style={{ color: 'var(--text-light)' }}>
                      عندما يرسل أحدهم طلب تزاوج لحيواناتك، ستظهر هنا
                    </p>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gap: '1.5rem'
                  }}>
                    {receivedRequests.map(request => (
                      <RequestCard 
                        key={request.id} 
                        request={request} 
                        type="received"
                        onResponse={handleResponseToRequest}
                        onCreateChat={handleCreateChat}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    );
  }
}

// Request Card Component
function RequestCard({ 
  request, 
  type, 
  onResponse,
  onCreateChat
}: { 
  request: BreedingRequest; 
  type: 'sent' | 'received'; 
  onResponse: (requestId: number, response: 'accept' | 'reject') => Promise<void>;
  onCreateChat: (requestId: number) => Promise<void>;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'accepted': return '#10b981';
      case 'rejected': return '#ef4444';
      case 'completed': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'fas fa-clock';
      case 'accepted': return 'fas fa-check-circle';
      case 'rejected': return 'fas fa-times-circle';
      case 'completed': return 'fas fa-heart';
      default: return 'fas fa-circle';
    }
  };

  return (
    <div style={{
      background: 'var(--bg-light)',
      borderRadius: '15px',
      padding: '1.5rem',
      border: '2px solid rgba(99,102,241,0.1)',
      position: 'relative'
    }}>
      {/* Status Badge */}
      <div style={{
        position: 'absolute',
        top: '15px',
        right: '15px',
        background: getStatusColor(request.status),
        color: 'white',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        <i className={getStatusIcon(request.status)}></i>
        {request.status_display}
      </div>

      {/* Main Content */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginTop: '1rem'
      }}>
        {/* My Pet */}
        <div>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-paw"></i>
            {type === 'sent' ? 'حيواني الأليف' : 'الحيوان المطلوب'}
          </h4>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <img 
              src={type === 'sent' ? request.requester_pet_details.main_image : request.target_pet_details.main_image}
              alt={type === 'sent' ? request.requester_pet_details.name : request.target_pet_details.name}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '12px',
                objectFit: 'cover'
              }}
            />
            
            <div>
              <h5 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>
                {type === 'sent' ? request.requester_pet_details.name : request.target_pet_details.name}
              </h5>
              <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
                <div>{type === 'sent' ? request.requester_pet_details.breed_name : request.target_pet_details.breed_name}</div>
                <div>
                  {type === 'sent' ? request.requester_pet_details.gender_display : request.target_pet_details.gender_display} • 
                  {type === 'sent' ? request.requester_pet_details.age_display : request.target_pet_details.age_display}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Target Pet */}
        <div>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-heart"></i>
            {type === 'sent' ? 'الحيوان المطلوب' : 'حيوان المرسل'}
          </h4>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <img 
              src={type === 'sent' ? request.target_pet_details.main_image : request.requester_pet_details.main_image}
              alt={type === 'sent' ? request.target_pet_details.name : request.requester_pet_details.name}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '12px',
                objectFit: 'cover'
              }}
            />
            
            <div>
              <h5 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>
                {type === 'sent' ? request.target_pet_details.name : request.requester_pet_details.name}
              </h5>
              <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
                <div>{type === 'sent' ? request.target_pet_details.breed_name : request.requester_pet_details.breed_name}</div>
                <div>
                  {type === 'sent' ? request.target_pet_details.gender_display : request.requester_pet_details.gender_display} • 
                  {type === 'sent' ? request.target_pet_details.age_display : request.requester_pet_details.age_display}
                </div>
                {type === 'sent' && (
                  <div style={{ marginTop: '4px', fontWeight: '500' }}>
                    المالك: {request.target_pet_details.owner_name}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Request Details */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'white',
        borderRadius: '10px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div>
          <strong>تاريخ المقابلة:</strong>
          <div>{new Date(request.meeting_date).toLocaleDateString('ar-SA')}</div>
        </div>
        <div>
          <strong>رقم الهاتف:</strong>
          <div>{request.contact_phone}</div>
        </div>
        <div>
          <strong>العيادة البيطرية:</strong>
          <div>{request.veterinary_clinic_details.name} - {request.veterinary_clinic_details.city}</div>
        </div>
        <div>
          <strong>تاريخ الإرسال:</strong>
          <div>{new Date(request.created_at).toLocaleDateString('ar-SA')}</div>
        </div>
      </div>

      {/* Message */}
      {request.message && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'white',
          borderRadius: '10px'
        }}>
          <strong>الرسالة:</strong>
          <p style={{ margin: '8px 0 0', lineHeight: '1.6' }}>{request.message}</p>
        </div>
      )}

      {/* Action Buttons */}
      {type === 'received' && request.status === 'pending' && (
        <div style={{
          marginTop: '1.5rem',
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => onResponse(request.id, 'reject')}
            style={{
              padding: '10px 20px',
              border: '2px solid #ef4444',
              borderRadius: '8px',
              background: 'white',
              color: '#ef4444',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fas fa-times"></i>
            رفض
          </button>
          
          <button
            onClick={() => onResponse(request.id, 'accept')}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fas fa-check"></i>
            قبول
          </button>
        </div>
      )}

      {/* Chat Button for Accepted Requests */}
      {request.status === 'approved' && (
        <div style={{
          marginTop: '1.5rem',
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => onCreateChat(request.id)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: '#3498db',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.3s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#2980b9'}
            onMouseOut={(e) => e.currentTarget.style.background = '#3498db'}
          >
            <i className="fas fa-comments"></i>
            {type === 'sent' ? 'بدء المحادثة' : 'المحادثة مع المرسل'}
          </button>
        </div>
      )}
    </div>
  );
} 