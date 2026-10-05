import 'react-native-gesture-handler';
import './src/utils/patchReactNativeMaps';
import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import {handleBackgroundRemoteMessage, handleNotifeeBackgroundEvent} from './src/services/notifications';

// Handle background/quit-state FCM messages (both iOS and Android)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('Background message received:', remoteMessage);
  await handleBackgroundRemoteMessage(remoteMessage);
});

// Handle notifee background events (notification actions, dismissals, etc.)
notifee.onBackgroundEvent(async (event) => {
  console.log('Notifee background event:', event);
  await handleNotifeeBackgroundEvent(event);
});

AppRegistry.registerComponent(appName, () => App);
