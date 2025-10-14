import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import firebase from '@react-native-firebase/app';
import analytics from '@react-native-firebase/analytics';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const FirebaseTest: React.FC = () => {
  const [firebaseStatus, setFirebaseStatus] = useState<string>('Checking...');
  const [analyticsStatus, setAnalyticsStatus] = useState<string>('Checking...');
  const [authStatus, setAuthStatus] = useState<string>('Checking...');
  const [firestoreStatus, setFirestoreStatus] = useState<string>('Checking...');

  useEffect(() => {
    checkFirebaseStatus();
  }, []);

  const checkFirebaseStatus = async () => {
    try {
      // Check Firebase App
      if (firebase.apps.length > 0) {
        setFirebaseStatus('✅ Firebase App initialized');
      } else {
        setFirebaseStatus('❌ Firebase App not initialized');
      }

      // Check Analytics
      try {
        await analytics().logEvent('firebase_test', {
          test_type: 'initialization',
        });
        setAnalyticsStatus('✅ Analytics working');
      } catch (error) {
        setAnalyticsStatus('❌ Analytics error: ' + error.message);
      }

      // Check Auth
      try {
        const currentUser = auth().currentUser;
        setAuthStatus('✅ Auth working (User: ' + (currentUser ? 'Logged in' : 'Not logged in') + ')');
      } catch (error) {
        setAuthStatus('❌ Auth error: ' + error.message);
      }

      // Check Firestore
      try {
        await firestore().collection('test').doc('test').get();
        setFirestoreStatus('✅ Firestore working');
      } catch (error) {
        setFirestoreStatus('❌ Firestore error: ' + error.message);
      }

    } catch (error) {
      Alert.alert('Firebase Test Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Firebase Test</Text>
      <Text style={styles.status}>Firebase App: {firebaseStatus}</Text>
      <Text style={styles.status}>Analytics: {analyticsStatus}</Text>
      <Text style={styles.status}>Auth: {authStatus}</Text>
      <Text style={styles.status}>Firestore: {firestoreStatus}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    marginVertical: 5,
  },
});

export default FirebaseTest; 