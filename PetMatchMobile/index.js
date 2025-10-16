/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';
import messaging from '@react-native-firebase/messaging';

// Handle background/quit-state FCM messages
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('FCM background message:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
