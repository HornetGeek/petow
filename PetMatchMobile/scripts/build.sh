#!/bin/bash

# Build script for PetMatch Mobile App

echo "Building PetMatch Mobile App..."

# Check if platform is specified
if [ -z "$1" ]; then
    echo "Usage: ./scripts/build.sh [android|ios]"
    exit 1
fi

PLATFORM=$1

if [ "$PLATFORM" = "android" ]; then
    echo "Building for Android..."
    cd android
    ./gradlew assembleRelease
    echo "APK built successfully!"
    echo "Location: android/app/build/outputs/apk/release/app-release.apk"
elif [ "$PLATFORM" = "ios" ]; then
    echo "Building for iOS..."
    cd ios
    xcodebuild -workspace PetMatchMobile.xcworkspace -scheme PetMatchMobile -configuration Release -destination generic/platform=iOS -archivePath PetMatchMobile.xcarchive archive
    echo "iOS archive built successfully!"
else
    echo "Invalid platform. Use 'android' or 'ios'"
    exit 1
fi

