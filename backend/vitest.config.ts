import os from 'os';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Each runner owns its database so concurrent reviews cannot erase one another's fixtures.
// Use an explicit *_test_db override only when inspecting a particular test database.
const testEnv = {
  NODE_ENV: 'test',
  AUTH_RATE_LIMIT: '500',
  SMS_RATE_LIMIT: '500',
  API_RATE_LIMIT: '5000',
  EMAIL_PROVIDER: 'console',
  MARIADB_DATABASE: process.env.UNMUTE_TEST_DATABASE || `unmute_${process.pid}_test_db`,
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  CORS_ORIGIN: 'http://localhost:5173',
  // Uploaded test photos go to a throwaway folder, never data/uploads.
  UPLOAD_DIR: path.join(os.tmpdir(), `unmute-test-uploads-${process.pid}`),
  PRIVATE_UPLOAD_DIR: path.join(os.tmpdir(), `unmute-test-private-${process.pid}`),
};
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
  },
});
