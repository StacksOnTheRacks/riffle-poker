import { Hono } from 'hono';
import type { BootstrapStores } from '../bootstrap/routes.js';
import type { RiffleEnv } from '../env.js';
import type { CreateMatchDeps } from '../matches/create.js';
import type { CreateSeatDeps } from '../seats/create.js';
import type { SeatCapabilityStores } from '../seats/capability/routes.js';
import { enforceLabGate } from './gate.js';
import type { GetRemoteAddress } from './remote-address.js';
import { startLabSessionOrError } from './session.js';

export interface LabRouteDeps extends CreateMatchDeps, CreateSeatDeps {
  getRemoteAddress?: GetRemoteAddress;
}

export type LabRouteStores = Pick<BootstrapStores, 'bootstrapLedger'> &
  Pick<SeatCapabilityStores, 'seatCapabilityLedger'>;

export function createLabRoutes(
  env: RiffleEnv,
  stores: LabRouteStores,
  deps: LabRouteDeps = {},
) {
  const routes = new Hono();

  routes.post('/session', async (c) => {
    const gate = enforceLabGate(c, env, deps.getRemoteAddress);
    if (gate) {
      return gate;
    }

    try {
      await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_content_type' }, { status: 400 });
    }

    const result = await startLabSessionOrError(env, stores, deps);
    if (result instanceof Response) {
      return result;
    }

    return Response.json(result, { status: 201 });
  });

  routes.get('/session', () => {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  });

  return routes;
}
