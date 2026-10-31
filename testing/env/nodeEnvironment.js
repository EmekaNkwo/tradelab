/** Test-only: the logic project's Node environment, with test-database teardown. */
const { TestEnvironment } = require('jest-environment-node');
const { withTestDbTeardown } = require('./withTestDbTeardown');

module.exports = withTestDbTeardown(TestEnvironment);
