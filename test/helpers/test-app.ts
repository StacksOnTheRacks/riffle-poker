import { createApp } from '../../src/server/app.js';
import { resetEnvCache } from '../../src/server/env.js';
import {
  TEST_FRAME_ANCESTORS,
  TEST_HOST_API_KEY,
  TEST_PUBLIC_ORIGIN,
} from './fixtures.js';

export function createTestApp() {
  resetEnvCache();
  return createApp({
    env: {
      hostApiKey: TEST_HOST_API_KEY,
      publicOrigin: TEST_PUBLIC_ORIGIN,
      listenPort: 3000,
      frameAncestors: TEST_FRAME_ANCESTORS,
    },
  });
}

export function authHeaders(apiKey: string = TEST_HOST_API_KEY): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}
