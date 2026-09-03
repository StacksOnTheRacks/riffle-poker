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
import {
  createSeatCapabilityRoutes,
  createSeatCapabilityStores,
  type SeatCapabilityStores,
} from './seats/capability/routes.js';
import { createSeatRoutes, type SeatRouteDeps } from './seats/routes.js';

export interface AppStores extends BootstrapStores, SeatCapabilityStores {}

export interface AppOptions {
  env: RiffleEnv;
  stores?: Partial<AppStores>;
  seatDeps?: SeatRouteDeps;
}

export function createApp(options: AppOptions) {
  const { env } = options;
  const bootstrapStores = createBootstrapStores();
  const seatCapabilityStores = createSeatCapabilityStores(bootstrapStores.playSessionStore);
  const stores: AppStores = {
    ...bootstrapStores,
    ...seatCapabilityStores,
    ...options.stores,
  };

  const app = new Hono();

  app.route('/v1/bootstrap', createBootstrapRoutes(env, stores));
  app.route('/v1/seats', createSeatRoutes(env, options.seatDeps));
  app.route('/v1/seats/capability', createSeatCapabilityRoutes(env, stores));
  app.get('/play', createPlayPageHandler(env));
  app.get('/play.js', createPlayJsHandler());
  app.get('/play.css', createPlayCssHandler());

  return { app, stores };
}
