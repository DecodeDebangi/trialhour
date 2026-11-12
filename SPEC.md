# Trial Class Booking — Spec

Status: **draft for review**. No code until this is approved.

A parent picks a time for their child's free 1:1 trial class, shown in the parent's own time zone. The system assigns an eligible mentor (mentors work in India), confirms with a dummy class link, and sends both sides the details in their own local time.

---

## 1. Requirements

| # | Requirement | Source |
|---|---|---|
| R1 | Slots are shown in the parent's time zone. It is detected from the browser and the parent can change it. | Brief §3, §4 |
| R2 | Slots last 60 min and are generated from each mentor's recurring availability windows. | Decision |
| R3 | When a parent books, the system assigns an eligible mentor using a swappable strategy (default: capacity-preserving, see §6). | Brief §3 |
| R4 | A mentor takes at most **2 classes per shift date** (see §3, A3). | Brief §2, decision |
| R5 | DST is handled with IANA zone rules. No fixed offsets are stored anywhere. | Brief §3 |
| R6 | Every time shown includes the date and an unambiguous zone label (§7). | Brief §6, decision |
| R7 | Concurrent bookings never double-book a mentor or push a mentor past the cap (§5). | Brief §6 |
| R8 | Unavailable slots appear greyed out with a reason. A failed booking offers up to 5 alternatives (§8). | Brief §3, §4 |
| R9 | Confirmation shows the parent's local time, the mentor's name and the class link. The mentor gets the same details in India time. Both are delivered through a mock outbox, with an .ics download. | Brief §4 |
| R10 | Booking requests are idempotent. A second upcoming trial for the same email + child is blocked. | Decision |

## 2. Out of scope

Auth, real email (a mock outbox page replaces it), payments, rescheduling and cancellation UI, admin UI, real video, mentor holidays and one-off exceptions, waitlists, i18n.

## 3. Assumptions

- **A1. Trial length.** 60 min, back to back allowed (no buffer). Codeyoung's booking page says 1 hour.
- **A2. Windows.** Windows recur weekly and are stored in the mentor's own IANA zone as `(weekday, start_local, duration)`. A window may run past local midnight. Every mentor is seeded as `Asia/Kolkata`, but nothing in the code assumes India.
- **A3. Shift date.** A slot's **shift date** is the mentor-local date on which its window *starts*. The cap counts confirmed bookings per `(mentor, shift_date)`. Example: a UK-evening shift from 20:30 to 01:30 IST is a single cap bucket, even though it crosses midnight.
- **A4. Slot grid.** Slot starts fall on **:00 UTC**, which is :30 India time. All US, UK and Canadian zones (except Newfoundland) and most Australian zones therefore see whole hours. Adelaide, Darwin and Newfoundland see :30, which we accept. Seed validation rejects any window that is off the grid or overlaps another window of the same mentor. With the grid fixed, "mentor busy at slot" reduces to an equality check on `start_utc`.
- **A5. Windows are fixed in India time.** Mentor schedules don't follow US/UK DST, so on transition dates a slot moves by an hour *for parents*. This is the intended behaviour and the main thing the DST tests check.
- **A6. Booking window.** Bookable means `now + MIN_NOTICE ≤ start ≤ now + 14 days`. `MIN_NOTICE` defaults to **4h**. The trial is a marketing funnel, so parents should be able to book while they're still interested. The cost is that mentors may get under 4h notice. They see new bookings immediately on the mentor page, and the value is configurable (12h is the cautious alternative).
- **A7. Parent identity.** A parent is identified by the normalised `email + child name` (trimmed, lower-cased, whitespace collapsed). One email can book one upcoming trial per child. "Upcoming" means `start_utc > now`.
- **A8. Clock.** "Now" comes from an injected `Clock`. The server clock is authoritative and the client clock is never trusted. In development, `NOW_OVERRIDE` freezes the clock for DST demos; it is refused when `NODE_ENV=production`.
- **A9. Access without auth.** Booking pages are addressed by an unguessable UUID. The mentor page and the outbox are open. This is documented as a demo-only risk.

## 4. Seed data

10 mentors, all `Asia/Kolkata`, windows every day unless noted. The parent-side times show both sides of each DST change.

