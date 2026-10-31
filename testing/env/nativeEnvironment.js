/** Test-only: jest-expo's React Native environment (the UI project's preset), with test-database teardown. */
const ReactNativeEnvironment = require('jest-expo/src/preset/nativeEnvironment');
const { withTestDbTeardown } = require('./withTestDbTeardown');

module.exports = withTestDbTeardown(ReactNativeEnvironment);
