-- All instants are timestamptz (stored as UTC). Zones are IANA names. See SPEC.md §5.

CREATE TABLE mentors (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL UNIQUE,
  timezone   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Recurring weekly windows in the mentor's own zone. weekday = ISO weekday of the shift start.
CREATE TABLE availability_windows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id    uuid NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_local  time NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min > 0 AND duration_min % 60 = 0 AND duration_min <= 1440)
);
CREATE INDEX availability_windows_mentor_idx ON availability_windows (mentor_id);

CREATE TABLE bookings (
  id                uuid PRIMARY KEY,
  mentor_id         uuid NOT NULL REFERENCES mentors (id),
  start_utc         timestamptz NOT NULL,
  end_utc           timestamptz NOT NULL,
  -- Mentor-local date the availability window started on (SPEC A3). The daily cap counts these.
  shift_date        date NOT NULL,
  status            text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  parent_name       text NOT NULL,
  parent_email      text NOT NULL,
  parent_email_norm text NOT NULL,
  child_name        text NOT NULL,
  child_name_norm   text NOT NULL,
  child_grade       smallint NOT NULL CHECK (child_grade BETWEEN 1 AND 12),
  phone             text,
  parent_timezone   text NOT NULL,
  class_link        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (end_utc = start_utc + interval '60 minutes')
);
-- Backstop against double-booking a mentor; the booking transaction's row lock is the main guard.
CREATE UNIQUE INDEX bookings_mentor_start_uniq ON bookings (mentor_id, start_utc) WHERE status = 'confirmed';
CREATE INDEX bookings_mentor_shift_idx ON bookings (mentor_id, shift_date) WHERE status = 'confirmed';
CREATE INDEX bookings_parent_child_idx ON bookings (parent_email_norm, child_name_norm, start_utc);
CREATE INDEX bookings_start_idx ON bookings (start_utc) WHERE status = 'confirmed';

CREATE TABLE idempotency_keys (
  key             text PRIMARY KEY,
  request_hash    text NOT NULL,
  booking_id      uuid REFERENCES bookings (id),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings (id),
  recipient  text NOT NULL CHECK (recipient IN ('parent', 'mentor')),
  to_email   text NOT NULL,
  subject    text NOT NULL,
  body_text  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_messages_created_idx ON outbox_messages (created_at DESC);
