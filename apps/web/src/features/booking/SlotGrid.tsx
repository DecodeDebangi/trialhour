import { Fragment, useEffect, useId, useRef, useState } from 'react';
import {
  formatDate,
  formatInstant,
  formatTime,
  localDayBounds,
  offsetLabel,
  zoneLabel,
  type BookingPolicyDto,
  type SlotDto,
  type UnavailableReason,
} from '@codeyoung/shared';
import { copy } from '../../copy.js';
import styles from './SlotGrid.module.css';

interface SlotGridProps {
  date: string;
  slots: readonly SlotDto[];
  zone: string;
  /** Booking rules from the API, used in the reason texts. */
  policy: BookingPolicyDto;
  selectedStart: string | null;
  onSelect: (slot: SlotDto) => void;
  /** First open slot after the given start, anywhere in the horizon. */
  nextOpenAfter: (startUtc: string) => SlotDto | null;
  onJumpTo: (slot: SlotDto) => void;
  /** Move keyboard focus to this slot once it is rendered (after a jump). */
  focusStart?: string | null;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

function reasonMessage(
  reason: UnavailableReason,
  slot: SlotDto,
  zone: string,
  policy: BookingPolicyDto,
): string {
  return copy.unavailableReason(
    reason,
    formatTime(slot.startUtc, zone),
    formatDate(slot.startUtc, zone),
    copy.noticeDuration(policy.minNoticeMinutes),
  );
}

/** Times for one day. Unavailable times explain themselves on tap; nothing relies on hover. */
export function SlotGrid(props: SlotGridProps) {
  const {
    date,
    slots,
    zone,
    policy,
    selectedStart,
    onSelect,
    nextOpenAfter,
    onJumpTo,
    focusStart,
  } = props;
  const [expanded, setExpanded] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  useEffect(() => setExpanded(null), [date, zone]);

  useEffect(() => {
    if (!focusStart) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-start="${focusStart}"]`);
    el?.focus();
    el?.scrollIntoView?.({ block: 'center' });
  }, [focusStart, date]);

  const dayStart = localDayBounds(date, zone).startUtc;
  const dateLabel = formatDate(dayStart, zone);
  const offsets = new Set(slots.map((s) => offsetLabel(s.startUtc, zone)));
  const mixedOffsets = offsets.size > 1; // a DST change happens on this day
  const headerOffset = mixedOffsets ? '' : ` (${[...offsets][0] ?? offsetLabel(dayStart, zone)})`;
  const firstOpen = slots.find((s) => s.available);
  const lastStart = slots.at(-1)?.startUtc ?? dayStart.toISO()!;
  const nextOpenElsewhere = firstOpen ? null : nextOpenAfter(lastStart);

  return (
    <section className={styles.section} aria-labelledby={`${baseId}-heading`}>
      <h2 id={`${baseId}-heading`} className={styles.heading} tabIndex={-1} ref={props.headingRef}>
        {copy.timesHeading}
      </h2>
      <p className={styles.subheading}>
        {dateLabel} · {zoneLabel(zone)}
        {headerOffset}
      </p>

      {slots.length === 0 ? (
        <div className={styles.empty}>
          <p>{copy.noClassesOnDay(dateLabel)}</p>
          {nextOpenElsewhere && (
            <NextOpenButton slot={nextOpenElsewhere} zone={zone} onJumpTo={onJumpTo} />
          )}
        </div>
      ) : (
        <>
          <div className={styles.grid} ref={gridRef}>
            {slots.map((slot) => {
              const time = formatTime(slot.startUtc, zone);
              const offset = mixedOffsets ? offsetLabel(slot.startUtc, zone) : null;
              if (slot.available) {
                const selected = slot.startUtc === selectedStart;
                return (
                  <button
                    key={slot.startUtc}
                    type="button"
                    data-start={slot.startUtc}
                    className={`${styles.slot} ${selected ? styles.selected : ''}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setExpanded(null);
                      onSelect(slot);
                    }}
                  >
                    <span className={styles.time}>{time}</span>
                    {offset && <span className={styles.offset}>{offset}</span>}
                  </button>
                );
              }
              const reason = slot.reason ?? 'FULLY_BOOKED';
              const isOpen = expanded === slot.startUtc;
              const panelId = `${baseId}-panel-${slot.startUtc}`;
              const reasonId = `${baseId}-reason-${slot.startUtc}`;
              const message = reasonMessage(reason, slot, zone, policy);
              const next = nextOpenAfter(slot.startUtc);
              return (
                <Fragment key={slot.startUtc}>
                  <button
                    type="button"
                    data-start={slot.startUtc}
                    className={`${styles.slot} ${styles.unavailable} ${isOpen ? styles.expanded : ''}`}
                    aria-disabled="true"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-describedby={reasonId}
                    onClick={() => setExpanded(isOpen ? null : slot.startUtc)}
                  >
                    <span className={styles.time}>{time}</span>
                    {offset && <span className={styles.offset}>{offset}</span>}
                    <span className={styles.reasonShort}>
                      <span aria-hidden="true">✕</span>
                      {copy.reasonShort[reason]}
                    </span>
                  </button>
                  {/* Outside the button: it describes it without becoming part of its name. */}
                  <span id={reasonId} className="visually-hidden">
                    {message}
                  </span>
                  {isOpen && (
                    <div
                      id={panelId}
                      className={styles.panel}
                      role="region"
                      aria-label={`${time}: ${copy.reasonShort[reason]}`}
                    >
                      <p>{message}</p>
                      {next && <NextOpenButton slot={next} zone={zone} onJumpTo={onJumpTo} />}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
          {!firstOpen && (
            <div className={styles.empty} style={{ marginTop: 'var(--space-3)' }}>
              <p>{copy.noOpenOnDay(dateLabel)}</p>
              {nextOpenElsewhere && (
                <NextOpenButton slot={nextOpenElsewhere} zone={zone} onJumpTo={onJumpTo} />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NextOpenButton({
  slot,
  zone,
  onJumpTo,
}: {
  slot: SlotDto;
  zone: string;
  onJumpTo: (slot: SlotDto) => void;
}) {
  return (
    <button type="button" className={styles.next} onClick={() => onJumpTo(slot)}>
      {copy.nextOpen(formatInstant(slot.startUtc, zone))}
    </button>
  );
}