| Mentors | Shift (India time) | Slot starts (IST) | Parent view, winter → summer |
|---|---|---|---|
| M1–M3 | 20:30 → 01:30 (+1 day) | 20:30 … 00:30 (5) | London 3–7 PM GMT → 4–8 PM BST. Dublin is the same. |
| M4–M6 | 01:30 → 06:30 | 01:30 … 05:30 (5) | New York 3–7 PM EST → 4–8 PM EDT. Chicago is one hour earlier. |
| M7–M8 | 04:30 → 09:30 | 04:30 … 08:30 (5) | Los Angeles 3–7 PM PST → 4–8 PM PDT. Overlaps the late New York slots. |
| M9 | 10:30 → 14:30 | 10:30 … 13:30 (4) | Sydney 3–6 PM AEST ↔ 4–7 PM AEDT. Brisbane is 3–6 PM all year. |
| M10 | Mon–Fri 10:30 → 14:30; Sat–Sun 13:30 → 17:30 | 4 + 4 | Weekdays: Sydney as above. Weekends: London 8–11 AM GMT → 9 AM–12 PM BST. |

Windows are defined per weekday, so a mentor's day off is just a missing seed row; no code change is needed. The README will say so.

The seed also adds a few bookings relative to "now" so that the full state is visible on first run: tomorrow's UK shift is fully booked, and one mentor is at the cap. The US West late slots (06:30–08:30 IST) are covered only by M7 and M8, which is the scarcity case the assignment strategy is designed for.

## 5. Data model (Postgres 16)

All instants are `timestamptz`, the session time zone is UTC, and zones are IANA names stored as `text`.

```
mentors              id uuid pk, name text, email text, timezone text
availability_windows id uuid pk, mentor_id fk, weekday smallint (1=Mon, mentor-local, of shift start),
                     start_local time, duration_min int CHECK (duration_min > 0 AND duration_min % 60 = 0)
bookings             id uuid pk, mentor_id fk, start_utc timestamptz, end_utc timestamptz,
                     shift_date date, status text CHECK (status IN ('confirmed','cancelled')),
                     parent_name, parent_email, parent_email_norm, child_name, child_name_norm,
                     child_grade smallint, phone text null, parent_timezone text,
                     class_link text, created_at timestamptz
  UNIQUE (mentor_id, start_utc) WHERE status = 'confirmed'      -- backstop against double-booking
  INDEX  (mentor_id, shift_date) WHERE status = 'confirmed'     -- cap count
  INDEX  (parent_email_norm, child_name_norm, start_utc)        -- duplicate-trial check
idempotency_keys     key text pk, request_hash text, booking_id uuid null,
                     response_status int, response_body jsonb, created_at timestamptz
outbox_messages      id uuid pk, booking_id fk, recipient ('parent'|'mentor'), to_email,
                     subject, body_text, created_at
```

Slots are **computed, not stored**. `shift_date` is stored on each booking so the cap query is a single indexed count. `status` exists only so the partial unique index still works if cancellation is added later.

### Booking transaction (`POST /api/bookings`)

```
BEGIN (READ COMMITTED)
1  INSERT idempotency_keys ... ON CONFLICT DO NOTHING
     conflict → ROLLBACK; same request_hash → replay stored response; different → 422
     (a concurrent duplicate key blocks on the PK until the first request commits, then replays)
2  pg_advisory_xact_lock(hash(email_norm, child_norm))     -- serialises the duplicate-trial check
3  upcoming trial for (email_norm, child_norm)? → 409 DUPLICATE_TRIAL
4  validate slot: on grid, inside booking window, covered by ≥1 window → else 422 / 409 TOO_SOON
5  SELECT ... FROM mentors WHERE id = ANY(:covering) ORDER BY id FOR UPDATE
     -- lock every candidate in id order: avoids deadlocks, closes the cap race
6  with the rows locked, re-read bookings → eligible = not busy at slot AND count(shift_date) < cap
     none → 409 SLOT_UNAVAILABLE + alternatives
7  strategy.rank(eligible, snapshot)[0] → INSERT booking, 2 outbox rows, finalise idempotency row
COMMIT
```

Step 5 is what makes "quietly try the next mentor" correct: the strategy runs on data that no other transaction can change until we commit. A plain unique constraint can't prevent the cap race, where two different slots for the same mentor and shift both read count=1; the row lock does. Contention is limited to at most 10 rows, and at about 20 bookings a day the cost is negligible.

## 6. Mentor assignment

```ts
interface AssignmentStrategy {
  readonly name: string;
  rank(slot: Slot, eligible: MentorState[], snapshot: ShiftSnapshot): MentorState[]; // pure, deterministic
}
```

