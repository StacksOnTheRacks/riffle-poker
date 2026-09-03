import { createApp } from '../../src/server/app.js';
import type { HandRouteDeps } from '../../src/server/hands/routes.js';
import type { SeatRouteDeps } from '../../src/server/seats/routes.js';
import type { TableRouteDeps } from '../../src/server/table/routes.js';
import { resetEnvCache } from '../../src/server/env.js';
import {
  TEST_FRAME_ANCESTORS,
  TEST_HOST_API_KEY,
  TEST_PUBLIC_ORIGIN,
} from './fixtures.js';

export interface TestAppOptions {
  seatDeps?: SeatRouteDeps;
  handDeps?: HandRouteDeps;
  tableDeps?: TableRouteDeps;
}

export function createTestApp(options: TestAppOptions = {}) {
  resetEnvCache();
  return createApp({
    env: {
      hostApiKey: TEST_HOST_API_KEY,
      publicOrigin: TEST_PUBLIC_ORIGIN,
      listenPort: 3000,
      frameAncestors: TEST_FRAME_ANCESTORS,
    },
    seatDeps: options.seatDeps,
    handDeps: options.handDeps,
    tableDeps: options.tableDeps,
  });
}

export function authHeaders(apiKey: string = TEST_HOST_API_KEY): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}
