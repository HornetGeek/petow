'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiService, ChatRoom, ChatContext } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  updateDoc,
  setDoc
} from 'firebase/firestore';

interface ChatMessage {
  id: string;
  text: string;
  senderId: number;
  senderName: string;
  timestamp: any;
  type: 'text' | 'image' | 'system';
  imageUrl?: string;
}

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageForModal, setSelectedImageForModal] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChatRoom();
  }, [params.chatId]);

  useEffect(() => {
    if (chatRoom?.firebase_chat_id) {
      setupMessageListener();
    }
  }, [chatRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatRoom = async () => {
    try {
      setLoading(true);
      const chatRoomData = await apiService.getChatRoomByFirebaseId(params.chatId as string);
      setChatRoom(chatRoomData);
      
      // Load chat context
      const contextData = await apiService.getChatRoomContext(chatRoomData.id);
      setChatContext(contextData.chat_context);
    } catch (err) {
      console.error('Error loading chat room:', err);
      setError(err instanceof Error ? err.message : 'خطأ في تحميل المحادثة');
    } finally {
      setLoading(false);
    }
  };

  const setupMessageListener = () => {
    if (!chatRoom?.firebase_chat_id) return;

    try {
      const messagesRef = collection(db, 'chats', chatRoom.firebase_chat_id, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messagesList: ChatMessage[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          messagesList.push({
            id: doc.id,
            text: data.text,
            senderId: data.senderId,
            senderName: data.senderName,
            timestamp: data.timestamp,
            type: data.type || 'text',
            imageUrl: data.imageUrl
          });
        });
        setMessages(messagesList);
      }, (error) => {
        console.error('Firestore listener error:', error);
        // If collection doesn't exist, create it with initial message
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          createInitialFirestoreCollection();
        } else {
          // Show fallback message
          setMessages([{
            id: 'system-1',
            text: 'المحادثة في الوقت الفعلي غير متاحة حالياً. يمكنك إرسال رسائل وسيتم حفظها.',
            senderId: 0,
            senderName: 'النظام',
            timestamp: new Date(),
            type: 'system'
          }]);
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up message listener:', error);
      // Try to create the collection
      createInitialFirestoreCollection();
    }
  };

  const createInitialFirestoreCollection = async () => {
    if (!chatRoom?.firebase_chat_id || !user) return;
    
    try {
      const messagesRef = collection(db, 'chats', chatRoom.firebase_chat_id, 'messages');
      
      // Create initial system message
      await addDoc(messagesRef, {
        text: 'تم إنشاء المحادثة بنجاح! يمكنك الآن البدء في التحدث.',
        senderId: 0, // System user
        senderName: 'النظام',
        timestamp: serverTimestamp(),
        type: 'system'
      });

      // Create chat document
      const chatDocRef = doc(db, 'chats', chatRoom.firebase_chat_id);
      await updateDoc(chatDocRef, {
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        participants: [user.id],
        is_active: true
      });

      console.log('Firestore collection created successfully');
    } catch (error) {
      console.error('Error creating Firestore collection:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && !selectedImage || !chatRoom || !user || sending) return;

    try {
      setSending(true);
      const messagesRef = collection(db, 'chats', chatRoom.firebase_chat_id, 'messages');
      
      // Prepare message data
      const messageData: any = {
        text: newMessage.trim(),
        senderId: user.id,
        senderName: `${user.first_name} ${user.last_name}`,
        timestamp: serverTimestamp(),
        type: 'text'
      };

      if (selectedImage) {
        const imageUrl = await uploadImage(selectedImage);
        messageData.imageUrl = imageUrl;
        messageData.type = 'image';
      }

      // Send the message
      await addDoc(messagesRef, messageData);

      // Send notification to other participant
      try {
        await apiService.sendChatMessageNotification(
          chatRoom.firebase_chat_id,
          newMessage.trim() || 'صورة'
        );
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
        // Don't block message sending if notification fails
      }

      // Try to update chat room timestamp, create if doesn't exist
      try {
        const chatDocRef = doc(db, 'chats', chatRoom.firebase_chat_id);
        await updateDoc(chatDocRef, {
          lastMessageAt: serverTimestamp(),
          lastMessage: newMessage.trim(),
          lastMessageSender: user.id
        });
      } catch (updateError: any) {
        // If document doesn't exist, create it
        if (updateError.code === 'not-found') {
          const chatDocRef = doc(db, 'chats', chatRoom.firebase_chat_id);
          await setDoc(chatDocRef, {
            lastMessageAt: serverTimestamp(),
            lastMessage: newMessage.trim(),
            lastMessageSender: user.id,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            participants: [user.id],
            is_active: true
          });
        } else {
          console.error('Error updating chat document:', updateError);
        }
      }

      setNewMessage('');
      setSelectedImage(null);
    } catch (err) {
      console.error('Error sending message:', err);
      setError('خطأ في إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('ar', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const archiveChat = async () => {
    if (!chatRoom) return;
    
    try {
      await apiService.archiveChatRoom(chatRoom.id);
      router.push('/chat');
    } catch (err) {
      setError('خطأ في أرشفة المحادثة');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
    }
  };

  const uploadImage = async (file: File) => {
    try {
      const response = await apiService.uploadChatImage(file);
      return response.image_url;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error('فشل في رفع الصورة');
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="page-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>جاري تحميل المحادثة...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error && !chatRoom) {
    return (
      <ProtectedRoute>
        <div className="page-container">
          <div className="error-state">
            <i className="fas fa-exclamation-circle"></i>
            <h3>خطأ في تحميل المحادثة</h3>
            <p>{error}</p>
            <button onClick={() => router.back()} className="btn-primary">
              العودة
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="page-container">
        
        <div className="chat-room-container">
          {/* Chat Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <button onClick={() => router.back()} className="back-button">
                <i className="fas fa-arrow-right"></i>
              </button>
              
              <div className="chat-participant-info">
                {chatContext?.pet.main_image && (
                  <Image
                    src={chatContext.pet.main_image}
                    alt={chatContext.pet.name}
                    width={40}
                    height={40}
                    className="chat-header-avatar"
                  />
                )}
                <div className="participant-details">
                  <h3>{chatRoom?.other_participant.name}</h3>
                  <span className="pet-info">
                    <i className="fas fa-paw"></i>
                    {chatContext?.pet.name} - {chatContext?.pet.breed_name}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="chat-actions">
              <button onClick={archiveChat} className="archive-button" title="أرشفة المحادثة">
                <i className="fas fa-archive"></i>
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <i className="fas fa-comments"></i>
                <h3>ابدأ المحادثة</h3>
                <p>مرحباً! يمكنك الآن التحدث مع {chatRoom?.other_participant.name} حول {chatContext?.pet.name}</p>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.senderId === user?.id ? 'sent' : 'received'} ${message.type}`}
                  >
                    <div className="message-content">
                      {message.type === 'image' && message.imageUrl && (
                        <Image
                          src={message.imageUrl}
                          alt="Chat image"
                          width={200}
                          height={200}
                          className="message-image clickable"
                          onClick={() => message.imageUrl && setSelectedImageForModal(message.imageUrl)}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                      <span className="message-text">{message.text}</span>
                      <span className="message-time">
                        {formatMessageTime(message.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="message-input-container">
            {error && (
              <div className="error-banner">
                <i className="fas fa-exclamation-triangle"></i>
                {error}
                <button onClick={() => setError(null)} className="close-error">
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
            
            {selectedImage && (
              <div className="image-preview">
                <Image
                  src={URL.createObjectURL(selectedImage)}
                  alt="Selected image"
                  width={100}
                  height={100}
                  className="preview-image"
                />
                <button
                  onClick={() => setSelectedImage(null)}
                  className="remove-image"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
            
            <div className="message-input">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                style={{ display: 'none' }}
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="attach-button"
                title="إرفاق صورة"
              >
                <i className="fas fa-image"></i>
              </button>
              
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="اكتب رسالتك هنا..."
                disabled={sending}
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() && !selectedImage || sending}
                className="send-button"
              >
                {sending ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-paper-plane"></i>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Image Modal */}
        {selectedImageForModal && (
          <div className="image-modal-overlay" onClick={() => setSelectedImageForModal(null)}>
            <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
              <button 
                className="close-modal-button"
                onClick={() => setSelectedImageForModal(null)}
              >
                <i className="fas fa-times"></i>
              </button>
              <Image
                src={selectedImageForModal}
                alt="Enlarged image"
                width={800}
                height={600}
                className="enlarged-image"
                style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
              />
            </div>
          </div>
        )}

        <style jsx>{`
          .chat-room-container {
            display: flex;
            flex-direction: column;
            height: calc(100vh - 80px);
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px 12px 0 0;
            overflow: hidden;
          }

          .chat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
          }

          .chat-header-info {
            display: flex;
            align-items: center;
            gap: 15px;
          }

          .back-button {
            background: none;
            border: none;
            font-size: 20px;
            color: #2c3e50;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: background 0.3s ease;
          }

          .back-button:hover {
            background: #e0e0e0;
          }

          .chat-participant-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .chat-header-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
          }

          .participant-details h3 {
            margin: 0;
            font-size: 18px;
            color: #2c3e50;
          }

          .pet-info {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: #666;
            margin-top: 4px;
          }

          .chat-actions {
            display: flex;
            gap: 10px;
          }

          .archive-button {
            background: none;
            border: none;
            font-size: 18px;
            color: #e67e22;
            cursor: pointer;
            padding: 8px;
            border-radius: 6px;
            transition: background 0.3s ease;
          }

          .archive-button:hover {
            background: #ffeaa7;
          }

          .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f8f9fa;
          }

          .empty-chat {
            text-align: center;
            padding: 60px 20px;
            color: #666;
          }

          .empty-chat i {
            font-size: 48px;
            margin-bottom: 20px;
            color: #bdc3c7;
          }

          .empty-chat h3 {
            font-size: 24px;
            margin-bottom: 10px;
            color: #2c3e50;
          }

          .messages-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }

          .message {
            display: flex;
            margin-bottom: 16px;
            max-width: 85%;
            word-wrap: break-word;
          }

          .message.sent {
            justify-content: flex-end;
            margin-left: auto;
            margin-right: 0;
          }

          .message.received {
            justify-content: flex-start;
            margin-left: 0;
            margin-right: auto;
          }

          .message.system {
            justify-content: center;
            margin: 20px auto;
            max-width: 100%;
          }

          .message-content {
            background: #f1f3f4;
            padding: 12px 16px;
            border-radius: 18px;
            position: relative;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            transition: transform 0.2s ease;
          }

          .message-content:hover {
            transform: translateY(-1px);
          }

          .message.sent .message-content {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-bottom-right-radius: 4px;
          }

          .message.received .message-content {
            background: white;
            border: 1px solid #e1e8ed;
            border-bottom-left-radius: 4px;
            color: #14171a;
          }

          .message.system .message-content {
            background: #ffeaa7;
            color: #2d3436;
            text-align: center;
            border-radius: 20px;
            font-style: italic;
            border: 1px solid #fdcb6e;
          }

          .message-text {
            display: block;
            line-height: 1.4;
            font-size: 15px;
            white-space: pre-wrap;
          }

          .message-time {
            display: block;
            font-size: 11px;
            margin-top: 6px;
            opacity: 0.7;
            text-align: left;
          }

          .message.sent .message-time {
            text-align: right;
            color: rgba(255, 255, 255, 0.8);
          }

          .message.received .message-time {
            color: #657786;
          }

          .message-image {
            max-width: 250px;
            max-height: 200px;
            width: auto;
            height: auto;
            border-radius: 12px;
            margin-bottom: 8px;
            object-fit: cover;
            border: 1px solid rgba(0,0,0,0.1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }

          .message-image.clickable {
            cursor: pointer;
          }

          .message-image.clickable:hover {
            transform: scale(1.05);
            transition: transform 0.2s ease;
          }

          /* Image Modal Styles */
          .image-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }

          .image-modal-content {
            position: relative;
            max-width: 95vw;
            max-height: 95vh;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          }

          .close-modal-button {
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1001;
            transition: background 0.3s ease;
          }

          .close-modal-button:hover {
            background: rgba(0, 0, 0, 0.9);
          }

          .enlarged-image {
            display: block;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }

          .message-input-container {
            background: white;
            border-top: 1px solid #e0e0e0;
            padding: 20px;
          }

          .error-banner {
            background: #f8d7da;
            color: #721c24;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .close-error {
            background: none;
            border: none;
            color: #721c24;
            cursor: pointer;
            margin-right: auto;
            padding: 4px;
          }

          .message-input {
            display: flex;
            align-items: flex-end;
            gap: 12px;
            padding: 20px;
            background: white;
            border-top: 1px solid #e0e0e0;
            border-radius: 0 0 12px 12px;
          }

          .message-input textarea {
            flex: 1;
            min-height: 44px;
            max-height: 120px;
            padding: 12px 16px;
            border: 1px solid #e1e8ed;
            border-radius: 22px;
            resize: none;
            font-family: inherit;
            font-size: 15px;
            line-height: 1.4;
            outline: none;
            transition: all 0.3s ease;
            background: #f7f9fa;
          }

          .message-input textarea:focus {
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }

          .message-input textarea:disabled {
            opacity: 0.6;
            background: #f0f0f0;
          }

          .send-button {
            width: 44px;
            height: 44px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
          }

          .send-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }

          .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }

          .attach-button {
            width: 40px;
            height: 40px;
            background: none;
            border: none;
            font-size: 18px;
            color: #8899a6;
            cursor: pointer;
            border-radius: 50%;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .attach-button:hover {
            background: #f0f3f4;
            color: #667eea;
            transform: scale(1.1);
          }

          .loading-state, .error-state {
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

          .error-state i {
            font-size: 48px;
            color: #e74c3c;
            margin-bottom: 20px;
          }

          .btn-primary {
            background: #3498db;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: background 0.3s ease;
          }

          .btn-primary:hover {
            background: #2980b9;
          }

          .image-preview {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 10px;
            border: 1px solid #e0e0e0;
          }

          .preview-image {
            width: 50px;
            height: 50px;
            border-radius: 8px;
            object-fit: cover;
          }

          .remove-image {
            background: none;
            border: none;
            color: #e74c3c;
            cursor: pointer;
            font-size: 18px;
            padding: 5px;
            border-radius: 50%;
            transition: background 0.3s ease;
          }

          .remove-image:hover {
            background: #ffeaa7;
          }

          @media (max-width: 768px) {
            .chat-room-container {
              height: calc(100vh - 60px);
              border-radius: 0;
            }

            .chat-header {
              padding: 15px;
            }

            .participant-details h3 {
              font-size: 16px;
            }

            .message {
              max-width: 85%;
            }

            .chat-messages {
              padding: 15px;
            }

            .message-input-container {
              padding: 15px;
            }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
} 