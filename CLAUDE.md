# CLAUDE.md

A trial-class booking app for Codeyoung. **SPEC.md is the source of truth.** If code and spec disagree, stop and ask; don't silently change either. Build in the order given in SPEC.md §12 (P0 → P1 → P2).

## Stack

TypeScript (strict), npm workspaces: `apps/api` (Express 5 + zod + pg), `apps/web` (React + Vite), `packages/shared` (zod schemas, API types, time formatting). Postgres 16 with plain SQL, no ORM. Luxon for time. Vitest for tests.

## Commands

```
docker compose up --build        # full stack (db + migrate/seed + api :3001 + web :5173)
docker compose up -d db          # Postgres only
npm run db:setup                 # migrate + seed
npm run dev                      # api + web
npm test                         # all tests (needs db for integration)
npm run typecheck
```

## Layering (apps/api)

`routes → services → domain`, and `services → repositories`. Dependencies only point that way.

- **routes/**: HTTP only. Parse and validate with zod, call one service method, map the result or domain error to a status code. No business logic and no SQL.
- **services/**: orchestration. Open transactions, call repositories, call domain functions. Dependencies (`Clock`, `AssignmentStrategy`, repositories, config) arrive through constructor arguments; services never import `pg`, `express` or `process.env`.
- **domain/**: **pure.** No I/O, no `Date.now()`, no `new Date()` without arguments, no DB, no env, no logging. Inputs in, values out. Errors are typed domain errors, not HTTP errors.
- **repositories/**: SQL only, parameterised (`$1`), no string-built SQL. Functions that run inside a transaction take a `PoolClient`. Locking (`FOR UPDATE`, advisory locks) lives here and stays readable.
- **Composition root** (`server.ts`) is the only place that wires real implementations together. `app.ts` builds the Express app from injected dependencies so tests can construct it.

The web app calls the API only through `src/api/client.ts`. Components never call `fetch` directly.

## Time rules (non-negotiable)

- Store instants as `timestamptz` in UTC. Pass them around as UTC ISO strings or Luxon `DateTime` in UTC.
- Store zones as IANA names (`America/New_York`). Never store fixed offsets, never use abbreviations (`EST`, `IST`, `BST`, `CST`) in data, code or UI.
- Convert to local time only at the edges: formatting for display/outbox, and parsing a parent-local date into UTC bounds.
- Every displayed time goes through `packages/shared/src/time/format.ts`. The format is `Thu 12 Nov, 4:00 PM New York time (GMT-5)`, with the offset computed per instant. The only exception is the slot-grid buttons (SPEC.md §7).
- Local days are bounded by local midnight in the zone (`startOf('day')`), never `+24h`.
- **Inject `Clock` everywhere.** Nothing outside `clock.ts` reads the system time. Tests use `FixedClock`.

## UI (apps/web)

- **Mobile-first.** Many parents book on a phone, so design for narrow screens first and widen from there. Nothing important may depend on hover. A greyed-out slot's reason must be visible inline or appear on tap, never only in a tooltip.
- **Every screen that loads data has loading, empty and error states.** An error state says what went wrong and offers a retry.
- **Accessible by default:**
  - real `<button>`s and `<a>`s, never clickable `<div>`s
  - every input has a `<label>`
  - focus is always visible
  - text and controls meet WCAG AA contrast
  - unavailable state is never shown by colour alone; use text or an icon and `aria-disabled` plus the reason

## Testing

- Every exported domain and shared/time function has unit tests, co-located as `*.test.ts`.
- Spec test IDs (T1, C3, X2, …) appear in the test names so the matrix in SPEC.md can be traced.
- Concurrency tests (X*) run against real Postgres, never mocks.
- Bug fix = failing test first.
- **Never change a test's expected value just to make it pass without asking first.** If a spec expectation looks wrong, stop and explain why. The spec gets corrected first; the test follows.

## Workflow

Work one slice at a time (SPEC.md §12). After each slice, **stop** and report:
1. what was built
2. any decision made that isn't in the spec
3. the test and typecheck output

Then wait for "continue".

## Dependencies

The full allowed list is in SPEC.md §10. **Do not add any dependency without asking first**, including dev dependencies and type packages beyond that list.

## Commits

Small and focused: one slice or one concern per commit, with tests in the same commit as the code. Imperative subject ≤ 72 chars (e.g. `Add shift-date slot generation with DST tests`). Run `npm run typecheck && npm test` before committing.

## Style

- Named exports, no default exports (except where Vite/React requires them).
- No `any`. Use `unknown` + zod at boundaries.
- Errors: domain throws typed errors; one Express error middleware maps them to the `{ error: { code, message, details? } }` envelope.
- Keep functions small and names explicit (`shiftDateFor`, `eligibleMentorsAt`). Add a comment only when the *why* isn't obvious.
