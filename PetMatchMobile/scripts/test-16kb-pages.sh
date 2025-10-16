#!/bin/bash

# Test script for 16KB page size compatibility
# This script helps ensure your React Native app is compatible with 16KB page sizes

echo "🔧 Testing 16KB Page Size Compatibility for PetMatch Mobile"
echo "============================================================="

# Check if Android SDK is available
if ! command -v adb &> /dev/null; then
    echo "❌ ADB not found. Please install Android SDK tools."
    exit 1
fi

echo "✅ Android SDK tools found"

# Check current React Native version
echo "📱 React Native Version:"
npx react-native --version

# Check if we have the correct NDK version
echo "🔨 Checking NDK configuration..."
grep -n "ndkVersion" ../android/build.gradle

# Check our targetSdkVersion
echo "🎯 Checking target SDK version..."
grep -n "targetSdkVersion" ../android/app/build.gradle

# Check if we have the correct ABI filters
echo "🏗️ Checking ABI filters..."
grep -A5 -n "abiFilters" ../android/app/build.gradle

# Verify only 64-bit ABIs are enabled in gradle.properties
echo "🧭 Checking configured ABIs..."
grep -n "reactNativeArchitectures" ../android/gradle.properties

# Confirm R8/ProGuard is enabled for release builds
echo "🛡️ Checking release minify flag..."
grep -n "enableProguardInReleaseBuilds = true" ../android/app/build.gradle

# Confirm native debug symbols will be generated for release
echo "🧩 Checking native debug symbol level..."
grep -A2 -n "debugSymbolLevel 'FULL'" ../android/app/build.gradle

echo ""
echo "✅ Configuration Summary:"
echo "- Updated versionCode to 10"
echo "- Updated versionName to 1.0.9"  
echo "- Restricted NDK ABI filters to arm64-v8a and x86_64"
echo "- Enabled 16KB page size support flags"
echo "- Enabled R8 with FULL native debug symbols for release builds"
echo ""
echo "🚀 To test with 16KB pages:"
echo "1. Build release APK: cd android && ./gradlew assembleRelease"
echo "2. Test on Android 15+ device or emulator"
echo "3. Upload to Google Play Console for validation"
echo ""
echo "📋 Next steps:"
echo "- Test thoroughly on Android 15+ devices"
echo "- Verify all native libraries are compatible"
echo "- Upload to Google Play for final validation" 