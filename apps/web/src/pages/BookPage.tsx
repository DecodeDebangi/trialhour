import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  formatInstant,
  formatTime,
  isDaytime,
  localDateOf,
  type BookingResponse,
  type SlotDto,
} from '@codeyoung/shared';
import type { ApiError } from '../api/client.js';
import { Layout } from '../components/Layout.js';
import { Notice } from '../components/Notice.js';
import { copy } from '../copy.js';
import { BookingForm, type ParentPrefill } from '../features/booking/BookingForm.js';
import { DateStrip } from '../features/booking/DateStrip.js';
import { SlotGrid } from '../features/booking/SlotGrid.js';
import { ZoneBar } from '../features/booking/ZoneBar.js';
import { useSlots } from '../hooks/useSlots.js';
import { useTimezone } from '../hooks/useTimezone.js';
import { now } from '../lib/clock.js';
import { defaultDate, nextOpenSlot, SHOW_ALL, type SlotFilter } from '../lib/days.js';
import styles from './BookPage.module.css';

function Skeleton() {
  return (
    <div aria-busy="true">
      <p className="visually-hidden" role="status">
        {copy.loadingTimes}
      </p>
      <div className={styles.skeletonStrip} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.skeletonChip} />
        ))}
      </div>
      <div className={styles.skeletonGrid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={styles.skeletonSlot} />
        ))}
      </div>
    </div>
  );
}

export function BookPage() {
  const { zone, setZone } = useTimezone();
  const slots = useSlots(zone);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const prefill = (useLocation().state as { prefill?: ParentPrefill } | null)?.prefill;

  // The chosen slot itself, not just its start: after a 409 the refreshed list shows it as
  // booked, but the form (and everything the parent typed) must stay on screen.
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusStart, setFocusStart] = useState<string | null>(null);
  const [formInView, setFormInView] = useState(false);
  // Early-morning and late-night times (outside 7 AM–9 PM for the parent) are opt-in.
  const [showNight, setShowNight] = useState(false);
  const timesHeadingRef = useRef<HTMLHeadingElement>(null);

  const days = useMemo(() => slots.data?.days ?? [], [slots.data]);
  // Work out once per data load which starts are daytime for this parent.
  const daytimeStarts = useMemo(
    () =>
      new Set(
        zone
          ? days.flatMap((d) =>
              d.slots.filter((s) => isDaytime(s.startUtc, zone)).map((s) => s.startUtc),
            )
          : [],
      ),
    [days, zone],
  );
  const isDaytimeSlot = useCallback<SlotFilter>(
    (s) => daytimeStarts.has(s.startUtc),
    [daytimeStarts],
  );
  const visible = showNight ? SHOW_ALL : isDaytimeSlot;
  const requested = params.get('date');
  const selectedDate =
    requested && days.some((d) => d.date === requested) ? requested : defaultDate(days, visible);
  const selectedDay = days.find((d) => d.date === selectedDate) ?? null;
  const anyOpen = useMemo(() => nextOpenSlot(days) !== null, [days]);
  const today = zone ? localDateOf(now().toISOString(), zone) : '';

  const selectDate = useCallback(
    (date: string) => setParams((p) => ({ ...Object.fromEntries(p), date }), { replace: true }),
    [setParams],
  );

  // Changing zone keeps the chosen class (an instant) and moves the strip to its new local date.
  const changeZone = (next: string) => {
    setZone(next);
    if (selectedSlot) selectDate(localDateOf(selectedSlot.startUtc, next));
  };

  const selectSlot = (slot: SlotDto) => {
    setSelectedSlot(slot);
    setNotice(null);
    // Pin the day in the URL: otherwise a refresh after a 409 could re-run "first open day"
    // and move the parent off the day they were looking at.
    if (zone) selectDate(localDateOf(slot.startUtc, zone));
    requestAnimationFrame(() => {
      const form = document.getElementById('booking-form');
      form?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      form?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    });
  };

  const jumpTo = (slot: SlotDto) => {
    if (!zone) return;
    if (!isDaytimeSlot(slot)) setShowNight(true); // never jump to a time that's hidden
    selectDate(localDateOf(slot.startUtc, zone));
    setFocusStart(slot.startUtc);
  };

  const toggleNight = () => {
    // Pin the current day first, so revealing night times never moves the parent to another day.
    if (selectedDate) selectDate(selectedDate);
    setShowNight((v) => !v);
  };

  /** Next open time after `start`: a visible one if possible, else any (the jump reveals it). */
  const nextOpenAfter = (start: string) =>
    nextOpenSlot(days, start, visible) ?? nextOpenSlot(days, start);

  const onBooked = (booking: BookingResponse) =>
    navigate(`/bookings/${booking.id}`, { state: { booking } });

  const onUnavailable = (error: ApiError) => {
    if (selectedSlot && zone) {
      setNotice(copy.slotJustTaken(error.reason, formatInstant(selectedSlot.startUtc, zone)));
    } else {
      setNotice(error.message);
    }
    setSelectedSlot(null);
    slots.reload();
    requestAnimationFrame(() => timesHeadingRef.current?.focus());
  };

  // Sticky "Continue" bar on small screens until the form itself is visible.
  useEffect(() => {
    const form = document.getElementById('booking-form');
    if (!form || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setFormInView(!!entry?.isIntersecting));
    observer.observe(form);
    return () => observer.disconnect();
  }, [selectedSlot]);

  return (
    <Layout>
      <section className={styles.hero}>
        <h1 className={styles.title}>{copy.heroTitle}</h1>
        <ul className={styles.facts}>
          {copy.heroFacts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <ZoneBar zone={zone} onChange={changeZone} />

      {zone && slots.error && !slots.data && (
        <Notice
          tone="error"
          message={slots.error.message}
          actionLabel={copy.tryAgain}
          onAction={slots.reload}
        />
      )}
      {zone && slots.loading && !slots.data && <Skeleton />}

      {zone && slots.data && (
        <>
          {notice && <Notice tone="info" message={notice} />}
          {!anyOpen && <Notice tone="info" message={copy.allFull} />}
          <DateStrip
            days={days}
            zone={zone}
            today={today}
            selectedDate={selectedDate}
            onSelect={selectDate}
            visible={visible}
          />
          {selectedDay && (
            <SlotGrid
              date={selectedDay.date}
              slots={selectedDay.slots}
              zone={zone}
              policy={slots.data.policy}
              selectedStart={selectedSlot?.startUtc ?? null}
              onSelect={selectSlot}
              nextOpenAfter={nextOpenAfter}
              onJumpTo={jumpTo}
              focusStart={focusStart}
              headingRef={timesHeadingRef}
              isDaytimeSlot={isDaytimeSlot}
              showNight={showNight}
              onToggleNight={toggleNight}
            />
          )}
          {selectedSlot && (
            <BookingForm
              key={selectedSlot.startUtc}
              slot={selectedSlot}
              zone={zone}
              prefill={prefill}
              onBooked={onBooked}
              onUnavailable={onUnavailable}
              onSlotsStale={slots.reload}
              onChangeTime={() => {
                setSelectedSlot(null);
                requestAnimationFrame(() => timesHeadingRef.current?.focus());
              }}
            />
          )}
          {selectedSlot && !formInView && (
            <div className={styles.stickyBar}>
              <button
                type="button"
                className={styles.stickyButton}
                onClick={() => selectSlot(selectedSlot)}
              >
                {copy.continueWith(formatTime(selectedSlot.startUtc, zone))} →
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
