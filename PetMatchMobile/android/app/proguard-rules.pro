# React Native ProGuard Rules
# Keep React Native classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep DataStore Preferences classes (used by Firebase Heartbeat/Firestore 26+)
-keep class androidx.datastore.** { *; }
-keep class androidx.datastore.preferences.** { *; }

# Keep Kotlin metadata to avoid issues with reflection on Kotlin classes
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }

# Keep Firebase Heartbeat classes
-keep class com.google.firebase.heartbeatinfo.** { *; }
-keep class com.google.firebase.** { *; }

# Keep gRPC and Firestore internal classes accessed via reflection
-keep class io.grpc.** { *; }
-keep class com.google.firebase.firestore.** { *; }

# Keep native method names for React Native
-keepclassmembers class * {
    native <methods>;
}

# Keep JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep React Native Bridge classes
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.modules.** { *; }

# Keep Android Support/AndroidX libraries
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep Gson classes (if used)
-keep class com.google.gson.** { *; }

# Keep OkHttp classes (commonly used by React Native)
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# General Android optimizations
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

# Keep crash reporting intact
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception

# Remove logging calls (optional - uncomment to remove debug logs)
# -assumenosideeffects class android.util.Log {
#     public static *** d(...);
#     public static *** v(...);
# }

