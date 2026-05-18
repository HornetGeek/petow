import 'react-native-gesture-handler/jestSetup';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  try {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => {};
    return Reanimated;
  } catch {
    return {
      __esModule: true,
      default: { call: () => {} },
      call: () => {},
      createAnimatedComponent: (Component) => Component,
      Extrapolate: { CLAMP: 'clamp' },
      useSharedValue: (value) => ({ value }),
      useDerivedValue: (factory) => ({ value: factory() }),
      useAnimatedStyle: () => ({}),
      useAnimatedProps: () => ({}),
      withTiming: (value) => value,
      withSpring: (value) => value,
      withDelay: (_delay, value) => value,
      withRepeat: (value) => value,
      cancelAnimation: () => {},
      runOnJS: (fn) => fn,
      runOnUI: (fn) => fn,
    };
  }
}, { virtual: true });

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon', { virtual: true });

jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn(() => '1.0.16'),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native-image-picker
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
    Marker: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
    MapView: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
  };
});

// Silence the warning: Animated: `useNativeDriver` is not supported
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
