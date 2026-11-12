import { Link } from 'react-router-dom';
import {
  formatDate,
  formatTime,
  offsetLabel,
  zoneLabel,
  type BookingResponse,
} from '@codeyoung/shared';
import { copy } from '../../copy.js';
import { CopyLinkButton } from './CopyLinkButton.js';
import styles from './Confirmation.module.css';

/**
 * Parent-facing confirmation. Shows the parent's own time only: the mentor's local time
 * belongs on the mentor side (mentor page, mentor email), not here.
 */
export function ConfirmationView({ booking }: { booking: BookingResponse }) {
  const zone = booking.parentTimezone;
  return (
    <article className={styles.wrap} aria-labelledby="booked-title">
      <div className={styles.hero}>
        <span className={styles.tick} aria-hidden="true">
          ✓
        </span>
        <h1 id="booked-title" className={styles.title} tabIndex={-1}>
          {copy.bookedTitle}
        </h1>
        <p className={styles.lead}>{copy.bookedLead(booking.child.name)}</p>
      </div>

      <dl className={styles.card}>
        <div className={styles.item}>
          <dt>{copy.whenLabel}</dt>
          <dd>
            <span className={styles.when}>
              {formatDate(booking.startUtc, zone)}, {formatTime(booking.startUtc, zone)}
            </span>
            <span className={styles.secondary}>
              {zoneLabel(zone)} ({offsetLabel(booking.startUtc, zone)}) · {copy.durationNote}
            </span>
          </dd>
        </div>
        <div className={styles.item}>
          <dt>{copy.mentorLabel}</dt>
          <dd className={styles.mentor}>{booking.mentor.name}</dd>
        </div>
        <div className={styles.item}>
          <dt>{copy.linkLabel}</dt>
          <dd>
            <CopyLinkButton link={booking.classLink} />
            <a
              className={styles.openLink}
              href={booking.classLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.openLink}
            </a>
          </dd>
        </div>
        <div className={styles.item}>
          <dt>{copy.calendarLabel}</dt>
          <dd>
            <a className={styles.calendarLink} href={booking.icsUrl} download="trial-class.ics">
              {copy.addToCalendar}
            </a>
          </dd>
        </div>
      </dl>

      <div className={styles.emailed}>
        <p>{copy.emailedTo(booking.parent.email)}</p>
        <Link to={`/outbox?booking=${booking.id}`}>{copy.seeOutbox}</Link>
      </div>

      <section className={styles.next} aria-labelledby="next-heading">
        <h2 id="next-heading" className={styles.nextHeading}>
          {copy.nextHeading}
        </h2>
        <ol className={styles.steps}>
          {copy.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <Link
        to="/"
        state={{ prefill: { parentName: booking.parent.name, parentEmail: booking.parent.email } }}
        className={styles.another}
      >
        {copy.anotherChild}
      </Link>
    </article>
  );
}
