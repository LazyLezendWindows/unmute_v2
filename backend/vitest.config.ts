import os from 'os';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Tests always run against an isolated database; never the development `unmute_db`.
const testEnv = {
  NODE_ENV: 'test',
  MARIADB_DATABASE: 'unmute_test_db',
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  CORS_ORIGIN: 'http://localhost:5173',
  // Uploaded test photos go to a throwaway folder, never data/uploads.
  UPLOAD_DIR: path.join(os.tmpdir(), `unmute-test-uploads-${process.pid}`),
};
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
  },
});
