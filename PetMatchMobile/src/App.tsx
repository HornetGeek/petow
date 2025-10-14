import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { useEffect } from 'react';
import { initNotifications } from './services/notifications';

const App: React.FC = () => {
  useEffect(() => {
    initNotifications();
  }, []);
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
};

export default App;
