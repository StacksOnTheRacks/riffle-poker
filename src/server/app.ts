import { Hono } from 'hono';
import type { RiffleEnv } from './env.js';
import {
  createBootstrapRoutes,
  createBootstrapStores,
  createPlayCssHandler,
  createPlayJsHandler,
  createPlayPageHandler,
  type BootstrapStores,
} from './bootstrap/routes.js';

export interface AppOptions {
  env: RiffleEnv;
  stores?: BootstrapStores;
}

export function createApp(options: AppOptions) {
  const { env } = options;
  const stores = options.stores ?? createBootstrapStores();

  const app = new Hono();

  app.route('/v1/bootstrap', createBootstrapRoutes(env, stores));
  app.get('/play', createPlayPageHandler(env));
  app.get('/play.js', createPlayJsHandler());
  app.get('/play.css', createPlayCssHandler());

  return { app, stores };
}
