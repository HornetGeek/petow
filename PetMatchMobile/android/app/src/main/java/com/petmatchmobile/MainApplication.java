package com.petmatchmobile;

import android.app.Application;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactHost;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;
import java.util.Arrays;
import java.util.List;

// Import core React Native packages
import com.facebook.react.shell.MainReactPackage;

// Import AsyncStorage
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage;

// Import Geolocation Service
import com.agontuk.RNFusedLocation.RNFusedLocationPackage;

// Import WebView
import com.reactnativecommunity.webview.RNCWebViewPackage;

// Import Image Picker
import com.imagepicker.ImagePickerPackage;

// Import Document Picker
import com.reactnativedocumentpicker.RNDocumentPickerPackage;

// Import Firebase packages
import io.invertase.firebase.app.ReactNativeFirebaseAppPackage;
import io.invertase.firebase.analytics.ReactNativeFirebaseAnalyticsPackage;
import io.invertase.firebase.auth.ReactNativeFirebaseAuthPackage;
import io.invertase.firebase.firestore.ReactNativeFirebaseFirestorePackage;
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingPackage;
// Notification channel (Android 8+)
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.content.Context;

public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = Arrays.<ReactPackage>asList(
              new MainReactPackage(),
              new AsyncStoragePackage(),
              new RNFusedLocationPackage(),
              new RNCWebViewPackage(),
              new ImagePickerPackage(),
              new RNDocumentPickerPackage(),
              // Add Firebase packages
              new ReactNativeFirebaseAppPackage(),
              new ReactNativeFirebaseAnalyticsPackage(),
              new ReactNativeFirebaseAuthPackage(),
              new ReactNativeFirebaseFirestorePackage(),
              new ReactNativeFirebaseMessagingPackage()
          );
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
          return BuildConfig.IS_HERMES_ENABLED;
        }
      };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @Override
  public ReactHost getReactHost() {
    return DefaultReactHost.getDefaultReactHost(getApplicationContext(), getReactNativeHost());
  }

  @Override
  public void onCreate() {
    super.onCreate();
    SoLoader.init(this, /* native exopackage */ false);
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      DefaultNewArchitectureEntryPoint.load();
    }
    createDefaultNotificationChannel();
  }

  private void createDefaultNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      String channelId = getString(R.string.default_notification_channel_id);
      String channelName = getString(R.string.default_notification_channel_name);
      NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null && manager.getNotificationChannel(channelId) == null) {
        NotificationChannel channel = new NotificationChannel(
            channelId,
            channelName,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        manager.createNotificationChannel(channel);
      }
    }
  }
}