The strategy is chosen with `ASSIGNMENT_STRATEGY=capacity-preserving|fair-load`. The booking service depends only on the interface, and ranking does no I/O.

- **fair-load:** fewest bookings on the shift date, then `mentor.id`.
- **capacity-preserving** (default): assign the mentor whose *remaining* availability is least scarce, so mentors who cover rare hours stay free. For candidate *m*:
  `scarcity(m) = Σ 1 / k(s)` over *m*'s other open, bookable slots *s* in the same shift, where `k(s)` is the number of mentors eligible at *s*.
  Rank by scarcity ascending (compared with ε = 1e-9), then fewest bookings, then `mentor.id`.

**Example.** M4, M5 and M6 each have 1 booking at 01:30 IST, M7 and M8 have none, and a parent books 04:30 IST (6 PM New York / 3 PM Los Angeles).
`scarcity(M4) = 1/3 + 1/3 + 1/5 = 0.87` (slots 02:30, 03:30, 05:30). `scarcity(M7) = 1/5 + 3 × 1/2 = 1.70` (05:30, 06:30–08:30).
Capacity-preserving picks **M4**. Fair-load would pick M7 and use up one of only four bookings available for the 06:30–08:30 IST slots, which only M7 and M8 cover.

This is a greedy heuristic, not an optimum. Optimal assignment is a matching problem over future demand we don't know. The README will explain this.

## 7. Time display rules

- The format is `Thu 12 Nov, 4:00 PM New York time (GMT-5)`. The offset is computed **for that instant** with `Intl`/Luxon and never stored.
- The zone label is the last segment of the IANA id, with `_` turned into a space (`America/Indiana/Indianapolis` → "Indianapolis time"). Overrides: `Asia/Kolkata` and `Asia/Calcutta` → "India time"; `UTC` → "UTC". Abbreviations (IST, BST, CST, EST) are **never** shown.
- In the slot grid, the day header carries the date and zone ("Thu 12 Nov · New York time (GMT-5)") and each button shows only the time. If the offsets within one day differ (a transition day), every button shows its own offset. Any time shown on its own (confirmation, emails, alternatives, errors, mentor page) uses the full format.
- On the mentor side the main line is India time, followed by the parent's time: "Parent's time: Thu 12 Nov, 4:00 PM New York time (GMT-5)".
- Parent-local days are found by converting local midnight in that zone, never by adding 24h, because a DST day lasts 23h or 25h.
- The .ics file uses UTC `DTSTART…Z`, so calendar clients convert it and no VTIMEZONE is needed.

## 8. Error and empty states

| Situation | What the parent sees |
|---|---|
| Slot inside the 4h notice | Greyed out: "Too soon — bookings close 4 hours before class" |
| Every covering mentor booked at that time | Greyed out: "All mentors are booked at this time" |
| Every covering mentor at the daily cap | Greyed out: "Our mentors have reached their class limit for this day" |
| Day with no open slots | Greyed slots with reasons, plus "Next available: Fri 13 Nov, 4:00 PM New York time (GMT-5)" (one click) |
| Nothing open in the next 14 days | "All trial slots for the next 2 weeks are taken — new times open daily." |
| 409 on submit (slot taken mid-form) | "Someone just booked 4:00 PM. Nearest times:" then ≤5 alternatives. One click rebooks with a new idempotency key and the form data kept. |
| Duplicate trial | "Aanya already has a trial on Fri 13 Nov, 4:00 PM New York time (GMT-5)" with a link to that booking |
| Validation error | Inline per field |
| Network error or 5xx | Retry with the **same** idempotency key (safe to repeat) |
| Zone not detected or invalid | Falls back to the manual picker with US/UK/CA/AU zones first |

Greyed-out reason precedence: `TOO_SOON` → `DAILY_LIMIT_REACHED` (every covering mentor at the cap) → `FULLY_BOOKED`. Only times inside at least one mentor's window are shown.

**Alternatives:** open slots on the same *parent-local* day as the request, ordered by distance from the requested time, followed by slots on the following days in time order, up to 5.

## 9. API

Errors use the envelope `{ "error": { "code", "message", "details"? } }`. Every time in the API is UTC ISO-8601, and the client formats it.

