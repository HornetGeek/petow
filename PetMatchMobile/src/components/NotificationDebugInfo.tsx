import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { shouldShowNotificationPermissionRequest } from '../services/notifications';

const NotificationDebugInfo: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<{
    authStatus: number | null;
    alreadyAsked: string | null;
    shouldShow: boolean | null;
    fcmToken: string | null;
  }>({
    authStatus: null,
    alreadyAsked: null,
    shouldShow: null,
    fcmToken: null,
  });

  const loadDebugInfo = async () => {
    try {
      console.log('🔍 Loading debug info...');
      
      const authStatus = await messaging().hasPermission();
      const alreadyAsked = await AsyncStorage.getItem('notificationPermissionAsked');
      const shouldShow = await shouldShowNotificationPermissionRequest();
      const fcmToken = await messaging().getToken();
      
      setDebugInfo({
        authStatus,
        alreadyAsked,
        shouldShow,
        fcmToken: fcmToken ? fcmToken.substring(0, 50) + '...' : null,
      });
      
      console.log('📋 Debug Info:', {
        authStatus,
        alreadyAsked,
        shouldShow,
        fcmTokenLength: fcmToken?.length,
      });
    } catch (error) {
      console.error('❌ Error loading debug info:', error);
    }
  };

  const clearAskedFlag = async () => {
    try {
      await AsyncStorage.removeItem('notificationPermissionAsked');
      console.log('🗑️ Cleared "already asked" flag');
      loadDebugInfo();
    } catch (error) {
      console.error('❌ Error clearing flag:', error);
    }
  };

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const getStatusText = (status: number | null) => {
    if (status === null) return 'Loading...';
    
    switch (status) {
      case messaging.AuthorizationStatus.NOT_DETERMINED:
        return 'NOT_DETERMINED (-1)';
      case messaging.AuthorizationStatus.DENIED:
        return 'DENIED (0)';
      case messaging.AuthorizationStatus.AUTHORIZED:
        return 'AUTHORIZED (1)';
      case messaging.AuthorizationStatus.PROVISIONAL:
        return 'PROVISIONAL (2)';
      default:
        return `Unknown (${status})`;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🐛 Notification Debug Info</Text>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Permission Status:</Text>
        <Text style={styles.value}>{getStatusText(debugInfo.authStatus)}</Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Already Asked:</Text>
        <Text style={styles.value}>{debugInfo.alreadyAsked || 'No'}</Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Should Show Modal:</Text>
        <Text style={[styles.value, { color: debugInfo.shouldShow ? 'green' : 'red' }]}>
          {debugInfo.shouldShow ? 'YES' : 'NO'}
        </Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>FCM Token:</Text>
        <Text style={styles.value}>{debugInfo.fcmToken || 'None'}</Text>
      </View>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={loadDebugInfo}>
          <Text style={styles.buttonText}>Refresh</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={clearAskedFlag}>
          <Text style={styles.buttonText}>Clear Asked Flag</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0F8FF',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  label: {
    fontWeight: 'bold',
    color: '#555',
    flex: 1,
  },
  value: {
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  button: {
    backgroundColor: '#3498DB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  clearButton: {
    backgroundColor: '#E74C3C',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default NotificationDebugInfo; 