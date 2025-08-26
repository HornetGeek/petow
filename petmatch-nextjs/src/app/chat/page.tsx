'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiService, ChatRoomList, UserChatStatus } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

export default function ChatPage() {
  const { user } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoomList[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatRoomList[]>([]);
  const [userChatStatus, setUserChatStatus] = useState<UserChatStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  useEffect(() => {
    loadChatData();
  }, []);

  const loadChatData = async () => {
    try {
      setLoading(true);
      const [chatRoomsResponse, archivedResponse, statusResponse] = await Promise.all([
        apiService.getChatRooms(),
        apiService.getArchivedChatRooms(),
        apiService.getUserChatStatus()
      ]);

      setChatRooms(chatRoomsResponse.results || []);
      setArchivedChats(archivedResponse.results || []);
      setUserChatStatus(statusResponse);
    } catch (err) {
      console.error('Error loading chat data:', err);
      setError(err instanceof Error ? err.message : 'خطأ في تحميل المحادثات');
    } finally {
      setLoading(false);
    }
  };

  const formatChatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `منذ ${days} ${days === 1 ? 'يوم' : 'أيام'}`;
    if (hours > 0) return `منذ ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`;
    if (minutes > 0) return `منذ ${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`;
    return 'الآن';
  };

  const ChatRoomCard = ({ chat, isArchived = false }: { chat: ChatRoomList; isArchived?: boolean }) => (
    <Link href={`/chat/${chat.firebase_chat_id}`} className="chat-room-card">
      <div className="chat-avatar">
        {chat.pet_image ? (
          <Image
            src={chat.pet_image}
            alt={chat.pet_name}
            width={60}
            height={60}
            className="chat-pet-image"
          />
        ) : (
          <div className="chat-pet-placeholder">
            <i className="fas fa-paw"></i>
          </div>
        )}
      </div>
      
      <div className="chat-info">
        <div className="chat-header">
          <h3 className="chat-participant-name">{chat.other_participant}</h3>
          <span className="chat-time">{formatChatTime(chat.updated_at)}</span>
        </div>
        
        <div className="chat-details">
          <span className="chat-pet-name">
            <i className="fas fa-paw"></i>
            {chat.pet_name}
          </span>
          {isArchived && (
            <span className="chat-archived-badge">
              <i className="fas fa-archive"></i>
              مؤرشف
            </span>
          )}
        </div>
      </div>
      
      <div className="chat-arrow">
        <i className="fas fa-chevron-left"></i>
      </div>
    </Link>
  );

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="page-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>جاري تحميل المحادثات...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="page-container">
        
        <main className="chat-page-main">
          <div className="chat-page-header">
            <h1>المحادثات</h1>
            {userChatStatus && (
              <div className="chat-stats">
                <div className="stat-item">
                  <span className="stat-value">{userChatStatus.active_chats}</span>
                  <span className="stat-label">نشطة</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{userChatStatus.total_chats}</span>
                  <span className="stat-label">إجمالي</span>
                </div>
                {userChatStatus.pending_chat_creation > 0 && (
                  <div className="stat-item pending">
                    <span className="stat-value">{userChatStatus.pending_chat_creation}</span>
                    <span className="stat-label">في انتظار إنشاء المحادثة</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="chat-tabs">
            <button
              className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              <i className="fas fa-comments"></i>
              المحادثات النشطة ({chatRooms.length})
            </button>
            <button
              className={`tab-button ${activeTab === 'archived' ? 'active' : ''}`}
              onClick={() => setActiveTab('archived')}
            >
              <i className="fas fa-archive"></i>
              المؤرشفة ({archivedChats.length})
            </button>
          </div>

          <div className="chat-content">
            {error && (
              <div className="error-message">
                <i className="fas fa-exclamation-circle"></i>
                {error}
                <button onClick={loadChatData} className="retry-button">
                  إعادة المحاولة
                </button>
              </div>
            )}

            {activeTab === 'active' && (
              <div className="chat-rooms-list">
                {chatRooms.length === 0 ? (
                  <div className="empty-state">
                    <i className="fas fa-comments"></i>
                    <h3>لا توجد محادثات نشطة</h3>
                    <p>ستظهر المحادثات هنا عندما يتم قبول طلبات التزاوج</p>
                    <Link href="/my-breeding-requests" className="btn-primary">
                      عرض طلبات التزاوج
                    </Link>
                  </div>
                ) : (
                  <div className="chat-rooms-grid">
                    {chatRooms.map(chat => (
                      <ChatRoomCard key={chat.id} chat={chat} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'archived' && (
              <div className="chat-rooms-list">
                {archivedChats.length === 0 ? (
                  <div className="empty-state">
                    <i className="fas fa-archive"></i>
                    <h3>لا توجد محادثات مؤرشفة</h3>
                    <p>المحادثات المؤرشفة ستظهر هنا</p>
                  </div>
                ) : (
                  <div className="chat-rooms-grid">
                    {archivedChats.map(chat => (
                      <ChatRoomCard key={chat.id} chat={chat} isArchived={true} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <style jsx>{`
          .chat-page-main {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }

          .chat-page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
          }

          .chat-page-header h1 {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin: 0;
          }

          .chat-stats {
            display: flex;
            gap: 20px;
          }

          .stat-item {
            text-align: center;
            padding: 10px 15px;
            background: #f8f9fa;
            border-radius: 8px;
            min-width: 80px;
          }

          .stat-item.pending {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
          }

          .stat-value {
            display: block;
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
          }

          .stat-label {
            display: block;
            font-size: 12px;
            color: #666;
            margin-top: 4px;
          }

          .chat-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
          }

          .tab-button {
            flex: 1;
            padding: 15px 20px;
            border: 2px solid #e0e0e0;
            background: white;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .tab-button:hover {
            border-color: #3498db;
            background: #f8f9fa;
          }

          .tab-button.active {
            border-color: #3498db;
            background: #3498db;
            color: white;
          }

          .chat-rooms-grid {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }

          .chat-room-card {
            display: flex;
            align-items: center;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-decoration: none;
            color: inherit;
            transition: all 0.3s ease;
          }

          .chat-room-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          }

          .chat-avatar {
            margin-left: 15px;
          }

          .chat-pet-image {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            object-fit: cover;
          }

          .chat-pet-placeholder {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #f0f0f0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: #666;
          }

          .chat-info {
            flex: 1;
          }

          .chat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }

          .chat-participant-name {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin: 0;
          }

          .chat-time {
            font-size: 14px;
            color: #666;
          }

          .chat-details {
            display: flex;
            align-items: center;
            gap: 15px;
          }

          .chat-pet-name {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: #666;
          }

          .chat-archived-badge {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            color: #e67e22;
            background: #ffeaa7;
            padding: 4px 8px;
            border-radius: 4px;
          }

          .chat-arrow {
            margin-right: 15px;
            color: #666;
            font-size: 18px;
          }

          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
          }

          .empty-state i {
            font-size: 48px;
            margin-bottom: 20px;
            color: #bdc3c7;
          }

          .empty-state h3 {
            font-size: 24px;
            margin-bottom: 10px;
            color: #2c3e50;
          }

          .empty-state p {
            font-size: 16px;
            margin-bottom: 30px;
          }

          .loading-state {
            text-align: center;
            padding: 60px 20px;
          }

          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f0f0f0;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .error-message {
            background: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .retry-button {
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: auto;
          }

          .btn-primary {
            background: #3498db;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            display: inline-block;
            transition: background 0.3s ease;
          }

          .btn-primary:hover {
            background: #2980b9;
          }

          @media (max-width: 768px) {
            .chat-page-main {
              padding: 15px;
            }

            .chat-page-header {
              flex-direction: column;
              gap: 20px;
              align-items: flex-start;
            }

            .chat-stats {
              width: 100%;
              justify-content: space-between;
            }

            .stat-item {
              flex: 1;
              min-width: auto;
            }

            .chat-tabs {
              flex-direction: column;
            }

            .chat-room-card {
              padding: 15px;
            }

            .chat-participant-name {
              font-size: 16px;
            }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
} 