| Method & path | Purpose |
|---|---|
| `GET /api/slots?tz=&from=&to=` | Slots grouped by parent-local date (`from`/`to` are `YYYY-MM-DD` in `tz`, default is the full horizon). `{ timezone, days: [{ date, slots: [{ startUtc, endUtc, available, reason? }] }] }` |
| `GET /api/slots/alternatives?startUtc=&tz=` | Up to 5 alternatives (§8) |
| `POST /api/bookings` | Header `Idempotency-Key` (required, UUID). Body `{ startUtc, parentTimezone, parentName, parentEmail, phone?, childName, childGrade }` |
| `GET /api/bookings/:id` | Booking (parent view) |
| `GET /api/bookings/:id/calendar.ics` | Calendar file |
| `GET /api/mentors` · `GET /api/mentors/:id/bookings?from=&to=` | Mentor page |
| `GET /api/outbox` | Mock emails, newest first |
| `GET /api/health` | Liveness + DB check |

`POST /api/bookings` responses:

| Status | Code | Body extras |
|---|---|---|
| 201 | — | `{ id, startUtc, endUtc, parentTimezone, child, parent, mentor: { id, name, timezone }, classLink, icsUrl }` |
| 200 | — | Idempotent replay of the original response. Header `Idempotent-Replayed: true`. |
| 400 | `IDEMPOTENCY_KEY_MISSING` | |
| 409 | `SLOT_UNAVAILABLE` | `reason` (`FULLY_BOOKED` \| `DAILY_LIMIT_REACHED` \| `TOO_SOON`), `alternatives[]` |
| 409 | `DUPLICATE_TRIAL` | `existingBooking` |
| 422 | `VALIDATION_ERROR` | per-field `details` (including invalid IANA zone, off-grid start, outside the horizon) |
| 422 | `IDEMPOTENCY_KEY_REUSED` | same key, different payload |

The class link is `https://class.example.com/trial/<booking-id>`. It uses a reserved domain, so it can't be mistaken for a real Codeyoung URL.

## 10. Architecture and stack

- **TypeScript** (strict) throughout, npm workspaces:
  - `apps/web`: React + Vite
  - `apps/api`: **Express 5**, which passes errors from async handlers to the error middleware without wrappers, plus **zod** for validation
  - `packages/shared`: zod schemas, API types, and time formatting used by both the UI and the outbox
- **Postgres 16** through `pg` with plain SQL. No ORM, so the `FOR UPDATE` locking is visible in the repository code. Migrations are numbered `.sql` files applied by a ~40-line runner that tracks them in a `schema_migrations` table.
- Layers in the API: `routes` (HTTP + zod) → `services` (BookingService, SlotService; receive `Clock`, `AssignmentStrategy`, repositories) → `domain` (pure: slot generation, eligibility, reasons, alternatives, strategies) → `repositories` (SQL). See CLAUDE.md for the rules.
- Time: **Luxon** on top of Node's full ICU.

### Why Postgres (not Mongo)

The hard part of this system is a transaction across several rows: check the cap across a mentor's bookings, check the duplicate trial, insert the booking, and write the outbox and idempotency rows, all atomically and under concurrency. Postgres provides that directly with row locks (`SELECT … FOR UPDATE`), partial unique indexes (`UNIQUE (mentor_id, start_utc) WHERE status='confirmed'`), advisory locks and `timestamptz`. MongoDB can do multi-document transactions, but it needs a replica set even locally, it has no `FOR UPDATE`, so the cap race would need a counter document or optimistic retries, and it has no partial unique index on a time-dependent condition. The data is small, relational and fixed in shape, which is what a relational database is for.

### Dependencies (complete list; anything else needs approval)

| Workspace | Runtime | Dev |
|---|---|---|
| root | — | `typescript`, `concurrently` (runs api + web from one `npm run dev`), `prettier` |
| shared | `luxon`, `zod` | `vitest`, `@types/luxon` |
| api | `express`, `pg`, `zod`, `luxon` | `tsx`, `vitest`, `supertest`, `@types/node`, `@types/express`, `@types/pg`, `@types/supertest` |
| web | `react`, `react-dom`, `react-router-dom` | `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react` |
| P2 | — | `@playwright/test` |

There is no data-fetching library (plain `fetch` + small hooks), no CSS framework (CSS modules), no uuid package (`crypto.randomUUID`) and no migration library.

### Running

| Mode | Commands |
|---|---|
| Full stack in Docker | `docker compose up --build` starts Postgres, runs migrate + seed, then the API on :3001 and the web app on :5173 |
| Postgres only in Docker | `docker compose up -d db` → `npm install` → `npm run db:setup` (migrate + seed) → `npm run dev` (API + web together) |
| Tests | `docker compose up -d db` → `npm test`. Integration tests use a separate `booking_test` database, which is migrated on setup and truncated between tests. |

