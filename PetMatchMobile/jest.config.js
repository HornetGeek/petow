module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-.*|@react-navigation|@react-native-community|@react-native-firebase|react-native-vector-icons|react-native-paper|react-native-elements|react-native-super-grid|react-native-skeleton-placeholder|react-native-linear-gradient|react-native-svg|react-native-webview|react-native-share|react-native-device-info|react-native-keychain|react-native-push-notification|react-native-fbsdk-next|react-native-google-signin|react-native-apple-authentication|react-native-date-picker|react-native-picker-select|react-native-snap-carousel|react-native-swipe-gestures|react-native-gesture-handler|react-native-reanimated|react-native-screens|react-native-safe-area-context|@react-native-async-storage|react-native-image-picker|react-native-maps|react-native-geolocation-service|react-native-permissions|react-native-ratings|react-native-modal)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/android/', '<rootDir>/ios/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
