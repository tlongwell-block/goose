/** @type {import('jest').Config} */
const config = {
  // Indicates that the root directory contains the source and test files
  rootDir: '.',
  // Find test files with .test.mjs or .spec.mjs extensions
  testMatch: [
    '**/__tests__/**/*.?(m)js?(x)',
    '**/?(*.)+(spec|test).?(m)js?(x)'
  ],
  // Specify environment
  testEnvironment: 'jsdom',
  // Since we use ES Modules, ensure transforms are bypassed for .mjs
  transform: {},
};

export default config;