Config (env, validated with zod at startup, `.env.example` provided): `DATABASE_URL`, `PORT=3001`, `MIN_NOTICE_MINUTES=240`, `BOOKING_HORIZON_DAYS=14`, `MENTOR_DAILY_CAP=2`, `ASSIGNMENT_STRATEGY=capacity-preserving`, `NOW_OVERRIDE` (dev only).

## 11. Test matrix

Unit tests cover pure domain code and formatting with an injected clock. Integration tests run against Postgres. Times in **bold** are the expected display.

### DST and time zones

| ID | Scenario | Given | Expected |
|---|---|---|---|
| T1 | US spring forward (Sun 14 Mar 2027) | NY slots for 13 Mar and 14 Mar | 13 Mar first slot `2027-03-13T20:00Z` = **3:00 PM (GMT-5)**. 14 Mar first slot `2027-03-14T20:00Z` = **4:00 PM (GMT-4)**. Same IST shift start (01:30). |
| T2 | NY day length, spring | `GET /slots?tz=America/New_York&from=to=2027-03-14` | Only instants in `[2027-03-14T05:00Z, 2027-03-15T04:00Z)`, a 23h day |
| T3 | Gap formatting | `2027-03-14T06:59Z` / `07:00Z` in NY | **1:59 AM (GMT-5)** / **3:00 AM (GMT-4)**. A 2:xx AM time never appears. |
| T4 | US on DST, UK not yet (20 Mar 2027) | `2027-03-20T20:00Z` | **8:00 PM London time (GMT+0)**, **4:00 PM New York time (GMT-4)**. The gap is 4h, not 5h. |
| T5 | UK spring forward (Sun 28 Mar 2027) | London slots, 27 Mar vs 28 Mar | 27 Mar first `15:00Z` = **3:00 PM (GMT+0)**. 28 Mar first `15:00Z` = **4:00 PM (GMT+1)**. |
| T6 | UK fall back (Sun 31 Oct 2027) | London slots, 30 Oct vs 31 Oct | 30 Oct first `15:00Z` = **4:00 PM (GMT+1)**. 31 Oct = **3:00 PM (GMT+0)**. |
| T7 | UK back, US not yet (3 Nov 2027) | `2027-11-03T20:00Z` | **8:00 PM London (GMT+0)**, **4:00 PM New York (GMT-4)** |
| T8 | US fall back (Sun 7 Nov 2027) | NY slots, 6 Nov vs 7 Nov; LA same | NY: 6 Nov first `20:00Z` = **4:00 PM (GMT-4)**, 7 Nov = **3:00 PM (GMT-5)**. LA: 6 Nov `23:00Z` = **4:00 PM (GMT-7)**, 7 Nov = **3:00 PM (GMT-8)**. |
| T9 | NY day length, autumn | `from=to=2027-11-07` in NY | Window `[2027-11-07T04:00Z, 2027-11-08T05:00Z)`, a 25h day |
| T10 | Ambiguous hour | `2027-11-07T05:30Z` / `06:30Z` in NY | **1:30 AM (GMT-4)** / **1:30 AM (GMT-5)**, told apart by the offset |
| T11 | Sydney DST ends (Sun 4 Apr 2027) | `2027-04-03T05:00Z` / `2027-04-04T05:00Z` | **4:00 PM Sydney time (GMT+11)** / **3:00 PM (GMT+10)** |
| T12 | Sydney DST starts (Sun 3 Oct 2027) | `2027-10-02T05:00Z` / `2027-10-03T05:00Z` | **3:00 PM (GMT+10)** / **4:00 PM (GMT+11)** |
| T13 | Brisbane (no DST) vs Sydney | `2026-11-20T05:00Z` | **3:00 PM Brisbane time (GMT+10)**, **4:00 PM Sydney time (GMT+11)** |
| T14 | Arizona | `2027-01-16T23:00Z` / `2027-03-20T23:00Z` | Phoenix **4:00 PM (GMT-7)** both times. LA **3:00 PM (GMT-8)**, then **4:00 PM (GMT-7)**. |
| T15 | Labels | Formatter over Kolkata, Calcutta, Dublin, Indianapolis, UTC | "India time (GMT+5:30)", "India time", "Dublin time (GMT+1)" in July, "Indianapolis time", "UTC". The output never contains `IST`, `BST`, `EST`, `CST`. |
| T16 | Mentor side | Booking `2027-03-14T21:00Z`, parent in NY | Mentor: **Mon 15 Mar, 2:30 AM India time (GMT+5:30)**. Parent: **Sun 14 Mar, 5:00 PM New York time (GMT-4)**. |

