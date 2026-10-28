const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const sdkRoot = path.resolve(__dirname, '..');
const voipRoot = path.resolve(__dirname, '../../abrova-push-react-native-voip');

const config = {
  watchFolders: [sdkRoot, voipRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
