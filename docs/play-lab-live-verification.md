# Play lab — live Turnur verification

Manual operator checklist for [#24](https://github.com/StacksOnTheRacks/riffle-poker/issues/24). Completing a hand with fake Turnur alone does **not** satisfy the ticket — this run must use a live Turnur deployment.

## Prerequisites

- Node.js **22+**
- Live Turnur credentials (`TURNUR_BASE_URL`, `TURNUR_SDK_KEY`) with game authentication working
- Riffle host API key (any non-empty value for local dev)
- Dependencies from #19–#23 merged on `main`

## Environment variables

Copy `.env.example` to `.env` and set:

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `TURNUR_BASE_URL` | Yes | `https://api.turnur.example` | Server-only; never exposed to browser |
| `TURNUR_SDK_KEY` | Yes | *(from Turnur)* | Server-only; never exposed to browser |
| `RIFFLE_HOST_API_KEY` | Yes | `change-me-host-key` | Server-only; host routes only |
| `RIFFLE_PUBLIC_ORIGIN` | Yes | `http://localhost:3000` | Must match the URL you open in the browser |
| `RIFFLE_LISTEN_PORT` | Yes | `3000` | Default `3000` |
| `RIFFLE_FRAME_ANCESTORS` | Yes | `'self'` | Keep default for lab |
| `RIFFLE_LAB_ENABLED` | Yes | `1` or `true` | **Must** be enabled; any other value rejects lab routes |

On startup, the server logs `[turnur] authenticated` with a `gameId` when Turnur auth succeeds. If you see `[turnur] authentication failed`, fix Turnur config before continuing.

## Start the runtime

```bash
npm install
npm run build
npm start
```

For development with auto-reload:

```bash
RIFFLE_LAB_ENABLED=1 npm run dev
```

Open the lab harness:

**http://localhost:3000/lab**

(Use the port from `RIFFLE_LISTEN_PORT` if different.)

## Operator checklist

Record `matchId` and completion path (fold-to-one or non-all-in showdown) for PR evidence.

### 1. Idle harness

- [ ] `/lab` loads without errors
- [ ] Harness shows **Start session** and two empty labeled slots: **Seat 1** / **Seat 2**
- [ ] No bootstrap tokens, capability tokens, SDK key, or host key visible in lab chrome

### 2. Start session

- [ ] Click **Start session**
- [ ] Harness briefly shows starting state, then session-ready / two-seats state
- [ ] Both iframes load Riffle-origin `/play` URLs with `#bt=` bootstrap fragments
- [ ] Each iframe shows table shell or loading (not embed-error)
- [ ] DevTools → each iframe `title` / accessible name matches **Seat 1** or **Seat 2**

### 3. Deal

- [ ] Click **Deal**
- [ ] Both iframes transition to hand-in-progress felt (hole cards visible to owning seat only)
- [ ] Public pot and stacks reflect posted blinds (SB 50 / BB 100 on 10 000 stacks)

### 4. Play to hand completion

Alternate actions between Seat 1 and Seat 2 until the hand completes by **fold-to-one** or **non-all-in showdown**.

Suggested fold-to-one path (fastest):

1. Act in the iframe whose turn indicator shows **Your turn · actionable**
2. Use **Fold** when facing a bet, or **Check** / **Call** to continue
3. Repeat until one seat folds and the other wins uncontested

For showdown instead of fold:

1. Check/call through streets until river
2. Confirm hand-complete / showdown surfaces in both iframes

Completion signals:

- [ ] Hand-complete surface visible in both iframes (or winner declared on fold)
- [ ] No iframe stuck on embed-error or perpetual loading
- [ ] Server public table reflects completed hand:  
  `curl -s "http://localhost:3000/v1/table?matchId=<matchId>"` shows terminal hand state

### 5. Turnur authority

Throughout the run, Turnur remains authority for:

- [ ] **Seats** — two lab seats created on Turnur at session start
- [ ] **Turns** — `currentSeat` advances only after valid actions
- [ ] **Hidden views** — each seat sees only its hole cards in-network (seat-scoped hidden views)
- [ ] **Move log** — actions recorded on Turnur (verify via Turnur match API or runtime move history if exposed)

Optional: capture Turnur match state snapshot at hand completion for PR evidence.

### 6. Iframe isolation

In DevTools, with both iframes loaded mid-hand:

- [ ] From Seat 1 iframe console, `parent.document` is cross-origin (blocked or empty for sensitive data)
- [ ] Seat 1 network responses do not contain Seat 2 hole cards
- [ ] Seat 1 cannot read Seat 2 capability token from DOM, `localStorage`, `sessionStorage`, or cookies
- [ ] Capability delivery uses targeted postMessage only (`lab-parent-origin` / same Riffle origin)

### 7. Security spot-check

Perform on **lab page**, **both iframe documents**, and **loaded JS bundles** (`lab.js`, `play.js`):

1. **View source** (lab page + each iframe) — search for:
   - `TURNUR_SDK_KEY`
   - `TURNUR_BASE_URL`
   - `RIFFLE_HOST_API_KEY`
   - Literal SDK key value

2. **Network tab** — filter responses and request headers from browser-initiated fetches:
   - [ ] No `Authorization: Bearer` with host key from browser
   - [ ] No Turnur SDK key in any response body or client-visible header
   - [ ] Seat-scoped requests use `X-Riffle-Seat-Capability` (expected); bootstrap uses cookie only

3. **Console** — no logged capability tokens or secrets during session start / deal / play

## CI regression (no live Turnur)

Automated tests use fake Turnur and must stay green without live network:

```bash
npm test
```

This does not replace the manual checklist above.

## PR evidence (optional)

When opening or validating the #24 PR, attach:

- `matchId` from the successful run
- Screenshot of hand-complete in both iframes, **or**
- Turnur API snapshot showing completed hand

Do not commit secrets, tokens, or screenshots containing capability values to the repo.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `403 lab_disabled` on session/deal | Set `RIFFLE_LAB_ENABLED=1` or `true` |
| `403 lab_forbidden` | Access `/lab` only via loopback (`localhost` / `127.0.0.1`) |
| `503` on session with Turnur errors | Check `TURNUR_BASE_URL` / `TURNUR_SDK_KEY`; confirm `[turnur] authenticated` in server logs |
| Iframe embed-error | Session mint failed or bootstrap redeem failed — check server logs |
| Deal button disabled | Complete **Start session** first; both iframes must load |
| No actions in iframe | Wrong seat's turn — switch to the other iframe |