### Capacity, assignment, booking rules

| ID | Scenario | Expected |
|---|---|---|
| C1 | Shift crosses midnight | M1 booked 23:30 IST 27 Mar and 00:30 IST 28 Mar, both with shift date 27 Mar. A third booking in that shift goes to another mentor. M1 can be booked at 20:30 IST on 28 Mar (new shift date). |
| C2 | Cap reached | A mentor with 2 bookings in a shift is never assigned in that shift. If all covering mentors are at the cap, the reason is `DAILY_LIMIT_REACHED`. |
| C3 | Fall-through | The preferred mentor is busy at the slot, another is free → 201 with the other mentor, no 409 |
| C4 | Slot exhausted | All covering mentors busy → 409 `FULLY_BOOKED` with ≤5 alternatives, none of them unavailable |
| C5 | Capacity-preserving | The §6 example picks M4. Fair-load picks M7. |
| C6 | Determinism | Shuffled input order → same ranking. Ties broken by bookings, then id. |
| C7 | Notice boundary | `start = now + 3h59m` → `TOO_SOON`. `now + 4h` → bookable. `now + 14d` → bookable. Later → 422. |
| C8 | Grid and window | Off-grid start (`…T20:30Z`) → 422. On grid but outside every window → 422. |
| C9 | Duplicate trial | Same email + child (different case and spacing) with an upcoming trial → 409 `DUPLICATE_TRIAL`. Same email, different child → 201. Allowed again once the first trial is in the past. |
| C10 | Alternatives order | Same parent-local day by distance first, then following days in time order, max 5. Parent-local day boundaries are respected on 23h/25h days. |
| C11 | Seed validation | Overlapping or off-grid windows are rejected at seed time. |

### Concurrency and idempotency (integration, Postgres)

| ID | Scenario | Expected |
|---|---|---|
| X1 | Same slot race | 20 parallel POSTs for one slot with 3 eligible mentors → exactly 3 × 201 on 3 distinct mentors, 17 × 409. Repeated 20 times. |
| X2 | Cap race | 6 parallel POSTs for 3 different slots that only one mentor (0 bookings) covers in a shift → exactly 2 × 201, and `count(shift) = 2` |
| X3 | Same idempotency key, concurrent | Identical payload twice in parallel → 1 booking, identical bodies, one response replayed |
| X4 | Key reuse | Same key, different `startUtc` → 422 `IDEMPOTENCY_KEY_REUSED` |
| X5 | Duplicate-trial race | Same email + child, 2 different slots in parallel → 1 × 201, 1 × 409 `DUPLICATE_TRIAL` |
| X6 | Outbox | Every 201 writes exactly 2 outbox rows: the parent's in the parent zone, the mentor's in India time with the parent's time as a secondary line |

### UI (component tests, plus one Playwright happy path)

The detected zone is shown with a working override. Greyed slots show their reason. The 409 modal rebooks with one click. The confirmation shows date, time, zone, mentor and link. The .ics download works.

---

## 12. Build order

This is a 1–2 day assignment. Each phase must be complete (working, tested, documented) before the next one starts.

**P0: core, must ship**
- Slot generation and time formatting, with DST/zone tests T1–T16.
- Booking transaction with the cap, mentor locking and fall-through. Tests C1–C8, C11, X1, X2.
- Assignment strategy interface with capacity-preserving (C5, C6). If capacity-preserving takes too long, ship fair-load first behind the same interface and add capacity-preserving afterwards.
- Basic UI: zone bar with override, date strip, slot grid with greyed-out reasons, booking form, confirmation page.
- In P0, a 409 response returns `alternatives: []` and `Idempotency-Key` is accepted but not enforced.

**P1: complete the flow**
- Alternatives and the one-click rebook from the 409 modal (C10).
- Duplicate-trial check (C9, X5).
- Idempotency enforced (X3, X4).
- Outbox writes and the outbox page (X6).
- .ics download.

**P2: polish**
- Mentor page.
- Playwright happy path.
- Visual polish, empty states, README screenshots.
