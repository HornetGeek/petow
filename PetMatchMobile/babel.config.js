module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
        },
      },
    ],
    ['@babel/plugin-transform-private-methods', {loose: true}],
    ['@babel/plugin-transform-class-properties', {loose: true}],
    ['@babel/plugin-transform-private-property-in-object', {loose: true}],
  ],
  overrides: [
    {
      test: ['./node_modules/@tanstack'],
      plugins: [
        ['@babel/plugin-transform-class-properties', {loose: true}],
        ['@babel/plugin-transform-private-methods', {loose: true}],
        ['@babel/plugin-transform-private-property-in-object', {loose: true}],
      ],
    },
  ],
};
