# Google Maps Setup

This project now uses Google Maps for mobile/web map UI and backend geocoding proxy endpoints.

## Required Google APIs

Enable these APIs in the same Google Cloud project:

1. `Geocoding API`
2. `Places API`
3. `Maps JavaScript API`
4. `Maps SDK for Android`
5. `Maps SDK for iOS`

## Environment Variables

### Backend (`patmatch`)

- `GOOGLE_MAPS_SERVER_API_KEY`

Use this only on the server for:

- `/accounts/maps/autocomplete/`
- `/accounts/maps/geocode/`
- `/accounts/maps/reverse-geocode/`

### Web (`petow-frontend`)

- `NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY`

Used by `petow-frontend/src/components/MapLocationPicker.tsx`.

### Mobile Android (`PetMatchMobile`)

- `GOOGLE_MAPS_ANDROID_API_KEY`

The Android manifest reads `${googleMapsApiKey}` from Gradle `manifestPlaceholders`.

Recommended local setup in `PetMatchMobile/android/gradle.properties` (or `~/.gradle/gradle.properties`):

```properties
GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key
```

### Mobile iOS (`PetMatchMobile`)

- `GOOGLE_MAPS_IOS_API_KEY`

`Info.plist` uses `$(GOOGLE_MAPS_IOS_API_KEY)`, and `AppDelegate.mm` reads it at runtime.

Set this in Xcode Build Settings or your `.xcconfig`:

```xcconfig
GOOGLE_MAPS_IOS_API_KEY=your_ios_maps_key
```

## Key Restrictions (Required)

Apply strict restrictions per key:

1. **Server key**
   - Restrict by API: `Geocoding API`, `Places API`
   - Restrict by source IP/server network where possible
2. **Web key**
   - Restrict by HTTP referrer (allowed domains only)
   - Restrict by API: `Maps JavaScript API`
3. **Android key**
   - Restrict by package name + SHA-1 signing certificate
   - Restrict by API: `Maps SDK for Android`
4. **iOS key**
   - Restrict by bundle identifier
   - Restrict by API: `Maps SDK for iOS`

## Failure Behavior

- Backend returns explicit errors when server key is missing or quota is exceeded.
- Web map picker shows an explicit message if the JS key is missing or Google Maps script fails to load.
