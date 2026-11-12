import { useEffect, useRef } from 'react';
import { formatDate, localDayBounds } from '@codeyoung/shared';
import { copy } from '../../copy.js';
import { dayStatus, type Day, type DayStatus } from '../../lib/days.js';
import styles from './DateStrip.module.css';

interface DateStripProps {
  days: readonly Day[];
  zone: string;
  today: string;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

function statusText(status: DayStatus): string {
  switch (status.kind) {
    case 'open':
      return copy.dayOpen(status.count);
    case 'full':
      return copy.dayFull;
    case 'closed':
      return copy.dayClosed;
    case 'none':
      return copy.dayNoClasses;
  }
}

/** Horizontal day picker. Each day says in words whether it has open times. */
export function DateStrip({ days, zone, today, selectedDate, onSelect }: DateStripProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedDate]);

  return (
    <section className={styles.section} aria-labelledby="dates-heading">
      <h2 id="dates-heading" className={styles.heading}>
        {copy.datesHeading}
      </h2>
      <ul className={styles.strip}>
        {days.map((day) => {
          const status = dayStatus(day);
          const [weekday, ...rest] = formatDate(
            localDayBounds(day.date, zone).startUtc,
            zone,
          ).split(' ');
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;
          const label = isToday ? copy.today : weekday;
          return (
            <li key={day.date} className={styles.item}>
              <button
                type="button"
                ref={isSelected ? selectedRef : undefined}
                className={[
                  styles.chip,
                  styles[status.kind],
                  isToday ? styles.today : '',
                  isSelected ? styles.selected : '',
                ].join(' ')}
                aria-current={isSelected ? 'date' : undefined}
                onClick={() => onSelect(day.date)}
              >
                <span className={styles.weekday}>{label}</span>
                <span className={styles.date}>{rest.join(' ')}</span>
                <span className={styles.status}>
                  <span aria-hidden="true">
                    {status.kind === 'open' ? <span className={styles.dot} /> : '✕'}
                  </span>
                  {statusText(status)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
