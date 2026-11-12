# Trialhour: free trial class booking

A web app where a parent books a free 1:1 coding trial for their child. The parent picks a time shown in their own time zone, the system assigns an available mentor in India, and both sides get a class link. It handles time zones and daylight saving time correctly, enforces the 2-classes-per-mentor-per-day cap under concurrent bookings, and treats "fully booked" as a normal state with clear reasons and alternatives.

Built for the Codeyoung Senior Full Stack Engineer assignment. The agreed specification is in [SPEC.md](SPEC.md); the project conventions used during development are in [CLAUDE.md](CLAUDE.md).

**Status:**
- **P0 (core) is complete:** slot generation, time-zone/DST handling, the booking transaction with capacity and concurrency guarantees, and the mobile-first booking and confirmation UI.
- **P1 is complete:**
  - nearest alternatives on every 409, chosen and confirmed in the form;
  - the duplicate-trial check;
  - enforced idempotency;
  - parent and mentor emails written in the booking transaction, with a demo outbox page;
  - `.ics` download.
- **P2** (mentor page, Playwright happy path) is listed under [What I'd do next](#out-of-scope-and-what-id-do-next).

| Booking (phone) | Unavailable slot reason | Slot just taken → alternatives |
|---|---|---|
| _screenshot placeholder_ | _screenshot placeholder_ | _screenshot placeholder_ |

| Confirmation | Outbox: parent and mentor emails side by side |
|---|---|
| _screenshot placeholder_ | _screenshot placeholder_ |

---

## Contents

1. [Quick start (Docker)](#quick-start-docker)
2. [Run locally without Docker for the app](#run-locally-postgres-in-docker-app-with-npm)
3. [Tests](#tests)
4. [Configuration](#configuration)
5. [Architecture](#architecture)
6. [Why Postgres](#why-postgres)
7. [Assumptions and trade-offs](#assumptions-and-trade-offs)
8. [Time zones and DST](#time-zones-and-dst)
9. [Mentor assignment](#mentor-assignment)
10. [Concurrency](#concurrency)
11. [API](#api)
12. [UX notes](#ux-notes)
13. [Out of scope, and what I'd do next](#out-of-scope-and-what-id-do-next)
14. [How I used AI](#how-i-used-ai)

---

## Quick start (Docker)

Requires Docker with Compose v2.

```sh
docker compose up --build
```

Open **http://localhost:5173**. That starts three containers:

| Service | Port on your machine | What it does |
|---|---|---|
| `db` | **5433** | Postgres 16. Published on 5433, not 5432, so it doesn't clash with a local Postgres. |
| `api` | 3001 | Runs migrations, **resets and reseeds the demo data**, then serves the API. |
| `web` | 5173 | Serves the production build of the React app; `/api` is proxied to `api`. |

> ⚠️ **Every start of the `api` container wipes all bookings and reseeds demo data.** That keeps the demo state predictable. It is a demo, not a deployment.

Ports can be changed with `DB_PORT`, `API_PORT` and `WEB_PORT`, e.g. `WEB_PORT=8080 docker compose up --build`.

**DST demo:** freeze the server clock just before a daylight-saving change and watch parent-facing times move:

```sh
NOW_OVERRIDE=2027-03-13T12:00:00Z docker compose up --build
```

Then pick New York and compare Sat 13 Mar with Sun 14 Mar: the same India-time shift starts at 3:00 PM (GMT-5) on Saturday and 4:00 PM (GMT-4) on Sunday.

**What the seed shows on first load** (relative to "now"). Every demo booking already has its two emails in the outbox at **http://localhost:5173/outbox**.
- Tomorrow's UK-evening shift is full because all three UK mentors are at their daily cap. In London time, Fri 3–7 PM shows "✕ Mentors full".
- Tomorrow's first US-East slot is booked by all three East-coast mentors, so it shows "✕ Booked".
- Slots in the next 4 hours show "✕ Too soon".

## Run locally (Postgres in Docker, app with npm)

Requires **Node.js 22.9 or newer**. The scripts use Node's built-in `--env-file-if-exists` flag instead of a `dotenv` dependency.

```sh
docker compose up -d db          # Postgres only, on localhost:5433
cp .env.example .env             # defaults work as-is
npm install
npm run db:setup                 # migrate + seed
npm run dev                      # API on :3001 and web on :5173 together
```

> ⚠️ **`npm run db:setup` (and `npm run db:seed`) wipes all bookings** and reseeds the demo data. Migrations alone are idempotent; the seed is a reset.

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:seed`, and `npm run test:unit -w @codeyoung/api` (API unit tests only, no database needed).

To view the UI at phone width: Chrome DevTools → device toolbar (⌘⇧M / Ctrl+Shift+M), e.g. iPhone SE (375 px).

## Tests

```sh
docker compose up -d db   # integration tests need Postgres on :5433
npm test                  # all workspaces
```

**291 tests**, all passing:

| Workspace | Tests | What they cover |
|---|---|---|
| `packages/shared` | 64 | Time formatting, zone validation, local day bounds (23h and 25h days) |
| `apps/api` unit | 110 | Pure domain logic: slots and shift dates, availability and reasons, booking window, both assignment strategies, alternatives, emails, `.ics`, request fingerprints, the seed planner, config, clock, the booking service (backstop, replay, duplicates, outbox) |
| `apps/api` integration | 64 | Real Postgres: migrations, seed, slots/booking/outbox/calendar APIs, duplicate trials, idempotency, **concurrency (X1, X2, X3, X5)**, lock timeouts |
| `apps/web` | 53 | Components and pages (date strip, slot grid, form with alternatives and duplicates, confirmation, outbox) plus pure helpers (phone, zones, days) |

- **Traceable to the spec:** test names carry the IDs from the test matrix in [SPEC.md §11](SPEC.md#11-test-matrix) (T1–T16 for DST and zones, C1–C11 for capacity, X1–X2 for concurrency).
- **Integration database:** integration tests use a separate `booking_test` database. It's rebuilt from the migrations once per run, and the test files run one at a time.
- **No mocked "now":** domain tests use an injected `FixedClock`, which is how the 2027 DST dates are tested today.

## Configuration

All variables are validated with zod at startup ([apps/api/src/config.ts](apps/api/src/config.ts)); see [.env.example](.env.example).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres connection string |
| `PORT` | `3001` | API port |
| `MIN_NOTICE_MINUTES` | `240` | Minimum notice before a class (see [trade-offs](#assumptions-and-trade-offs)) |
| `BOOKING_HORIZON_DAYS` | `14` | How far ahead parents can book |
| `MENTOR_DAILY_CAP` | `2` | Classes per mentor per shift |
| `ASSIGNMENT_STRATEGY` | `capacity-preserving` | Or `fair-load` (see [Mentor assignment](#mentor-assignment)) |
| `NOW_OVERRIDE` | (unset) | Development only: freeze the clock at an ISO instant with an offset. Refused when `NODE_ENV=production`. |

## Architecture

```
packages/shared   zod schemas + API types, time formatting, zone validation, day bounds (used by API and web)
apps/api          Express 5 + zod + pg (plain SQL)
apps/web          React 19 + Vite + React Router, CSS modules, no UI framework
```

### API layering

```
routes ──► services ──► domain (pure)
              │
              └──────► repositories (SQL) ──► Postgres
```

| Layer | Rules |
|---|---|
| [`routes/`](apps/api/src/routes) | HTTP only. Validate with zod, call one service method, return JSON. No business logic, no SQL. |
| [`services/`](apps/api/src/services) | Orchestration: open transactions, call repositories and domain functions. They receive `Clock`, `AssignmentStrategy`, repositories and policy through the constructor, and never import `pg`, `express` or `process.env`. |
| [`domain/`](apps/api/src/domain) | **Pure functions**: no I/O, no `Date.now()`, no env. Slot generation, shift dates, eligibility, reasons, strategies. Most tests live here. |
| [`repositories/`](apps/api/src/repositories) | Parameterised SQL only. The row locks (`FOR UPDATE`) live here, in plain sight. |
| [`server.ts`](apps/api/src/server.ts) | Composition root: the only place that reads the environment and wires real implementations. [`app.ts`](apps/api/src/app.ts) builds the Express app from injected dependencies, so tests can construct it with a fixed clock. |

Errors: the domain throws typed errors (`SlotUnavailableError`, `RequestValidationError`, …); one [error middleware](apps/api/src/middleware/errorHandler.ts) maps them to HTTP statuses and a single response envelope.

### Data model

All instants are `timestamptz` (UTC), and zones are stored as IANA names. See [001_init.sql](apps/api/src/db/migrations/001_init.sql).

- `mentors`: name and IANA time zone.
- `availability_windows`: recurring weekly windows in the **mentor's** zone (`weekday`, `start_local`, `duration_min`).
- `bookings`: `start_utc`, `end_utc`, the mentor's **`shift_date`**, parent and child details, the parent's IANA zone, and the class link.
  - `UNIQUE (mentor_id, start_utc) WHERE status = 'confirmed'` is the double-booking backstop.
  - `(mentor_id, shift_date)` is indexed for the cap count.
- `idempotency_keys`: a key, the request's fingerprint and the stored response. Written in the same transaction as the booking, so only successful bookings keep their key.
- `outbox_messages`: the parent and mentor emails for each booking. Written in the same transaction as the booking, so the emails exist if and only if the booking does.

Slots are computed, not stored. Seed data lives in [seedData.ts](apps/api/src/db/seedData.ts): 10 mentors with real names, each mapped to the M-numbers used in the spec.

## Why Postgres

I usually work with MERN, but the hard part of this problem is a **transaction across several rows under concurrency**:
- count a mentor's bookings in a shift;
- check whether they're free at that time;
- insert the booking;
- all atomically, while other parents do the same.

Postgres provides exactly the needed tools:
- row locks (`SELECT … FOR UPDATE`);
- partial unique indexes (`UNIQUE … WHERE status = 'confirmed'`);
- `lock_timeout` / `statement_timeout` per transaction;
- `timestamptz`.

MongoDB can do multi-document transactions, but it needs a replica set even locally. It has no `FOR UPDATE`, so the cap race would need a counter document or optimistic retries, and it has no partial unique index on this kind of condition. The data is small, relational and fixed in shape, which is what a relational database is for.

## Assumptions and trade-offs

| # | Decision | Why / trade-off |
|---|---|---|
| A1 | **60-minute classes, back-to-back allowed.** | Codeyoung's booking page says 1 hour. No buffer between classes. |
| A2 | **Windows are weekly, in the mentor's own IANA zone**, and may cross local midnight. All seed mentors are `Asia/Kolkata`. | Nothing in the code assumes India. A day off is simply a missing weekday row (all seed mentors work every day). |
| A3 | **The daily cap counts per shift date**: the mentor-local date the window *started* on. | A UK-evening shift (20:30 → 01:30 India time) crosses midnight. Strict calendar days would let a mentor do 4 classes in one sitting and block the next evening. |
| A4 | **Slots start on the UTC hour** (= :30 India time). | US, UK, Canadian and most Australian parents see whole hours. Adelaide, Darwin and Newfoundland see :30. With all slots on one grid, "busy at this slot" is a simple equality check. Seed validation checks a full year of real dates. |
| A5 | **Windows stay fixed in India time.** | Mentor schedules don't follow US/UK DST, so on transition dates a slot moves by an hour *for parents*. That's realistic and is what the DST tests verify. |
| A6 | **Bookable from 4 hours to 14 days ahead** (configurable). | The trial is a marketing funnel: a parent should be able to book while they're interested. The cost is that mentors sometimes get under 4 hours' notice; they see bookings immediately. 12 hours would be the cautious choice. |
| A7 | **A parent is identified by email + child name** (trimmed, lower-cased, spaces collapsed). | A parent with two kids can book one trial for each. A second *upcoming* trial for the same child is refused with a link to the first. |
| A8 | **"Now" is injected** everywhere (`Clock`). | Tests and the DST demo run on fixed instants. The server clock is authoritative; the client's clock is never trusted. |
| A9 | **No auth.** Booking pages use unguessable UUIDs. | Fine for a demo; listed under next steps. |
| — | **No temporary slot holds (no Redis).** | At ~20 bookings/day, a parent losing a slot while filling in the form is rare. It's handled with a friendly 409 and a refreshed list rather than hold/expiry machinery. |
| — | **No ORM; one Dockerfile; `vite preview` serves the web build.** | Fewer moving parts. The locking SQL is visible, and there's no nginx config to maintain. |
| — | **A start time already in the past is "too soon" (409), not invalid (422).** | It almost always means the parent left the form open; alternatives help more than a validation error. |
| — | **Choosing an alternative takes two taps: select, then confirm.** | Parents can't cancel or reschedule, so a mis-tap (tomorrow instead of today) would leave them stuck. |
| — | **A failed attempt doesn't use up its Idempotency-Key.** | The key's row rolls back with the failed transaction, so a retry after a 409 or a timeout runs fresh. Only a successful booking's response is replayed. Keys don't expire yet (see next steps). |
| — | **Emails are a mock outbox.** | Rows in `outbox_messages`, shown at `/outbox`. Sending them for real would be a worker reading this table (the transactional outbox pattern). |

## Time zones and DST

**Rules** (enforced in code and in [CLAUDE.md](CLAUDE.md)):
- **Storage:** instants are stored in UTC (`timestamptz`). Zones are stored as IANA names, never offsets or abbreviations.
- **Conversion:** times are converted only at the edges: formatting for display, and turning a parent-local date into UTC bounds.
- **One formatter:** every displayed time goes through [format.ts](packages/shared/src/time/format.ts). It shows **date + time + zone + offset**, with the offset computed for that instant: `Thu 12 Nov, 4:00 PM New York time (GMT-5)`, `Fri 13 Nov, 2:30 AM India time (GMT+5:30)`.
- **No abbreviations, ever.** "IST" is both India and Irish Standard Time, "BST" is British Summer Time and Bangladesh, "CST" is US Central and China. Zones get a city name instead ("Indianapolis time" handles Indiana; "Phoenix time" handles Arizona). A test checks that no output across 15 zones contains an abbreviation.
- **Day boundaries come from local midnight** in the zone, never `+24h`, so DST days are 23 or 25 hours long.

**Two findings worth knowing:**

1. **`EST` silently becomes Panama.** Luxon and ICU accept `"EST"`, `"IST"`, `"GMT"` and `"EST5EDT"` as valid zones. ICU resolves `"EST"` to **America/Panama**, which has no DST, so a New York parent stored as "EST" would be an hour wrong all summer. `"IST"` resolves to India, so an Irish parent would be wrong too. [`isValidZone`](packages/shared/src/time/zones.ts) therefore only accepts names shaped like `Area/City` (or exactly `UTC`) that the runtime also knows. I couldn't validate against ICU's canonical name, because ICU canonicalises `Asia/Kolkata` to the old `Asia/Calcutta`. Browser-reported aliases (`Etc/UTC`, `Etc/GMT`, `Asia/Calcutta`, `America/Buenos_Aires`) are accepted. `Etc/Unknown` is rejected, which sends the parent to the manual zone picker.
2. **`pg` turns `date` columns into local-midnight JS Dates.** By default the `pg` driver parses a Postgres `date` like `2027-03-27` into a JS `Date` at **local** midnight, which shifts by a day when the server runs outside UTC. That would silently move a booking's shift date, and with it the daily cap. [pool.ts](apps/api/src/db/pool.ts) keeps `date` columns as plain `"YYYY-MM-DD"` strings and forces the session to UTC. An integration test asserts the round trip.

**DST dates tested** (all with a fixed clock):

| Event | What the tests check |
|---|---|
| US spring forward, **Sun 14 Mar 2027** | New York slots move from 3:00 PM (GMT-5) to 4:00 PM (GMT-4) for the same India shift. The New York day is 23h. 2:xx AM never appears. |
| US and UK out of step, 14–27 Mar and 31 Oct–6 Nov 2027 | London and New York are 4h apart, not 5h |
| UK spring forward, **Sun 28 Mar 2027** | London 3:00 PM (GMT+0) → 4:00 PM (GMT+1) |
| UK fall back, **Sun 31 Oct 2027** | London 4:00 PM (GMT+1) → 3:00 PM (GMT+0) |
| US fall back, **Sun 7 Nov 2027** | New York and Los Angeles move an hour earlier. The day is 25h. The two 1:30 AMs are told apart by offset. |
| Sydney DST ends **4 Apr 2027** / starts **3 Oct 2027** | 4:00 PM (GMT+11) ↔ 3:00 PM (GMT+10); Brisbane (no DST) stays at GMT+10 |
| Arizona | Phoenix stays at GMT-7 while Los Angeles changes |

## Mentor assignment

The booking service depends only on an [`AssignmentStrategy`](apps/api/src/domain/assignment/strategy.ts) interface: `rank(slot, eligibleMentors, snapshot) → ordered mentors`. Strategies are pure and deterministic, and selected with `ASSIGNMENT_STRATEGY`.

- **`fair-load`:** fewest bookings in the shift first, then mentor id.
- **`capacity-preserving` (default):** use up the mentor whose remaining availability is **least scarce**, so mentors who cover rare hours stay free.

  `scarcity(m) = Σ 1/k(s)` over m's other bookable slots s in the same shift, where k(s) = number of mentors eligible at s.

  Ties go to fewest bookings, then mentor id.

**Why it matters (the spec example, tested through the real availability code):**
- **Setup:** the three US-East mentors (01:30–06:30 India) each have one booking. The two US-West mentors (04:30–09:30) have none. A parent books 04:30 India time (6 PM New York / 3 PM Los Angeles in winter).
- **Fair-load** picks a West mentor because they have fewer bookings. That uses up one of only four bookings available for the 06:30–08:30 India-time slots, Los Angeles' after-school hours, which only those two mentors cover.
- **Capacity-preserving** scores East mentor Arjun at 0.87 and West mentor Sneha at 1.70, so it picks Arjun and keeps the rare West-coast capacity free.

It's a greedy heuristic, not an optimum. True optimal assignment depends on future demand, which we don't know.

## Concurrency

### The booking transaction

[bookingService.ts](apps/api/src/services/bookingService.ts) runs these steps in one transaction:

1. Set `lock_timeout = 3s` and `statement_timeout = 5s` for this transaction only (`set_config(…, true)`).
2. **Claim the `Idempotency-Key`** by inserting it with the request's fingerprint. A concurrent request with the same key waits on that row, then replays the first response, or gets 422 if the body differs.
3. **Lock this parent + child** (`pg_advisory_xact_lock`), then refuse a second upcoming trial for the same child.
4. Run the cheap checks: on the hour grid, inside a window, not too soon, not beyond the horizon.
5. `SELECT id FROM mentors WHERE id = ANY($1) ORDER BY id FOR UPDATE` locks **every mentor who covers the slot, in id order**.
6. Only then re-read bookings: anything committed before we got the lock is visible.
7. Re-check eligibility (free at that time, under the cap for that shift), let the strategy rank, insert the booking, **write both emails to the outbox**, and store the response against the key.

Locks are always taken in the same order (key, then parent/child, then mentors in id order), so concurrent bookings can't deadlock.

Because the strategy runs on locked data, "try the next mentor" needs no retry loop: a mentor taken a moment ago is simply no longer eligible. The client gets a 409 only when *nobody* covering that time is free.

The partial unique index on `(mentor_id, start_utc)` is a **backstop**. If it ever fires, the repository raises `MentorSlotTakenError` and the parent gets a normal 409, never a 500. If a lock or statement timeout fires, the client gets **503 `TRY_AGAIN`** with `Retry-After: 1` instead of hanging.

The unique index alone is not enough. Two parents booking **different** times with the same mentor (who already has 1 booking that shift) can both read "1" and both insert, giving 3. The unique index doesn't help because the times differ. Only the row lock serialises them.

### Proving the requests really run in parallel

[concurrency.test.ts](apps/api/test/integration/concurrency.test.ts):
- **Separate connections:** every request is a real HTTP `fetch` to a real server whose Postgres pool has **more connections than requests** (30 for 20), so each booking transaction gets its own session.
- **The gate:** a separate connection takes `LOCK TABLE bookings IN ACCESS EXCLUSIVE MODE`, which every booking transaction has to wait on. The test fires all requests, then polls `pg_stat_activity` until **every request's transaction is blocked inside Postgres at the same moment**, counting distinct backend process ids. Only then does it release the gate.
- **Result:** the count reached exactly **20 of 20** for X1 and **6 of 6** for X2, so all transactions were in flight together.
- **Without the gate:** each scenario also runs 20 times ungated.

| Test | Scenario | Result with the lock |
|---|---|---|
| X1 | 20 parents, one slot, 3 eligible mentors | Always exactly 3 × 201 on 3 different mentors, 17 × 409 `FULLY_BOOKED` |
| X2 | 6 requests for 3 different slots that only one mentor (0 bookings) covers | Always exactly 2 × 201 and 4 × 409; the shift never exceeds 2 |
| X3 | The same request twice with the same `Idempotency-Key` (double tap) | One booking; one 201 and one 200 replay with an identical body |
| X5 | The same child booked into two different slots at once | One 201 and one 409 `DUPLICATE_TRIAL`; the child has exactly one trial |

The gate count reached **2 of 2** for X3 and X5 as well.

### The experiment: removing `FOR UPDATE`

To show the lock is what makes this work, I temporarily removed `FOR UPDATE` from the lock query (one line), reran the concurrency tests, then restored it from a backup (checked byte for byte; it was never committed).

| Test | Without `FOR UPDATE` |
|---|---|
| X2 (cap race) | 3 succeeded instead of 2. The database then showed **"Solo Mentor" with 3 bookings in the 27 Mar shift (20:30, 21:30, 22:30 India time) against a cap of 2**. The unique index can't catch this: the 3 bookings are at different times. |
| X1 (same slot) | Only 1–2 succeeded instead of 3. Every transaction read "nobody booked yet", the deterministic strategy chose the same mentor for all of them, and the unique index rejected the duplicates. |
| Both | **Zero 500s.** Every failure was a clean 409, which confirmed the backstop mapping under real contention. |

With the lock restored, the integration suite passed 48 of 48 on three consecutive runs.

### The same experiment for the duplicate-trial lock

I ran the same experiment on the parent/child advisory lock: it was temporarily replaced with a no-op query, then restored from a backup and checked byte for byte.

| Test | With the advisory lock | Without it |
|---|---|---|
| X5 gated | One trial, the other request gets `DUPLICATE_TRIAL` | `[201, 201]`: both passed the "no upcoming trial" check |
| X5 ungated ×20 | Always one trial | Failed on the first run |
| Database afterwards | — | **Maya with 2 upcoming trials (15:00 and 17:00)** |

### The cost of alternatives

Alternatives are computed on every 409, so they need to be cheap.
- **First version:** an ungated X1 run (20 bursts of 20 requests) went from 2.2 s to **12.9 s**. Profiling showed `nearestAlternatives` re-validating the zone about 500 times per call (18.6 ms).
- **Fix:** validate once, and scan the requested day plus the next before falling back to the full 14 days. That brought it to **1.1 ms** and the run back to 4.4 s.
- **What's left** is the extra work each booking now does (key claim, parent lock, duplicate check), about 5 ms per request.

## API

Base path `/api`. All instants are UTC ISO-8601 with `Z`; the client formats them. Every error uses one envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request is invalid", "details": [{ "path": "tz", "message": "Must be an IANA time zone such as America/New_York" }] } }
```

### `GET /api/slots?tz=&from=&to=`

Slots grouped by the parent's local date. `tz` is required (IANA). `from` and `to` are optional `YYYY-MM-DD` dates in `tz`; the default is today through today + 14 days, and the maximum is 31 days. Every date in the range is listed, even with no slots. Only times inside at least one mentor's window are returned. Past times are left out.

```json
{
  "timezone": "Europe/London",
  "days": [
    {
      "date": "2026-11-13",
      "slots": [
        { "startUtc": "2026-11-13T05:00:00Z", "endUtc": "2026-11-13T06:00:00Z", "available": true },
        { "startUtc": "2026-11-13T15:00:00Z", "endUtc": "2026-11-13T16:00:00Z", "available": false, "reason": "DAILY_LIMIT_REACHED" }
      ]
    }
  ]
}
```

`reason` (only when `available` is false), in order of precedence: `TOO_SOON` → `DAILY_LIMIT_REACHED` (every covering mentor at the cap) → `FULLY_BOOKED`.

### `POST /api/bookings`

```json
{
  "startUtc": "2026-11-13T21:00:00Z",
  "parentTimezone": "America/New_York",
  "parentName": "Ashley Johnson",
  "parentEmail": "ashley@example.com",
  "phone": "+12125550142",
  "childName": "Mason",
  "childGrade": 5
}
```

Header **`Idempotency-Key: <uuid>`** is required. `phone` is optional and must be E.164. The UI builds it from a country-code picker plus whatever the parent types, so "07700 900123" with +44 is sent as `+447700900123`. `childGrade` is 1–12.

| Status | Code | Body |
|---|---|---|
| **201** | — | The booking (below). Both confirmation emails are written in the same transaction. |
| **200** | — | Replay: same key, same body as an earlier success. Identical booking, header `Idempotent-Replayed: true`, nothing new written. |
| **409** | `SLOT_UNAVAILABLE` | Envelope with `details.reason`, plus up to 5 `alternatives` |
| **409** | `DUPLICATE_TRIAL` | Envelope plus `existingBooking` (this child's upcoming trial) |
| **422** | `VALIDATION_ERROR` | Envelope with per-field `details` (bad zone, off the hour grid, no mentor works then, beyond the horizon, bad email or grade or phone, malformed key) |
| **422** | `IDEMPOTENCY_KEY_REUSED` | The key was already used for a different body |
| **400** | `IDEMPOTENCY_KEY_MISSING` | No `Idempotency-Key` header |
| **400** | `INVALID_JSON` | Malformed body |
| **503** | `TRY_AGAIN` | A lock or statement timeout fired; `Retry-After: 1` |

**201 body** (also returned by `GET /api/bookings/:id`):

```json
{
  "id": "d9977ba6-89a6-4d29-bfa1-1be4684334e5",
  "startUtc": "2026-11-13T21:00:00Z",
  "endUtc": "2026-11-13T22:00:00Z",
  "parentTimezone": "America/New_York",
  "parent": { "name": "Ashley Johnson", "email": "ashley@example.com" },
  "child": { "name": "Mason", "grade": 5 },
  "mentor": { "id": "00000000-0000-4000-8000-000000000004", "name": "Arjun Sharma", "timezone": "Asia/Kolkata" },
  "classLink": "https://class.example.com/trial/d9977ba6-89a6-4d29-bfa1-1be4684334e5",
  "icsUrl": "/api/bookings/d9977ba6-89a6-4d29-bfa1-1be4684334e5/calendar.ics"
}
```

**409 body shape:** the standard error envelope, with the reason in `error.details` and the alternatives at the top level:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "Our mentors have reached their class limit for that day.",
    "details": { "reason": "DAILY_LIMIT_REACHED" }
  },
  "alternatives": [
    { "startUtc": "2026-11-14T03:00:00Z", "endUtc": "2026-11-14T04:00:00Z" },
    { "startUtc": "2026-11-14T02:00:00Z", "endUtc": "2026-11-14T03:00:00Z" },
    { "startUtc": "2026-11-14T08:00:00Z", "endUtc": "2026-11-14T09:00:00Z" },
    { "startUtc": "2026-11-14T01:00:00Z", "endUtc": "2026-11-14T02:00:00Z" },
    { "startUtc": "2026-11-14T09:00:00Z", "endUtc": "2026-11-14T10:00:00Z" }
  ]
}
```

`alternatives` is always present (possibly empty). It holds up to 5 open slots: the same **parent-local** day first, closest in time (the earlier wins a tie), then the following days in order. Earlier days are never offered. They're computed after the failed transaction rolls back, so they already exclude the booking that just won.

**409 `DUPLICATE_TRIAL` body:**

```json
{
  "error": { "code": "DUPLICATE_TRIAL", "message": "Mason already has a trial class booked." },
  "existingBooking": {
    "id": "37448bc6-eb12-4be0-976b-22cdd1d34017",
    "startUtc": "2026-11-12T23:00:00Z",
    "endUtc": "2026-11-13T00:00:00Z",
    "childName": "Mason"
  }
}
```

### Other endpoints

| Endpoint | Response |
|---|---|
| `GET /api/bookings/:id` | 200 booking · 404 `NOT_FOUND` · 422 if `id` isn't a UUID |
| `GET /api/bookings/:id/calendar.ics` | 200 `text/calendar` attachment (`trial-class.ics`): UTC times, the class link, a 15-minute reminder · 404 |
| `GET /api/outbox?bookingId=&limit=` | 200 `{ entries: [...] }`, newest booking first (default 50, max 100). Each entry has `bookingId`, `startUtc`, `childName`, `mentorName`, `parentTimezone`, `mentorTimezone`, `sentAt`, and a `parent` and a `mentor` email (`to`, `subject`, `body`). |
| `GET /api/health` | 200 `{ "status": "ok" }` · 503 if the database is unreachable |
| Any unknown route | 404 `NOT_FOUND` envelope |

## UX notes

- **Mobile-first.** Most parents book from a phone. The flow is one page: zone bar → date strip → times → form, with a "Continue with 4:00 PM" bar pinned to the bottom of the screen until the form is in view.
- **Full is a normal state, so it's designed for.**
  - Day chips say "3 open", "Full", "Closed" or "No classes" in words, never colour alone.
  - Unavailable times always show a short label ("Booked", "Too soon", "Mentors full"). Tapping one opens the full reason inline with a "Next open time" button; nothing depends on hover.
  - Screen readers get the reason through `aria-describedby`.
- **Zone:** detected from the browser and changeable. If detection fails, the parent is asked before any times are shown.
- **Phone:** the country code defaults from the zone (London → +44, New York → +1), so local formats are accepted.
- **Slot taken while filling the form:**
  - the form stays and keeps everything typed;
  - a panel explains what happened and lists the nearest times;
  - choosing one selects it, then "Book Sat 14 Nov, 4:00 PM London time (GMT+0)" confirms it.
- **Same child booked twice:** "Oliver already has a trial on …" with a link to that booking, and a hint to change the name if it's a sibling.
- **Confirmation:**
  - shows the parent's time, the mentor's name and a copyable class link. It deliberately doesn't show the mentor's India time ("2:30 AM for your mentor" only worries parents);
  - "Add to calendar (.ics)" and "We've emailed the details to …";
  - a link straight to that booking's two emails in the outbox;
  - device guidance: a laptop or desktop with a camera and microphone, Chrome recommended;
  - "Book a class for another child" keeps the parent's details.
- **Outbox (`/outbox`, also linked in the header):** shows how the brief's "the mentor receives the same information in their local time" works. Each booking shows its two emails side by side, each headed by the class time in that reader's zone; the mentor's also shows the parent's time.
- **Accessibility:** real buttons and labels, a visible focus ring, 44 px tap targets, WCAG AA contrast, an error summary that links to fields, and reduced-motion support.

## Out of scope, and what I'd do next

**Out of scope by design:** authentication, real email delivery (emails go to a mock outbox), payments, rescheduling and cancellation UI, an admin UI, real video, mentor holidays and one-off exceptions, waitlists, i18n.

**Next, in priority order:**
1. **P2:** mentor page (their bookings in India time, plus the parent's time), a Playwright happy path, dark mode, and code-splitting the bundle (about 136 kB gzipped).
2. **Before real traffic:**
   - an email worker that sends `outbox_messages` and marks them sent;
   - auth for mentor and admin views;
   - rate limiting on `POST /api/bookings`;
   - structured logging and metrics (409 rate, lock waits);
   - a scheduled job to expire idempotency keys (e.g. after 24 hours);
   - mentor holidays and exceptions;
   - an "effective from" date on windows, so schedule changes don't rewrite history.
3. **At larger scale:** short-lived slot holds while the form is open, and assignment that considers forecast demand per hour instead of a greedy score.

## How I used AI

I built this with Claude Code, following a spec-first, slice-by-slice workflow. The full transcript is in [TRANSCRIPT.md](TRANSCRIPT.md).

1. **Research and decisions first.**
   - I studied Codeyoung's real trial flow and Calendly's model, and wrote down my decisions before any code.
   - I asked the AI to challenge them. That changed things: the cap became **per shift date** instead of per calendar day, the concurrency design gained the **cap race** (which the unique index alone misses), and the assignment strategy became **capacity-preserving**.
2. **A written spec.** [SPEC.md](SPEC.md) covers requirements, data model, API contract, error states and a test matrix with expected values for real 2027 DST dates. I checked those values by hand before any code was written.
3. **Conventions.** [CLAUDE.md](CLAUDE.md) pinned down the rules:
   - layering, with a pure domain;
   - UTC + IANA only, no abbreviations;
   - injected clock;
   - tests for every domain function;
   - no new dependencies without asking;
   - never change a test's expected value to make it pass;
   - small commits.
4. **One slice at a time.** After each slice the AI stopped and reported what it built, any decision not in the spec, and the test output. I reviewed before saying "continue". Several real issues surfaced this way: EST → Panama, the `pg` date parsing, integration test files secretly running in parallel, and a screen-reader naming bug.
5. **Proof, not just green tests.** For the core booking transaction I asked for evidence: the gated test showing all sessions in flight at once, and experiments that remove `FOR UPDATE` (the cap breaks) and the advisory lock (a child gets two trials). When adding alternatives made the race tests 6× slower, the slowdown was profiled and fixed rather than accepted.
6. **Review in the browser.** I checked the UI myself at phone width and fed back concrete fixes:
   - remove the mentor's India time from the parent page;
   - make alternatives select-then-confirm instead of booking on one tap, since bookings can't be cancelled;
   - device guidance matching Codeyoung's own;
   - select chevrons, a required grade, autocomplete attributes.
