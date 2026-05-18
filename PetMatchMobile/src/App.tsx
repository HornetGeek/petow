import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { initNotifications } from './services/notifications';
import { queryClient } from './services/queryClient';
import AppUpdateGate from './components/AppUpdateGate';

const AppContent: React.FC = () => {
  useEffect(() => {
    initNotifications();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
};

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <AppUpdateGate>
        <AppContent />
      </AppUpdateGate>
    </SafeAreaProvider>
  );
};

export default App;
