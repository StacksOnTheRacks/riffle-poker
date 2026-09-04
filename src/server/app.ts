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
import { createMatchRoutes, type MatchRouteDeps } from './matches/routes.js';
import { createSeatRoutes, type SeatRouteDeps } from './seats/routes.js';
import { createHandRoutes, type HandRouteDeps } from './hands/routes.js';
import { createActionRoutes, type ActionRouteStores } from './actions/routes.js';
import type { SubmitActionDeps } from './actions/submit.js';
import { createTableRoutes, type TableRouteDeps } from './table/routes.js';

export interface AppStores extends BootstrapStores, SeatCapabilityStores {}

export interface AppOptions {
  env: RiffleEnv;
  stores?: Partial<AppStores>;
  matchDeps?: MatchRouteDeps;
  seatDeps?: SeatRouteDeps;
  handDeps?: HandRouteDeps;
  tableDeps?: TableRouteDeps;
  actionDeps?: SubmitActionDeps;
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
  app.route('/v1/matches', createMatchRoutes(env, options.matchDeps));
  app.route('/v1/seats', createSeatRoutes(env, options.seatDeps));
  app.route(
    '/v1/seats',
    createActionRoutes(env, stores as ActionRouteStores, options.actionDeps),
  );
  app.route('/v1/seats/capability', createSeatCapabilityRoutes(env, stores));
  app.route('/v1/hands', createHandRoutes(env, options.handDeps));
  app.route('/v1', createTableRoutes(env, stores, options.tableDeps));
  app.get('/play', createPlayPageHandler(env));
  app.get('/play.js', createPlayJsHandler());
  app.get('/play.css', createPlayCssHandler());

  return { app, stores };
}
