/** Jest config for cfms-backend. */
module.exports = {
  testEnvironment: 'node',
  // Loads test env vars (DATABASE_URL pointing at the TEST db, JWT secrets,
  // etc.) before any test file or module (like src/config/prisma.js) runs.
  setupFiles: ['<rootDir>/tests/env.setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  // Integration tests share one real database, so running test files in
  // parallel would race on the same tables. Keep it simple and serial.
  maxWorkers: 1,
  clearMocks: true,
  verbose: true,
};
