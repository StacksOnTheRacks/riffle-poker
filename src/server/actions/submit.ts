import type { TurnurClient } from '@turnur/sdk';
import { applyAction, legalActions, legalize } from '../../rules/index.js';
import type { Card, HandState, LegalizedAction } from '../../rules/types.js';
import { requireSeatCapability } from '../seats/capability/gate.js';
import type { SeatCapabilityLedger } from '../seats/capability/ledger.js';
import {
  requireAuthenticatedTurnurClient,
  TurnurAuthenticationError,
} from '../turnur/session.js';
import { mapTableTurnurError } from '../table/errors.js';
import type { SeatTable } from '../table/dto.js';
import { parseHoleView } from '../table/dto.js';
import { buildActionPayload, type MoveLogItem } from '../hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  parseActionBody,
  reconstructHand,
} from '../hands/reconstruct.js';

export interface SubmitActionInput {
  matchId: string;
  seatId: string;
  action: unknown;
  capabilityToken: string | undefined;
  attachedMatchId?: string;
  ledger: SeatCapabilityLedger;
}

export interface SubmitActionDeps {
  getClient?: () => Promise<TurnurClient>;
  requireSeatCapabilityFn?: typeof requireSeatCapability;
  legalizeFn?: typeof legalize;
  applyActionFn?: typeof applyAction;
  legalActionsFn?: typeof legalActions;
}

export type SubmitActionError =
  | { kind: 'capability'; code: string }
  | { kind: 'turnur_unauthenticated'; reason: string }
  | { kind: 'turnur'; response: Response }
  | { kind: 'betting_not_open'; response: Response }
  | { kind: 'holes_not_dealt' }
  | { kind: 'invalid_view'; response: Response }
  | { kind: 'reconstruct_failed'; response: Response }
  | { kind: 'off_turn'; response: Response }
  | { kind: 'illegal_action'; response: Response }
  | { kind: 'all_in_or_side_pot_unsupported'; response: Response }
  | { kind: 'already_complete'; response: Response }
  | { kind: 'illegal_turn'; response: Response };

function isTurnur409(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string; status?: number }).name === 'TurnurApiError' &&
    (error as { status?: number }).status === 409
  );
}

function mapRulesReject(code: string): SubmitActionError | null {
  switch (code) {
    case 'off_turn':
      return {
        kind: 'off_turn',
        response: Response.json({ error: 'off_turn' }, { status: 409 }),
      };
    case 'illegal_action':
      return {
        kind: 'illegal_action',
        response: Response.json({ error: 'illegal_action' }, { status: 400 }),
      };
    case 'all_in_or_side_pot_unsupported':
      return {
        kind: 'all_in_or_side_pot_unsupported',
        response: Response.json({ error: 'all_in_or_side_pot_unsupported' }, { status: 400 }),
      };
    case 'already_complete':
      return {
        kind: 'already_complete',
        response: Response.json({ error: 'already_complete' }, { status: 409 }),
      };
    default:
      return {
        kind: 'illegal_action',
        response: Response.json({ error: 'illegal_action' }, { status: 400 }),
      };
  }
}

async function loadAllHoles(
  client: TurnurClient,
  matchId: string,
  seatIds: string[],
): Promise<
  | { ok: true; value: Map<string, [Card, Card]> }
  | { ok: false; error: 'holes_not_dealt' | 'invalid_view'; response?: Response }
> {
  const holesBySeat = new Map<string, [Card, Card]>();

  for (const seatId of seatIds) {
    let viewResult;
    try {
      viewResult = await client.match.view.get(matchId, seatId);
    } catch (error) {
      return { ok: false, error: 'invalid_view', response: mapTableTurnurError(error, 'seat') };
    }

    if (viewResult.view === null || viewResult.view === undefined) {
      return { ok: false, error: 'holes_not_dealt' };
    }

    const parsed = parseHoleView(viewResult.view);
    if (!parsed) {
      return { ok: false, error: 'invalid_view' };
    }
    holesBySeat.set(seatId, parsed.hole);
  }

  return { ok: true, value: holesBySeat };
}

function projectSeatTable(
  matchId: string,
  seatId: string,
  state: HandState,
  hole: [Card, Card] | null,
  legalActionsList?: LegalizedAction[],
): SeatTable {
  const table: SeatTable = {
    matchId,
    seats: state.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    currentSeat: state.currentSeatId,
    pot: state.pot,
    seatId,
    hole,
  };

  if (legalActionsList && legalActionsList.length > 0) {
    table.legalActions = legalActionsList;
  }

  return table;
}

