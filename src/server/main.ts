import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const { app } = createApp({ env });

serve(
  {
    fetch: app.fetch,
    port: env.listenPort,
  },
  (info) => {
    console.log(`riffle-poker listening on http://localhost:${info.port}`);
  },
);
