'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, Notification } from '@/lib/api';
import AuthModal from './AuthModal';
import { usePathname } from 'next/navigation';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const pathname = usePathname();

  // Check if we're on the homepage
  const isHomepage = pathname === '/';
  
  // Get current hash for homepage sections
  const [currentHash, setCurrentHash] = useState('');
  


  // تحميل الإشعارات
  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      loadUnreadCount();
      
      // تحديث كل 30 ثانية
      const interval = setInterval(() => {
        loadUnreadCount();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // مراقبة تغييرات hash للصفحة الرئيسية
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };

    // تعيين hash الحالي
    setCurrentHash(window.location.hash);

    // مراقبة تغييرات hash
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);



  const loadNotifications = async () => {
    try {
      const data = await apiService.getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const data = await apiService.getUnreadNotificationsCount();
      setUnreadCount(data.unread_count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await apiService.markNotificationAsRead(notificationId);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, is_read: true } 
            : notif
        )
      );
      loadUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiService.markAllNotificationsAsRead();
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, is_read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleLoginClick = () => {
    setAuthMode('login');
    setShowAuthModal(true);
  };

  const handleRegisterClick = () => {
    setAuthMode('register');
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
    setShowMobileMenu(false);
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };

  return (
    <>
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Link href="/" onClick={closeMobileMenu} className={`logo-link ${pathname === '/' ? 'active' : ''}`}>
              <img src="/peto-wordmark.svg" alt="Peto" className="logo-wordmark" />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="nav desktop-nav">
                        <Link 
              href="/pets" 
              className={`nav-link ${pathname && pathname.startsWith('/pets') ? 'active' : ''}`}
            >
              الحيوانات
            </Link>
            <Link href="/adoption" className={`nav-link ${pathname && pathname.startsWith('/adoption') ? 'active' : ''}`}>
              التبني
            </Link>
            {isHomepage ? (
              // Show homepage specific links
              <>
                <Link href="/#features" className={`nav-link ${currentHash === '#features' ? 'active' : ''}`}>
                  المميزات
                </Link>
                <Link href="/#how-it-works" className={`nav-link ${currentHash === '#how-it-works' ? 'active' : ''}`}>
                  كيف يعمل
                </Link>
              </>
            ) : (
              // Show authenticated user links on other pages
              isAuthenticated && (
                <>
                  <Link href="/my-breeding-requests" className={`nav-link ${pathname && pathname.startsWith('/my-breeding-requests') ? 'active' : ''}`}>
                    طلبات التزاوج
                  </Link>
                  <Link href="/chat" className={`nav-link ${pathname && pathname.startsWith('/chat') ? 'active' : ''}`}>
                    المحادثات
                  </Link>
                </>
              )
            )}
          </nav>

          {/* Desktop Auth Section */}
          <div className="auth-section desktop-auth">
            {isAuthenticated ? (
              <>
                {/* زر الإشعارات */}
                <div className="notification-wrapper">
                  <button 
                    className="notification-btn"
                    onClick={() => {
                      setShowNotifications(!showNotifications);
                      if (!showNotifications) {
                        loadNotifications();
                        loadUnreadCount();
                      }
                    }}
                  >
                    <i className="fas fa-bell"></i>
                    {unreadCount > 0 && (
                      <span className="notification-badge">{unreadCount}</span>
                    )}
                  </button>
                  
                  {showNotifications && (
                    <div className="notification-dropdown">
                      <div className="notification-header">
                        <h4>الإشعارات</h4>
                        {unreadCount > 0 && (
                          <button 
                            className="mark-all-read-btn"
                            onClick={handleMarkAllAsRead}
                          >
                            تعيين الكل كمقروء
                          </button>
                        )}
                      </div>
                      
                      <div className="notification-list">
                        {notifications.length > 0 ? (
                          notifications.slice(0, 5).map((notification) => (
                            <div 
                              key={notification.id} 
                              className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                              onClick={() => handleMarkAsRead(notification.id)}
                            >
                              <div className="notification-content">
                                <div className="notification-title">{notification.title}</div>
                                <div className="notification-message">{notification.message}</div>
                                <div className="notification-time">{notification.time_ago}</div>
                              </div>
                              {!notification.is_read && (
                                <div className="notification-dot"></div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="no-notifications">
                            <i className="fas fa-bell-slash"></i>
                            <span>لا توجد إشعارات</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="user-menu-wrapper">
                  <button 
                    className="user-btn"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                  >
                    <div className="user-avatar">
                      {user?.first_name?.charAt(0) || 'U'}
                    </div>
                    <span className="user-name">{user?.first_name}</span>
                    <i className={`fas fa-chevron-down ${showUserMenu ? 'rotated' : ''}`}></i>
                  </button>
                
                  {showUserMenu && (
                    <div className="user-dropdown">
                      {/* Profile Header */}
                      <div className="dropdown-header">
                        <div className="user-info">
                          <div className="user-avatar-large">
                            {user?.first_name?.charAt(0) || 'U'}
                          </div>
                          <div className="user-details">
                            <div className="user-name-large">{user?.first_name}</div>
                            <div className="user-email">{user?.email}</div>
                          </div>
                        </div>
                      </div>

                      {/* Main Actions */}
                      <div className="dropdown-section">
                        <div className="section-title">إدارة الحساب</div>
                      <Link href="/profile" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-user-circle"></i>
                            <span>الملف الشخصي</span>
                          </div>
                      </Link>
                      <Link href="/my-pets" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-paw"></i>
                            <span>حيواناتي</span>
                          </div>
                      </Link>
                      <Link href="/favorites" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-heart"></i>
                            <span>المفضلة</span>
                          </div>
                      </Link>
                      </div>

                      {/* Add Pet Section */}
                      <div className="dropdown-section">
                        <div className="section-title">إضافة حيوان</div>
                        <Link href="/add-pet" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-plus-circle"></i>
                            <span>إضافة حيوان</span>
                          </div>
                        </Link>
                      </div>

                      {/* Requests Section */}
                      <div className="dropdown-section">
                        <div className="section-title">الطلبات</div>
                        <Link href="/my-breeding-requests" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-venus-mars"></i>
                            <span>طلبات التزاوج</span>
                          </div>
                        </Link>
                        <Link href="/adoption/my-requests" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-paper-plane"></i>
                            <span>طلبات التبني المرسلة</span>
                          </div>
                        </Link>
                        <Link href="/adoption/received" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="dropdown-item-content">
                            <i className="fas fa-inbox"></i>
                            <span>طلبات التبني المستقبلة</span>
                          </div>
                        </Link>
                      </div>

                      {/* Logout Section */}
                      <div className="dropdown-section">
                      <button onClick={handleLogout} className="dropdown-item logout">
                          <div className="dropdown-item-content">
                            <i className="fas fa-sign-out-alt"></i>
                            <span>تسجيل الخروج</span>
                          </div>
                      </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="auth-buttons">
                <button onClick={handleLoginClick} className="btn btn-outline">
                  تسجيل الدخول
                </button>
                <button onClick={handleRegisterClick} className="btn btn-primary">
                  إنشاء حساب
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="mobile-menu-btn"
            onClick={toggleMobileMenu}
            aria-label="فتح القائمة"
          >
            <div className={`hamburger ${showMobileMenu ? 'active' : ''}`}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="mobile-menu">
            <div className="mobile-menu-content">
              {/* Navigation Links */}
              <nav className="mobile-nav">
                <Link href="/pets" className={`mobile-nav-link ${pathname && pathname.startsWith('/pets') ? 'active' : ''}`} onClick={closeMobileMenu}>
                  الحيوانات
                </Link>
                <Link href="/adoption" className={`mobile-nav-link ${pathname && pathname.startsWith('/adoption') ? 'active' : ''}`} onClick={closeMobileMenu}>
                  التبني
                </Link>
                {isHomepage ? (
                  // Show homepage specific links
                  <>
                    <Link href="/#features" className={`mobile-nav-link ${currentHash === '#features' ? 'active' : ''}`} onClick={closeMobileMenu}>
                      المميزات
                    </Link>
                    <Link href="/#how-it-works" className={`mobile-nav-link ${currentHash === '#how-it-works' ? 'active' : ''}`} onClick={closeMobileMenu}>
                      كيف يعمل
                    </Link>
                  </>
                ) : (
                  // Show authenticated user links on other pages
                  isAuthenticated && (
                    <>
                      <Link href="/my-breeding-requests" className={`mobile-nav-link ${pathname && pathname.startsWith('/my-breeding-requests') ? 'active' : ''}`} onClick={closeMobileMenu}>
                        طلبات التزاوج
                      </Link>
                      <Link href="/chat" className={`mobile-nav-link ${pathname && pathname.startsWith('/chat') ? 'active' : ''}`} onClick={closeMobileMenu}>
                        المحادثات
                      </Link>
                    </>
                  )
                )}
              </nav>

              {/* Mobile Auth Section */}
              {isAuthenticated ? (
                <div className="mobile-user-section">
                  <div className="mobile-user-info">
                    <div className="user-avatar large">
                      {user?.first_name?.charAt(0) || 'U'}
                    </div>
                    <div className="user-details">
                      <div className="user-name">{user?.first_name} {user?.last_name}</div>
                      <div className="user-email">{user?.email}</div>
                    </div>
                    {unreadCount > 0 && (
                      <div className="mobile-notification-badge">{unreadCount}</div>
                    )}
                  </div>
                  
                  <div className="mobile-user-links">
                    <Link href="/profile" className="mobile-user-link" onClick={closeMobileMenu}>
                      <i className="fas fa-user"></i>
                      الملف الشخصي
                    </Link>
                    <Link href="/my-pets" className="mobile-user-link" onClick={closeMobileMenu}>
                      <i className="fas fa-paw"></i>
                      حيواناتي
                    </Link>
                    <Link href="/favorites" className="mobile-user-link" onClick={closeMobileMenu}>
                      <i className="fas fa-heart"></i>
                      المفضلة
                    </Link>
                    <button onClick={handleLogout} className="mobile-user-link logout">
                      <i className="fas fa-sign-out-alt"></i>
                      تسجيل الخروج
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mobile-auth-buttons">
                  <button onClick={handleLoginClick} className="btn btn-outline full-width">
                    تسجيل الدخول
                  </button>
                  <button onClick={handleRegisterClick} className="btn btn-primary full-width">
                    إنشاء حساب
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />

      <style jsx>{`
        .header {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%);
          backdrop-filter: blur(20px);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          position: sticky;
          top: 0;
          z-index: 1000;
          transition: all 0.3s ease;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 clamp(16px, 4vw, 30px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: clamp(70px, 10vw, 80px);
        }

        .logo a {
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: transform 0.3s ease;
        }

        .logo a:hover {
          transform: translateY(-1px);
        }

        .logo-link.active {
          position: relative;
        }

        .logo-link.active::after {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 30px;
          height: 3px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 2px;
        }

        .logo h1 {
          display: none;
        }

        .logo-wordmark {
          height: clamp(28px, 5vw, 36px);
          width: auto;
          display: block;
        }

        /* Desktop Navigation */
        .desktop-nav {
          display: flex;
          gap: 8px;
          background: rgba(255, 255, 255, 0.1);
          padding: 6px;
          border-radius: 50px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        @media (max-width: 768px) {
          .desktop-nav {
            display: none;
          }
        }

        .nav-link {
          padding: 12px 20px;
          color: #374151 !important;
          text-decoration: none !important;
          border-radius: 25px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          position: relative !important;
          background: transparent !important;
          border: none !important;
          white-space: nowrap;
        }

        .nav-link::before,
        .nav-link::after {
          display: none !important;
        }

        .nav-link:hover {
          background: rgba(99, 102, 241, 0.1) !important;
          color: #4f46e5 !important;
          transform: translateY(-2px) !important;
        }

        .nav-link.active {
          background: rgba(99, 102, 241, 0.15) !important;
          color: #4f46e5 !important;
          border: 1px solid rgba(99, 102, 241, 0.3) !important;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2) !important;
          position: relative;
          font-weight: 700 !important;
        }

        .nav-link.active::after {
          content: '';
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 3px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 2px;
        }



        /* Desktop Auth Section */
        .desktop-auth {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .desktop-auth {
            display: none;
          }
        }

        .notification-wrapper {
          position: relative;
        }

        .notification-btn {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .notification-btn:hover {
          background: rgba(255, 255, 255, 1);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .notification-btn i {
          font-size: 18px;
          color: #374151;
        }

        .notification-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .notification-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          border: 1px solid rgba(0, 0, 0, 0.05);
          width: 350px;
          max-height: 500px;
          overflow: hidden;
          z-index: 1001;
        }

        .notification-header {
          padding: 20px;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .notification-header h4 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #1f2937;
        }

        .mark-all-read-btn {
          background: none;
          border: none;
          color: #6366f1;
          font-size: 14px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .mark-all-read-btn:hover {
          background: #f3f4f6;
        }

        .notification-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .notification-item {
          padding: 16px 20px;
          border-bottom: 1px solid #f9fafb;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          position: relative;
        }

        .notification-item:hover {
          background: #f9fafb;
        }

        .notification-item.unread {
          background: #fef7ff;
          border-left: 4px solid #8b5cf6;
        }

        .notification-content {
          flex: 1;
        }

        .notification-title {
          font-weight: 600;
          font-size: 14px;
          color: #1f2937;
          margin-bottom: 4px;
        }

        .notification-message {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.4;
          margin-bottom: 6px;
        }

        .notification-time {
          font-size: 12px;
          color: #9ca3af;
        }

        .notification-dot {
          width: 8px;
          height: 8px;
          background: #8b5cf6;
          border-radius: 50%;
          margin-top: 4px;
        }

        .no-notifications {
          padding: 40px 20px;
          text-align: center;
          color: #9ca3af;
        }

        .no-notifications i {
          font-size: 48px;
          margin-bottom: 12px;
          opacity: 0.5;
        }

        .no-notifications span {
          display: block;
          font-size: 16px;
        }

        .user-menu-wrapper {
          position: relative;
        }

        .user-btn {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-btn:hover {
          background: rgba(255, 255, 255, 1);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: bold;
          color: white;
        }

        .user-name {
          font-weight: 600;
          font-size: 14px;
          color: #374151;
        }

        .user-btn i {
          font-size: 12px;
          color: #6b7280;
          transition: transform 0.3s ease;
        }

        .user-btn i.rotated {
          transform: rotate(180deg);
        }

        .user-dropdown {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.08);
          border: 1px solid #e2e8f0;
          min-width: 280px;
          overflow: hidden;
          z-index: 1001;
          display: flex !important;
          flex-direction: column !important;
          animation: dropdownSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Dropdown Header */
        .dropdown-header {
          padding: 20px 20px 16px;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-bottom: 1px solid #e2e8f0;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .user-avatar-large {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
          color: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
        }

        .user-details {
          flex: 1;
        }

        .user-name-large {
          font-size: 15px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 4px;
          line-height: 1.2;
        }

        .user-email {
          font-size: 13px;
          color: #64748b;
          font-weight: 400;
        }

        /* Dropdown Sections */
        .dropdown-section {
          padding: 12px 0;
          margin: 0;
        }

        .dropdown-section:not(:last-child) {
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 8px;
          padding-bottom: 16px;
        }

        .dropdown-section:last-child {
          padding-top: 16px;
          margin-top: 8px;
        }

        .section-title {
          padding: 0px 20px 12px;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          background: transparent;
          margin-bottom: 8px;
        }

        .dropdown-item {
          display: block !important;
          width: 100% !important;
          padding: 12px 20px !important;
          margin: 2px 0 !important;
          color: #334155 !important;
          text-decoration: none !important;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          border: none !important;
          background: none !important;
          text-align: right !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          box-sizing: border-box !important;
          font-family: "Cairo", sans-serif !important;
          position: relative !important;
          border-radius: 8px !important;
          min-height: 44px !important;
        }

        .dropdown-item-content {
          display: flex !important;
          align-items: center !important;
          gap: 14px !important;
          width: 100% !important;
        }

        .dropdown-item i {
          font-size: 15px !important;
          width: 18px !important;
          text-align: center !important;
          color: #64748b !important;
          transition: all 0.2s ease !important;
          flex-shrink: 0 !important;
        }

        .dropdown-item span {
          flex: 1 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .dropdown-item:hover {
          background: #f1f5f9 !important;
          color: #1e293b !important;
          transform: none !important;
        }

        .dropdown-item:hover i {
          color: #3b82f6 !important;
          transform: scale(1.05) !important;
        }

        .dropdown-item.logout {
          color: #dc2626 !important;
          background: #fef2f2 !important;
          margin: 8px 12px 0px !important;
          border-radius: 8px !important;
          border: 1px solid #fecaca !important;
          width: calc(100% - 24px) !important;
        }

        .dropdown-item.logout:hover {
          background: #fee2e2 !important;
          color: #991b1b !important;
          transform: none !important;
        }

        .dropdown-item.logout i {
          color: #dc2626 !important;
        }

        .dropdown-item.logout:hover i {
          color: #991b1b !important;
        }

        @keyframes dropdownSlide {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .dropdown-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
          margin: 8px 16px;
          opacity: 0.6;
        }

        .auth-buttons {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .btn {
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-block;
          text-align: center;
          border: 2px solid transparent;
        }

        .btn-outline {
          background: transparent;
          color: #6366f1;
          border-color: #6366f1;
        }

        .btn-outline:hover {
          background: #6366f1;
          color: white;
          transform: translateY(-2px);
        }

        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border-color: transparent;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
        }

        /* Mobile Menu Button */
        .mobile-menu-btn {
          display: none;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          z-index: 1001;
        }

        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: block;
          }
        }

        .mobile-menu-btn:hover {
          background: rgba(255, 255, 255, 1);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .hamburger {
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          width: 20px;
          height: 16px;
        }

        .hamburger span {
          display: block;
          width: 100%;
          height: 2px;
          background: #374151;
          border-radius: 2px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .hamburger.active span:nth-child(1) {
          transform: translateY(7px) rotate(45deg);
        }

        .hamburger.active span:nth-child(2) {
          opacity: 0;
        }

        .hamburger.active span:nth-child(3) {
          transform: translateY(-7px) rotate(-45deg);
        }

        /* Mobile Menu */
        .mobile-menu {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(10px);
          z-index: 999;
          display: flex;
          justify-content: center;
          align-items: center;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @media (min-width: 769px) {
          .mobile-menu {
            display: none !important;
          }
        }

        .mobile-menu-content {
          background: white;
          border-radius: 20px;
          padding: 30px;
          width: 90%;
          max-width: 400px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(30px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .mobile-nav {
          display: flex;
          flex-direction: column;
          gap: 0;
          margin-bottom: 20px;
        }

        .mobile-nav-link {
          text-decoration: none;
          color: #374151;
          font-size: 18px;
          font-weight: 600;
          padding: 16px 0;
          border-bottom: 1px solid #f3f4f6;
          transition: all 0.2s ease;
        }

        .mobile-nav-link:last-child {
          border-bottom: none;
        }

        .mobile-nav-link:hover {
          color: #6366f1;
          padding-left: 10px;
        }

        .mobile-nav-link.active {
          color: #6366f1;
          background: rgba(99, 102, 241, 0.1);
          border-right: 3px solid #6366f1;
          padding-right: 15px;
          position: relative;
          font-weight: 700;
        }

        .mobile-nav-link.active::after {
          content: '';
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 20px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 2px;
        }

        .mobile-user-section {
          padding-top: 20px;
          border-top: 2px solid #f3f4f6;
        }

        .mobile-user-info {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          position: relative;
        }

        .user-avatar.large {
          width: 50px;
          height: 50px;
          font-size: 20px;
        }

        .user-details {
          flex: 1;
        }

        .user-details .user-name {
          font-size: 16px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 2px;
        }

        .user-email {
          font-size: 14px;
          color: #6b7280;
        }

        .mobile-notification-badge {
          background: #ef4444;
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 12px;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .mobile-user-links {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .mobile-user-link {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: #374151;
          font-size: 16px;
          font-weight: 500;
          padding: 16px 0;
          border-bottom: 1px solid #f3f4f6;
          transition: all 0.2s ease;
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
          cursor: pointer;
          width: 100%;
          text-align: right;
          font-family: "Cairo", sans-serif;
        }

        .mobile-user-link:last-child {
          border-bottom: none;
        }

        .mobile-user-link:hover {
          color: #6366f1;
          padding-left: 10px;
        }

        .mobile-user-link.logout {
          color: #ef4444;
        }

        .mobile-user-link.logout:hover {
          color: #dc2626;
        }

        .mobile-user-link i {
          width: 20px;
          text-align: center;
        }

        .mobile-auth-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 20px;
          border-top: 2px solid #f3f4f6;
        }

        .btn.full-width {
          width: 100%;
          padding: 14px 20px;
          font-size: 16px;
        }

        /* Touch-friendly improvements */
        @media (hover: none) and (pointer: coarse) {
          .mobile-nav-link,
          .mobile-user-link {
            min-height: 44px;
            display: flex;
            align-items: center;
          }
        }
      `}</style>
    </>
  );
} 