export async function submitAction(
  input: SubmitActionInput,
  deps: SubmitActionDeps = {},
): Promise<
  | { ok: true; value: SeatTable }
  | { ok: false; error: SubmitActionError }
> {
  const gate = deps.requireSeatCapabilityFn ?? requireSeatCapability;
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const legalizeFn = deps.legalizeFn ?? legalize;
  const applyActionFn = deps.applyActionFn ?? applyAction;
  const legalActionsFn = deps.legalActionsFn ?? legalActions;

  try {
    gate({
      matchId: input.matchId,
      seatId: input.seatId,
      token: input.capabilityToken,
      attachedMatchId: input.attachedMatchId,
      ledger: input.ledger,
    });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'missing_capability';
    return { ok: false, error: { kind: 'capability', code } };
  }

  const action = parseActionBody(input.action);
  if (!action) {
    return {
      ok: false,
      error: {
        kind: 'illegal_action',
        response: Response.json({ error: 'illegal_action' }, { status: 400 }),
      },
    };
  }

  let client: TurnurClient;
  try {
    client = await getClient();
  } catch (error) {
    if (error instanceof TurnurAuthenticationError) {
      return {
        ok: false,
        error: { kind: 'turnur_unauthenticated', reason: error.reason },
      };
    }
    throw error;
  }

  let movesList;
  try {
    movesList = await client.match.moves.list(input.matchId);
  } catch (error) {
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  const items = movesList.items as MoveLogItem[];
  const handOpen = findLatestHandOpen(items);
  if (!handOpen) {
    return {
      ok: false,
      error: {
        kind: 'betting_not_open',
        response: Response.json({ error: 'betting_not_open' }, { status: 409 }),
      },
    };
  }

  const holes = await loadAllHoles(
    client,
    input.matchId,
    handOpen.seats.map((seat) => seat.seatId),
  );
  if (!holes.ok) {
    if (holes.error === 'holes_not_dealt') {
      return { ok: false, error: { kind: 'holes_not_dealt' } };
    }
    return {
      ok: false,
      error: {
        kind: 'invalid_view',
        response: holes.response ?? Response.json({ error: 'invalid_view' }, { status: 502 }),
      },
    };
  }

  const priorActions = actionsAfterHandOpen(items);
  const reconstructed = reconstructHand({
    handOpen,
    actions: priorActions,
    holesBySeat: holes.value,
  });
  if (!reconstructed.ok) {
    return {
      ok: false,
      error: {
        kind: 'reconstruct_failed',
        response: Response.json({ error: 'reconstruct_failed' }, { status: 502 }),
      },
    };
  }

  const legalized = legalizeFn(reconstructed.value, input.seatId, action);
  if (!legalized.ok) {
    const mapped = mapRulesReject(legalized.error.code);
    if (mapped) {
      return { ok: false, error: mapped };
    }
  }

  const nextStateResult = applyActionFn(reconstructed.value, input.seatId, action);
  if (!nextStateResult.ok) {
    const mapped = mapRulesReject(nextStateResult.error.code);
    if (mapped) {
      return { ok: false, error: mapped };
    }
  }

  const actionPayload = buildActionPayload(action);

  try {
    await client.match.move.create(input.matchId, {
      seatId: input.seatId,
      payload: actionPayload,
    });
  } catch (error) {
    if (isTurnur409(error)) {
      await client.match.moves.list(input.matchId);
      await client.match.turn.get(input.matchId);
      return {
        ok: false,
        error: {
          kind: 'illegal_turn',
          response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
        },
      };
    }
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  const nextState = nextStateResult.value;
  if (nextState.currentSeatId !== null) {
    try {
      await client.match.turn.set(input.matchId, nextState.currentSeatId);
    } catch (error) {
      if (isTurnur409(error)) {
        await client.match.moves.list(input.matchId);
        await client.match.turn.get(input.matchId);
        return {
          ok: false,
          error: {
            kind: 'illegal_turn',
            response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
          },
        };
      }
      return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
    }
  }

  const ownHole = holes.value.get(input.seatId) ?? null;
  const legal =
    nextState.phase === 'betting' && nextState.currentSeatId === input.seatId
      ? legalActionsFn(nextState, input.seatId)
      : undefined;

  return {
    ok: true,
    value: projectSeatTable(input.matchId, input.seatId, nextState, ownHole, legal),
  };
}
